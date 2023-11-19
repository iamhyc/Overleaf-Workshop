import * as vscode from 'vscode';
import { ROOT_NAME, ELEGANT_NAME } from './consts';

import { RemoteFileSystemProvider, VirtualFileSystem } from './core/remoteFileSystemProvider';
import { ProjectManagerProvider } from './core/projectManagerProvider';
import { PdfViewEditorProvider } from './core/pdfViewEditorProvider';
import { CompileManager } from './compile/compileManager';
import { LangIntellisenseProvider } from './intellisense/langIntellisenseProvider';

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

    // activate vfs for local replica
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders?.length===1 && workspaceFolders[0].uri.scheme==='file') {
        const workspaceRoot = workspaceFolders[0].uri;
        const settingUri = vscode.Uri.joinPath(workspaceRoot, '.overleaf', 'settings.json');
        vscode.workspace.fs.readFile(settingUri).then(async content => {
            const setting = JSON.parse( new TextDecoder().decode(content) );
            if (setting.uri) {
                const uri = vscode.Uri.parse(setting.uri);
                if (uri.scheme===ROOT_NAME) {
                    const vfs = (await (await vscode.commands.executeCommand('remoteFileSystem.prefetch', uri))) as VirtualFileSystem;
                    await vfs.init();
                    vscode.commands.executeCommand('setContext', `${ROOT_NAME}.activate`, true);
                }
            }
        });
    }
}

export function deactivate() {
    vscode.commands.executeCommand('setContext', `${ROOT_NAME}.activate`, false);
}