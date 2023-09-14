import * as vscode from 'vscode';
import { ROOT_NAME, OUTPUT_FOLDER_NAME } from '../consts';
import { RemoteFileSystemProvider } from './remoteFileSystemProvider';

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

class MisspellingCheckProvider {
    private learntWords: Set<string> = new Set();
    private suggestionCache: Map<string, string[]> = new Map();
    private diagnosticCollection = vscode.languages.createDiagnosticCollection(ROOT_NAME);
    private misspellingActionsProvider = vscode.languages.registerCodeActionsProvider({scheme:ROOT_NAME},
        new class implements vscode.CodeActionProvider {
            constructor(private parent: MisspellingCheckProvider) {}
            public provideCodeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeAction[]> {
                const diagnostic = context.diagnostics[0];
                const actions = this.parent.suggestionCache.get(diagnostic.code as string)
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
        }(this));

    constructor(private readonly vfsm: RemoteFileSystemProvider) {}

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
            this.misspellingActionsProvider,
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

// completions.includes: [path:string] <-- /\.(?:tex|txt)$/.test(path)
// completions.graphics: [path:string] <-- /\.(eps|jpe?g|gif|png|tiff?|pdf|svg)$/.test(path)
// completions.bibliographies: [path:string] <-- /\.bib$/.test(path)
// "\\include{${path}}"
// "\\input{${path}}"
// "\\includegraphics{${path}}"

export class LangIntellisenseProvider {
    private misspellingCheck: MisspellingCheckProvider;

    constructor(private readonly vfsm: RemoteFileSystemProvider) {
        this.misspellingCheck = new MisspellingCheckProvider(vfsm);
    }

    triggers() {
        return [
            ...this.misspellingCheck.triggers(),
        ];
    }
}
