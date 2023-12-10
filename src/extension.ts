import * as vscode from 'vscode';
import { ROOT_NAME, ELEGANT_NAME } from './consts';

import { RemoteFileSystemProvider, VirtualFileSystem } from './core/remoteFileSystemProvider';
import { ProjectManagerProvider } from './core/projectManagerProvider';
import { PdfViewEditorProvider } from './core/pdfViewEditorProvider';
import { CompileManager } from './compile/compileManager';
import { LangIntellisenseProvider } from './intellisense/langIntellisenseProvider';
import { LocalReplicaSCMProvider } from './scm/localReplicaSCM';
import { DocSymbolProvider } from './intellisense/texDocSymbolProvider';
import { TexDocFormatter } from './intellisense/texDocFormatter';

export function activate(context: vscode.ExtensionContext) {
    // Register: [core] RemoteFileSystemProvider
    const remoteFileSystemProvider = new RemoteFileSystemProvider(context);
    context.subscriptions.push( ...remoteFileSystemProvider.triggers );

    // Register: [core] ProjectManagerProvider on Activitybar
    const projectManagerProvider = new ProjectManagerProvider(context);
    context.subscriptions.push( ...projectManagerProvider.triggers );

    // Register: [core] PdfViewEditorProvider
    const pdfViewEditorProvider = new PdfViewEditorProvider(context);
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(`${ROOT_NAME}.pdfViewer`, pdfViewEditorProvider, {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
            supportsMultipleEditorsPerDocument: false,
        })
    );

    // Register: [compile] CompileManager on Statusbar
    const compileManager = new CompileManager(remoteFileSystemProvider);
    context.subscriptions.push( compileManager.status );
    context.subscriptions.push( ...compileManager.triggers );

    // Register: [intellisense] LangIntellisenseProvider
    const langIntellisenseProvider = new LangIntellisenseProvider(context, remoteFileSystemProvider);
    context.subscriptions.push( ...langIntellisenseProvider.triggers );

    // Register: [intellisense] TexSymbolProvider
    const latexSelector = ['latex', 'latex-expl3', 'pweave', 'jlweave', 'rsweave'].map( (id) => {
       return {language: id };
    });
    context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(latexSelector, new DocSymbolProvider()));

    // Register: [intellisense] TexDocFormatter
    const texDocFormatter = new TexDocFormatter();
    context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider(latexSelector, texDocFormatter));
    context.subscriptions.push(vscode.languages.registerDocumentRangeFormattingEditProvider(latexSelector, texDocFormatter));


    // activate vfs for local replica
    LocalReplicaSCMProvider.readSettings()
    .then(async setting => {
        if (setting?.uri) {
            const uri = vscode.Uri.parse(setting.uri);
            if (uri.scheme===ROOT_NAME) {
                const vfs = (await (await vscode.commands.executeCommand('remoteFileSystem.prefetch', uri))) as VirtualFileSystem;
                await vfs.init();
                vscode.commands.executeCommand('setContext', `${ROOT_NAME}.activate`, true);
            }
        }
    });
}

export function deactivate() {
    vscode.commands.executeCommand('setContext', `${ROOT_NAME}.activate`, false);
}