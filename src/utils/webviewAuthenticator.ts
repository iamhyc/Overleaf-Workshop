import * as vscode from 'vscode';

export class WebviewAuthenticator {
    private rootPath: vscode.Uri;

    constructor(readonly extensionUri: vscode.Uri) {
        this.rootPath = vscode.Uri.joinPath(this.extensionUri, 'views');
        this.createWebviewPanel();
    }

    private async createWebviewPanel() {
        const panel = vscode.window.createWebviewPanel(
            'webviewAuthenticator', 'Webview Authenticator', vscode.ViewColumn.One, {});
        const htmlPath = vscode.Uri.joinPath(this.rootPath, 'vscode-authenticator.html');
        const html = (await vscode.workspace.fs.readFile(htmlPath)).toString();
        html.replace('vscode-authenticator.js', vscode.Uri.joinPath(this.rootPath, 'vscode-authenticator.js').toString());
        panel.webview.html = html;
    }
}
