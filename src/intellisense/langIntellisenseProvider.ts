import * as vscode from 'vscode';
import { ROOT_NAME } from '../consts';

import { RemoteFileSystemProvider, VirtualFileSystem, parseUri } from '../core/remoteFileSystemProvider';
import { DocSymbolProvider } from './texSymbolProvider';
import { TexDocFormatter } from './texDocumentFormatProvider';
import { MisspellingCheckProvider } from './langMisspellingCheckProvider';
import { CommandCompletionProvider, ConstantCompletionProvider, FilePathCompletionProvider, ReferenceCompletionProvider } from './langCompletionProvider';

export abstract class IntellisenseProvider {
    protected selector = {scheme:ROOT_NAME};
    protected abstract readonly contextPrefix: string[][];

    constructor(protected readonly vfsm: RemoteFileSystemProvider) {}
    abstract get triggers(): vscode.Disposable[];

    protected get contextRegex() {
        const prefix = this.contextPrefix
                        .map(group => `\\\\(${group.join('|')})`)
                        .join('|');
        const postfix = String.raw`(\[[^\]]*\])*\{([^\}\$]*)\}?`;
        return new RegExp(`(?:${prefix})` + postfix);
    }
}



export class LangIntellisenseProvider {
    private status: vscode.StatusBarItem;
    private providers: IntellisenseProvider[];

    constructor(context: vscode.ExtensionContext, private readonly vfsm: RemoteFileSystemProvider) {
        const docSymbolProvider = new DocSymbolProvider(vfsm);
        this.providers = [
            // document symbol provider
            docSymbolProvider,
            // document format provider
            new TexDocFormatter(vfsm),
            // completion provider
            new CommandCompletionProvider(vfsm, context.extensionUri),
            new ConstantCompletionProvider(vfsm, context.extensionUri),
            new FilePathCompletionProvider(vfsm),
            new ReferenceCompletionProvider(vfsm, docSymbolProvider),
            // misspelling check provider
            new MisspellingCheckProvider(vfsm),
        ];
        this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -2);
        this.activate();
    }

    async activate() {
        const uri = vscode.workspace.workspaceFolders?.[0].uri;
        if (uri?.scheme!==ROOT_NAME) { return; }

        const vfs = uri && await this.vfsm.prefetch(uri);
        const languageItem = vfs?.getSpellCheckLanguage();
        if (languageItem) {
            const {name, code} = languageItem;
            this.status.text = code===''? '$(eye-closed)' : '$(eye) ' + code.toLocaleUpperCase();
            this.status.tooltip = new vscode.MarkdownString(`${vscode.l10n.t('Spell Check')}: **${name}**`);
            this.status.tooltip.appendMarkdown(`\n\n*${vscode.l10n.t('Click to manage spell check.')}*`);
        } else {
            this.status.text = '';
            this.status.tooltip = '';
        }
        this.status.command = 'langIntellisense.settings';
        this.status.show();
        setTimeout(this.activate.bind(this), 200);
    }

    get triggers() {
        return [
            // register provider triggers
            ...this.providers.map(x => x.triggers).flat(),
        ];
    }
}
