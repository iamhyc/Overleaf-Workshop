import * as vscode from 'vscode';
import * as consts from './consts';

import { ProjectManagerProvider } from './provider/projectManagerProvider';

export function activate(context: vscode.ExtensionContext) {
    // Register: projectManagerProvider on Activitybar
    const projectManagerProvider = new ProjectManagerProvider(context);
    vscode.window.registerTreeDataProvider('projectManager', projectManagerProvider);
    vscode.commands.registerCommand('projectManager.addServer', () => {
        projectManagerProvider.addServer();
    });
    vscode.commands.registerCommand('projectManager.removeServer', (item) => {
        projectManagerProvider.removeServer(item.name);
    });
    vscode.commands.registerCommand('projectManager.loginServer', (item) => {
        projectManagerProvider.loginServer(item.name);
    });
    vscode.commands.registerCommand('projectManager.logoutServer', (item) => {
        projectManagerProvider.logoutServer(item.name);
    });

    // Register: commands shortcuts
    let disposable = vscode.commands.registerCommand(`${consts['ROOT_NAME']}.helloWorld`, () => {
        vscode.window.showInformationMessage(`Hello World from ${consts['ELEGANT_NAME']}!`);
    });
    context.subscriptions.push(disposable);
}
