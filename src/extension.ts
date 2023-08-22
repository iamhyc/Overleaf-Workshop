import * as vscode from 'vscode';
import { ROOT_NAME, ELEGANT_NAME } from './consts';

import { RemoteFileSystemProvider } from './provider/remoteFileSystemProvider';
import { ProjectManagerProvider } from './provider/projectManagerProvider';

export function activate(context: vscode.ExtensionContext) {
    // Register: RemoteFileSystemProvider
    const remoteFileSystemProvider = new RemoteFileSystemProvider(null, null, null);
    context.subscriptions.push(
        vscode.workspace.registerFileSystemProvider(ROOT_NAME, remoteFileSystemProvider, { isCaseSensitive: true })
    );

    // Register: ProjectManagerProvider on Activitybar
    const projectManagerProvider = new ProjectManagerProvider(context);
    vscode.window.registerTreeDataProvider('projectManager', projectManagerProvider);
    vscode.commands.registerCommand('projectManager.addServer', () => {
        projectManagerProvider.addServer();
    });
    vscode.commands.registerCommand('projectManager.removeServer', (item) => {
        projectManagerProvider.removeServer(item);
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

    // Register: commands shortcuts
    let disposable = vscode.commands.registerCommand(`${ROOT_NAME}.helloWorld`, () => {
        vscode.window.showInformationMessage(`Hello World from ${ELEGANT_NAME}!`);
    });
    context.subscriptions.push(disposable);
}
