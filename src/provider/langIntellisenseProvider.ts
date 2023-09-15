import * as vscode from 'vscode';
import { ROOT_NAME, OUTPUT_FOLDER_NAME } from '../consts';
import { RemoteFileSystemProvider } from './remoteFileSystemProvider';

type PathFileType = 'text' | 'image' | 'bib';

export interface CompletionItem {
    meta: string,
    score: number,
    caption: string,
    snippet: string,
}

export interface MisspellingItem {
    index: number,
    suggestions: string[]
}

function* sRange(start:number, end:number) {
    for (let i = start; i <= end; i++) {
        yield i;
    }
}

abstract class IntellisenseProvider {
    protected selector = {scheme:ROOT_NAME};
    protected abstract readonly contextPrefix: string[][];

    constructor(protected readonly vfsm: RemoteFileSystemProvider) {}
    abstract triggers(): vscode.Disposable[];

    protected get contextRegex() {
        const prefix = this.contextPrefix
                        .map(group => `\\\\(${group.join('|')})`)
                        .join('|');
        const postfix = String.raw`(\[[^\]]*\])*\{([^\}]*)\}?$`;
        return new RegExp(`(?:${prefix})` + postfix);
    }
}

class MisspellingCheckProvider extends IntellisenseProvider implements vscode.CodeActionProvider {
    private learntWords: Set<string> = new Set();
    private suggestionCache: Map<string, string[]> = new Map();
    private diagnosticCollection = vscode.languages.createDiagnosticCollection(ROOT_NAME);
    protected readonly contextPrefix = [];

    private splitText(text: string) {
        return text.split(/([\W\d_]*\\[a-zA-Z]*|[\W\d_]+)/mug);
    }

    private async check(uri:vscode.Uri, changedText: string) {
        const splits = this.splitText(changedText);
        const words = splits.filter((x, i) => i%2===0 && x.length>1)
                            .filter(x => !this.suggestionCache.has(x))
                            .filter(x => !this.learntWords.has(x));
        if (words.length === 0) { return; }
        const uniqueWords = new Set(words);
        const uniqueWordsArray = [...uniqueWords];

        // update suggestion cache and learnt words
        const vfs = await this.vfsm.prefetch(uri);
        const misspellings = await vfs.spellCheck(uri, uniqueWordsArray);
        if (misspellings) {
            misspellings.forEach(misspelling => {
                uniqueWords.delete(uniqueWordsArray[misspelling.index]);
                this.suggestionCache.set(uniqueWordsArray[misspelling.index], misspelling.suggestions);
            });
        }
        uniqueWords.forEach(x => this.learntWords.add(x));

        // restrict cache size
        if (this.suggestionCache.size > 1000) {
            const keys = [...this.suggestionCache.keys()];
            keys.slice(0, 100).forEach(key => this.suggestionCache.delete(key));
        }
    }

    private async updateDiagnostics(uri:vscode.Uri, range?: vscode.Range) {
        // remove affected diagnostics
        let diagnostics = this.diagnosticCollection.get(uri) || [];
        if (range===undefined) {
            diagnostics = [];
        } else {
            diagnostics = diagnostics.filter(x => !x.range.intersection(range));
        }

        // update diagnostics
        const newDiagnostics:vscode.Diagnostic[] = [];
        const document = await vscode.workspace.openTextDocument(uri);
        const startLine = range ? range.start.line : 0;
        const endLine = range ? range.end.line : document.lineCount-1;
        for (const i of sRange(startLine, endLine)) {
            const cumsum = (sum => (value: number) => sum += value)(0);
            const splits = this.splitText( document.lineAt(i).text );
            const splitStart = splits.map(x => cumsum(x.length));
            const words = splits.filter((_, i) => i%2===0);
            const wordEnds = splitStart.filter((_, i) => i%2===0);
            //
            words.forEach((word, j) => {
                if (this.suggestionCache.has(word)) {
                    const range = new vscode.Range(
                        new vscode.Position(i, wordEnds[j] - word.length),
                        new vscode.Position(i, wordEnds[j])
                    );
                    const message = `${word}: Unknown word.`;
                    const diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Information);
                    diagnostic.source = 'Spell Checker';
                    diagnostic.code = word;
                    newDiagnostics.push(diagnostic);
                }
            });
        }
        // update diagnostics collection
        diagnostics = [...diagnostics, ...newDiagnostics];
        this.diagnosticCollection.set(uri, diagnostics);
    }

    provideCodeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeAction[]> {
        const diagnostic = context.diagnostics[0];
        const actions = this.suggestionCache.get(diagnostic.code as string)
                        ?.slice(0,8).map(suggestion => {
                            const action = new vscode.CodeAction(suggestion, vscode.CodeActionKind.QuickFix);
                            action.diagnostics = [diagnostic];
                            action.edit = new vscode.WorkspaceEdit();
                            action.edit.replace(document.uri, diagnostic.range, suggestion);
                            return action;
                        });
        //
        const learnAction = new vscode.CodeAction('Add to Dictionary', vscode.CodeActionKind.QuickFix);
        learnAction.diagnostics = [diagnostic];
        learnAction.command = {
            title: 'Add to Dictionary',
            command: 'langIntellisense.learnSpelling',
            arguments: [document.uri, diagnostic.code as string],
        };
        actions?.push(learnAction);
        //
        return actions;
    }

    learnSpelling(uri:vscode.Uri, word: string) {
        this.vfsm.prefetch(uri).then(vfs => vfs.spellLearn(uri, word));
        this.learntWords.add(word);
        this.suggestionCache.delete(word);
        this.updateDiagnostics(uri);
    }

    triggers () {
        return [
            // the diagnostic collection
            this.diagnosticCollection,
            // the code action provider
            vscode.languages.registerCodeActionsProvider(this.selector, this),
            // register learn spelling command
            vscode.commands.registerCommand('langIntellisense.learnSpelling', (uri: vscode.Uri, word: string) => {
                this.learnSpelling(uri, word);
            }),
            // update diagnostics on document open
            vscode.workspace.onDidOpenTextDocument(async doc => {
                if (doc.uri.scheme === ROOT_NAME) {
                    const uri = doc.uri;
                    await this.check( uri, doc.getText() );
                    this.updateDiagnostics(uri);
                }
            }),
            // update diagnostics on text changed
            vscode.workspace.onDidChangeTextDocument(async e => {
                if (e.document.uri.scheme === ROOT_NAME) {
                    const uri = e.document.uri;
                    for (const event of e.contentChanges) {
                        // extract changed text
                        let _range = e.document.validateRange(event.range);
                        const startLine = _range.start.line;
                        if (event.text.endsWith('\n')) {
                            _range = _range.with({end: new vscode.Position(startLine+1, 0)});
                        }
                        const endLine = _range.end.line;
                        const changedText = [...sRange(startLine, endLine)]
                                            .map(i => e.document.lineAt(i).text).join(' ');
                        // update diagnostics
                        await this.check( uri, changedText );
                        this.updateDiagnostics(uri, _range);
                    };
                }
            }),
        ];
    }
}

class CommandCompletionProvider extends IntellisenseProvider {
    protected readonly contextPrefix = [];
    triggers(): vscode.Disposable[] {
        return [];
    }
}

class ConstantCompletionProvider extends IntellisenseProvider implements vscode.CompletionItemProvider {
    private readonly constantData = new Array(4);
    protected readonly contextPrefix = [
        // group 0, class names
        ['documentclass'],
        // group 1, bibliography styles
        ['bibliographystyle'],
        // group 2, environments
        ['begin'],
        // group 3, package names
        ['usepackage'],
    ];

    constructor(
        protected readonly vfsm: RemoteFileSystemProvider,
        private readonly extensionUri: vscode.Uri) {
        super(vfsm);
    }

    private async loadJson(path: string) {
        const uri = vscode.Uri.joinPath(this.extensionUri, path);
        const data = (await vscode.workspace.fs.readFile(uri)).toString();
        return JSON.parse(data);
    }

    private async load(idx: number, force: boolean = false) {
        if (!force && this.constantData[idx]!==undefined) { return; }
        switch (idx) {
            case 0:
                const classNames = await this.loadJson('data/latex/class-names.json') as string[];
                this.constantData[0] = classNames;
                break;
            case 1:
                const bibStyles = (await this.loadJson('data/latex/bibliography-styles.json') as any)['biblatex'] as string[];
                this.constantData[1] = bibStyles;
                break;
            case 3:
                const packageNames = await this.loadJson('data/latex/package-names.json') as string[];
                this.constantData[3] = packageNames;
                break;
            case 2:
                const environments = await this.loadJson('data/latex/environments.json') as any;
                this.constantData[2] = environments['expanded'] as {[K:string]:string};
                (environments['common'] as string[]).forEach(x => {
                    this.constantData[2][x] = `\\begin{${x}}\n\t$1\n\\end{${x}}`;
                });
                break;
            default:
                break;
        }
    }

    private parseMatch(match: RegExpMatchArray) {
        const keywords = match.slice(1, -1);
        const partial = match.at(-1) as string;
        const index = keywords.findIndex(x => x!==undefined);
        const length = match[0].length;
        return {index, partial, length};
    }

    private async getCompletionItems(idx: number, partial:string, wordRange:vscode.Range, wholeRange:vscode.Range): Promise<vscode.CompletionItem[]> {
        await this.load(idx);
        const constants = this.constantData[idx];
        switch (idx) {
            case 0:case 1:case 3:
                return (constants as string[])
                        .filter(x => x.startsWith(partial))
                        .map(x => new vscode.CompletionItem(x, vscode.CompletionItemKind.Module));
            case 2:
                return Object.entries(constants as {[K:string]:string})
                        .filter(([key, value]) => key.startsWith(partial))
                        .map(([key, value]) => {
                            const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Snippet);
                            item.insertText = new vscode.SnippetString(value);
                            item.range = wordRange;
                            item.additionalTextEdits = [vscode.TextEdit.delete(wholeRange)];
                            return item;
                        });
            default:
                return [];
        }
    }

    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): vscode.ProviderResult<vscode.CompletionItem[]> {
        const wordRange = document.getWordRangeAtPosition(position, this.contextRegex);
        if (wordRange) {
            const match = document.getText(wordRange).match(this.contextRegex);
            const {index, partial, length} = this.parseMatch(match as RegExpMatchArray);
            const afterRange = new vscode.Range(position, wordRange.end);
            const wholeRange = new vscode.Range(wordRange.start, wordRange.start.translate(0, length));
            return this.getCompletionItems(index, partial, afterRange, wholeRange);
        }
        return Promise.resolve([]);
    }

    triggers(): vscode.Disposable[] {
        return [
            vscode.languages.registerCompletionItemProvider(this.selector, this, '\\', '{'),
        ];
    }
}

class FilePathCompletionProvider extends IntellisenseProvider implements vscode.CompletionItemProvider, vscode.DocumentLinkProvider {
    private readonly fileRegex:{[K in PathFileType]:RegExp} = {
        'text': /\.(?:tex|txt)$/,
        'image': /\.(eps|jpe?g|gif|png|tiff?|pdf|svg)$/,
        'bib': /\.bib$/
    };
    protected readonly contextPrefix = [
        // group 0: text file
        ['include', 'input'],
        // group 1: image file
        ['includegraphics'],
        // group 2: bib file
        ['bibliography', 'addbibresource'],
    ];

    private parseMatch(match: RegExpMatchArray) {
        const keywords = match.slice(1, -1);
        const path = match.at(-1) as string;
        const type:PathFileType = keywords[0]? 'text' : keywords[1] ? 'image' : 'bib';
        const offset = '\\'.length
                        + (keywords[0]||keywords[1]||keywords[2]||'').length
                        + (keywords.at(-1)||'').length
                        +'{'.length;
        return {path, type, offset};
    }

    private async getCompletionItems(uri:vscode.Uri, path: string, type: PathFileType): Promise<vscode.CompletionItem[]> {
        const matches = path.split(/(.*)\/([^\/]*)/);
        const [parent, child] = (()=>{
            if (matches.length === 1) {
                return ['', matches[0]];
            } else {
                return [matches[1], matches[2]];
            }
        })();
        const _regex = this.fileRegex[type];

        const vfs = await this.vfsm.prefetch(uri);
        const parentUri = vfs.pathToUri( ...parent.split('/') );
        const files = await vfs.list(parentUri);

        return files.map(([name, _type]) => {
            if (_type===vscode.FileType.Directory && name!==OUTPUT_FOLDER_NAME) {
                const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Folder);
                return item;
            } else if (_regex.test(name) && name.startsWith(child)) {
                const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.File);
                return item;
            }
        }).filter(x => x) as vscode.CompletionItem[];
    }

    private async getDocumentLinks(uri:vscode.Uri, document: vscode.TextDocument): Promise<vscode.DocumentLink[]> {
        const text = document.getText();
        const regex = new RegExp(this.contextRegex, 'mg');
        const vfs = await this.vfsm.prefetch(uri);

        const links:vscode.DocumentLink[] = [];
        let match: RegExpExecArray | null;
        while (match = regex.exec(text)) {
            const {path,offset} = this.parseMatch(match);
            const uri = vfs.pathToUri(path);
            try {
                await vfs.resolve(uri);
                const range = new vscode.Range(
                    document.positionAt(match.index + offset),
                    document.positionAt(match.index + offset + path.length)
                );
                links.push(new vscode.DocumentLink(range, uri));
            } catch {}
        }
        return links;
    }

    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): vscode.ProviderResult<vscode.CompletionItem[]> {
        const wordRange = document.getWordRangeAtPosition(position, this.contextRegex);
        if (wordRange) {
            const match = document.getText(wordRange).match(this.contextRegex);
            const {path, type} = this.parseMatch(match as RegExpMatchArray);
            return this.getCompletionItems(document.uri, path, type);
        }
        return Promise.resolve([]);
    }

    provideDocumentLinks(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.DocumentLink[]> {
        return this.getDocumentLinks(document.uri, document);
    }

    triggers(): vscode.Disposable[] {
        const selector = {...this.selector, pattern: '**/*.{tex,txt}'};
        return [
            // register completion provider
            vscode.languages.registerCompletionItemProvider(selector, this, '{', '/'),
            // register document link provider
            vscode.languages.registerDocumentLinkProvider(selector, this),
        ];
    }
}

class ReferenceCompletionProvider extends IntellisenseProvider implements vscode.CompletionItemProvider {
    protected readonly contextPrefix = [
        // group 0: reference
        ['\\w*ref'],
        // group 1: citation
        ['cite'],
    ];

    private parseMatch(match: RegExpMatchArray) {
        const keywords = match.slice(1, -1);
        const index = keywords.findIndex(x => x!==undefined);
        const _match = (match.at(-1) as string).split(/(.*),([^,]*)/);
        const partial = _match.length===1 ? _match[0] : _match[2];
        return {index, partial};
    }

    private async getCompletionItems(uri:vscode.Uri, idx: number, partial:string): Promise<vscode.CompletionItem[]> {
        const vfs = await this.vfsm.prefetch(uri);
        switch (idx) {
            case 0:
                const res = await vfs.metadata();
                if (res===undefined) { return []; };
                return Object.values(res).map(({labels}) => {
                    return labels.map(label => new vscode.CompletionItem(label, vscode.CompletionItemKind.Reference));
                }).flat();
            case 1:
                const bibUri = vfs.pathToUri(`${OUTPUT_FOLDER_NAME}/output.bbl`);
                const content = new TextDecoder().decode( await vfs.openFile(bibUri) );
                const regex = /\\bibitem\{([^\}]*)\}/g;
                const items = new Array<vscode.CompletionItem>();
                let match: RegExpExecArray | null;
                while (match = regex.exec(content)) {
                    const item = new vscode.CompletionItem(match[1], vscode.CompletionItemKind.Reference);
                    items.push(item);
                }
                return items;
            default:
                return [];
        }
    }

    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>> {
        const wordRange = document.getWordRangeAtPosition(position, this.contextRegex);
        if (wordRange) {
            const match = document.getText(wordRange).match(this.contextRegex);
            const {index, partial} = this.parseMatch(match as RegExpMatchArray);
            return this.getCompletionItems(document.uri, index, partial);
        }
        return Promise.resolve([]);
    }

    triggers(): vscode.Disposable[] {
        return [
            vscode.languages.registerCompletionItemProvider(this.selector, this, '\\', '{', ','),
        ];
    }
}

export class LangIntellisenseProvider extends IntellisenseProvider {
    protected readonly contextPrefix = [];
    private commandCompletion: CommandCompletionProvider;
    private constantCompletion: ConstantCompletionProvider;
    private filePathCompletion: FilePathCompletionProvider;
    private misspellingCheck: MisspellingCheckProvider;
    private referenceCompletion: ReferenceCompletionProvider;

    constructor(context: vscode.ExtensionContext, vfsm: RemoteFileSystemProvider) {
        super(vfsm);
        this.commandCompletion = new CommandCompletionProvider(vfsm);
        this.constantCompletion = new ConstantCompletionProvider(vfsm, context.extensionUri);
        this.filePathCompletion = new FilePathCompletionProvider(vfsm);
        this.misspellingCheck = new MisspellingCheckProvider(vfsm);
        this.referenceCompletion = new ReferenceCompletionProvider(vfsm);
    }

    triggers() {
        return [
            ...this.commandCompletion.triggers(),
            ...this.constantCompletion.triggers(),
            ...this.filePathCompletion.triggers(),
            ...this.misspellingCheck.triggers(),
            ...this.referenceCompletion.triggers(),
        ];
    }
}
