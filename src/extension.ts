import * as vscode from 'vscode';
import { ROOT_NAME, ELEGANT_NAME } from './consts';

import { RemoteFileSystemProvider } from './provider/remoteFileSystemProvider';
import { ProjectManagerProvider } from './provider/projectManagerProvider';
import { CompileManager } from './utils/compileManager';
import { PdfViewEditorProvider } from './provider/pdfViewEditorProvider';

export function activate(context: vscode.ExtensionContext) {
    // Register: RemoteFileSystemProvider
    const remoteFileSystemProvider = new RemoteFileSystemProvider(context);
    context.subscriptions.push(
        vscode.workspace.registerFileSystemProvider(ROOT_NAME, remoteFileSystemProvider, { isCaseSensitive: true })
    );
    vscode.commands.registerCommand('remoteFileSystem.prefetch', (uri: vscode.Uri) => {
        remoteFileSystemProvider.prefetch(uri);
    });

    // Register: PdfViewEditorProvider
    const pdfViewEditorProvider = new PdfViewEditorProvider(context);
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider('overleaf-workshop.pdfViewer', pdfViewEditorProvider)
    );

    // Register: ProjectManagerProvider on Activitybar
    const projectManagerProvider = new ProjectManagerProvider(context);
    vscode.window.registerTreeDataProvider('projectManager', projectManagerProvider);
    vscode.commands.registerCommand('projectManager.addServer', () => {
        projectManagerProvider.addServer();
    });
    vscode.commands.registerCommand('projectManager.removeServer', (item) => {
        projectManagerProvider.removeServer(item.name);
    });
    vscode.commands.registerCommand('projectManager.loginServer', (item) => {
        projectManagerProvider.loginServer(item);
    });
    vscode.commands.registerCommand('projectManager.logoutServer', (item) => {
        projectManagerProvider.logoutServer(item);
    });
    vscode.commands.registerCommand('projectManager.refreshServer', (item) => {
        projectManagerProvider.refreshServer(item);
    });
    vscode.commands.registerCommand('projectManager.openProjectInCurrentWindow', (item) => {
        projectManagerProvider.openProjectInCurrentWindow(item);
    });
    vscode.commands.registerCommand('projectManager.openProjectInNewWindow', (item) => {
        projectManagerProvider.openProjectInNewWindow(item);
    });

    // Register: CompileManager on Statusbar
    const compileManager = new CompileManager(remoteFileSystemProvider);
    context.subscriptions.push( compileManager.status );
    context.subscriptions.push( ...compileManager.triggers() );
    context.subscriptions.push(vscode.commands.registerCommand('compileManager.compile', () => {
        compileManager.compile();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('compileManager.viewPdf', () => {
        compileManager.openPdf();
    }));
}
