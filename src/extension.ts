import * as vscode from 'vscode';
import { ROOT_NAME, ELEGANT_NAME } from './consts';

import { RemoteFileSystemProvider } from './provider/remoteFileSystemProvider';
import { ProjectManagerProvider } from './provider/projectManagerProvider';
import { CompileManager } from './compile/compileManager';
import { PdfViewEditorProvider } from './provider/pdfViewEditorProvider';
import { LangIntellisenseProvider } from './provider/langIntellisenseProvider';

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
        vscode.window.registerCustomEditorProvider(`${ROOT_NAME}.pdfViewer`, pdfViewEditorProvider, {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
            supportsMultipleEditorsPerDocument: false,
        })
    );

    // Register: LangIntellisenseProvider
    const langIntellisenseProvider = new LangIntellisenseProvider(context, remoteFileSystemProvider);
    context.subscriptions.push( ...langIntellisenseProvider.triggers );

    // Register: ProjectManagerProvider on Activitybar
    const projectManagerProvider = new ProjectManagerProvider(context);
    vscode.window.registerTreeDataProvider('projectManager', projectManagerProvider);
    //
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
    //
    vscode.commands.registerCommand('projectManager.newProject', (item) => {
        projectManagerProvider.newProject(item);
    });
    vscode.commands.registerCommand('projectManager.renameProject', (item) => {
        projectManagerProvider.renameProject(item);
    });
    vscode.commands.registerCommand('projectManager.deleteProject', (item) => {
        projectManagerProvider.deleteProject(item);
    });
    vscode.commands.registerCommand('projectManager.archiveProject', (item) => {
        projectManagerProvider.archiveProject(item);
    });
    vscode.commands.registerCommand('projectManager.unarchiveProject', (item) => {
        projectManagerProvider.unarchiveProject(item);
    });
    vscode.commands.registerCommand('projectManager.trashProject', (item) => {
        projectManagerProvider.trashProject(item);
    });
    vscode.commands.registerCommand('projectManager.untrashProject', (item) => {
        projectManagerProvider.untrashProject(item);
    });
    //
    vscode.commands.registerCommand('projectManager.createTag', (item) => {
        projectManagerProvider.createTag(item);
    });
    vscode.commands.registerCommand('projectManager.renameTag', (item) => {
        projectManagerProvider.renameTag(item);
    });
    vscode.commands.registerCommand('projectManager.deleteTag', (item) => {
        projectManagerProvider.deleteTag(item);
    });
    vscode.commands.registerCommand('projectManager.addProjectToTag', (item) => {
        projectManagerProvider.addProjectToTag(item);
    });
    vscode.commands.registerCommand('projectManager.removeProjectFromTag', (item) => {
        projectManagerProvider.removeProjectFromTag(item);
    });
    //
    vscode.commands.registerCommand('projectManager.openProjectInCurrentWindow', (item) => {
        projectManagerProvider.openProjectInCurrentWindow(item);
    });
    vscode.commands.registerCommand('projectManager.openProjectInNewWindow', (item) => {
        projectManagerProvider.openProjectInNewWindow(item);
    });

    // Register: CompileManager on Statusbar
    const compileManager = new CompileManager(remoteFileSystemProvider);
    context.subscriptions.push( compileManager.status );
    context.subscriptions.push( ...compileManager.triggers );
}
