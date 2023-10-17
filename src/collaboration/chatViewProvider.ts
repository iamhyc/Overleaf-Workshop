import * as vscode from 'vscode';
import { SocketIOAPI } from '../api/socketio';
import { ProjectMessageResponseSchema } from '../api/base';
import { VirtualFileSystem } from '../provider/remoteFileSystemProvider';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    private webviewView?: vscode.WebviewView;

    constructor(
        private readonly vfs: VirtualFileSystem,
        private readonly publicId: string,
        private readonly extensionUri: vscode.Uri,
        private readonly socket: SocketIOAPI,
    ) {
        this.socket.updateEventHandlers({
            onReceivedMessage: this.onReceivedMessage.bind(this)
        })
    }

    async loadWebviewHtml(webview: vscode.Webview): Promise<string> {
        const rootFolder = 'views/chat-view/dist';
        const webviewPath = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, rootFolder)).toString();
    
        // load root html
        const htmlPath = vscode.Uri.joinPath(this.extensionUri, rootFolder, 'index.html');
        let html = (await vscode.workspace.fs.readFile(htmlPath)).toString();
        
        // patch root path (deprecated due to vite-plugin-singlefile)
        // html = html.replace(/href="\/(.*?)"/g, `href="${webviewPath}/$1"`);
        // html = html.replace(/src="\/(.*?)"/g, `src="${webviewPath}/$1"`);
    
        return html;
    }

    resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext<unknown>, token: vscode.CancellationToken): Thenable<void> {
        this.webviewView = webviewView;
        return this.loadWebviewHtml(webviewView.webview).then((html) => {
            webviewView.webview.options = {enableScripts:true};
            webviewView.webview.html = html;
            webviewView.webview.onDidReceiveMessage((e) => {
                switch (e.type) {
                    case 'get-messages': this.getMessages(); break;
                    case 'send-message': this.sendMessage(e.content); break;
                    default: break;
                }
            });
        });
    }

    private getMessages() {
        const messages = this.vfs.getMessages();
        if (this.webviewView !== undefined) {
            this.webviewView.webview.postMessage({
                type: 'get-messages',
                content: messages,
            });
        }
    }

    private sendMessage(content: string) {
        this.vfs.sendMessage(this.publicId, content);
    }

    private onReceivedMessage(message: ProjectMessageResponseSchema) {
        if (this.webviewView !== undefined) {
            this.webviewView.webview.postMessage({
                type: 'new-message',
                content: message,
            });
        }
    }

    get triggers() {
        return [
            //TODO: register commands
            // register chat webview
            vscode.window.registerWebviewViewProvider('chatWebview', this, {webviewOptions:{retainContextWhenHidden:true}}),
        ];
    }
}
