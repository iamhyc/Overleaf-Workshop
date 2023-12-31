import * as vscode from 'vscode';
import { SocketIOAPI } from '../api/socketio';
import { ProjectMessageResponseSchema } from '../api/base';
import { VirtualFileSystem, parseUri } from '../core/remoteFileSystemProvider';
import { ROOT_NAME } from '../consts';
import { LocalReplicaSCMProvider } from '../scm/localReplicaSCM';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    private hasUnreadMessages = 0;
    private webviewView?: vscode.WebviewView;

    constructor(
        private readonly vfs: VirtualFileSystem,
        private readonly publicId: string,
        private readonly extensionUri: vscode.Uri,
        private readonly socket: SocketIOAPI,
    ) {
        this.socket.updateEventHandlers({
            onReceivedMessage: this.onReceivedMessage.bind(this)
        });
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
                    case 'show-line-ref':
                        const {path, L1, C1, L2, C2} = e.content;
                        const range = new vscode.Range(L1, C1, L2, C2);
                        this.showLineRef(path, range);
                        break;
                    default: break;
                }
            });
        });
    }

    private async getMessages() {
        const messages = await this.vfs.getMessages();
        if (this.webviewView !== undefined) {
            this.webviewView.webview.postMessage({
                type: 'get-messages',
                content: messages,
                userId: this.vfs._userId,
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

        if (!this.isViewVisible()) {
            this.hasUnreadMessages += 1;
        }
    }

    private isViewVisible() {
        return this.webviewView?.visible ?? false;
    }

    get hasUnread() {
        return this.hasUnreadMessages;
    }

    revealChatView() {
        // this.webviewView?.show(true);
        vscode.commands.executeCommand(`${ROOT_NAME}.chatWebview.focus`);
        this.hasUnreadMessages = 0;
    }

    insertText(text: string='') {
        this.revealChatView();
        if (this.webviewView === undefined) {
            setTimeout(() => this.insertText(text), 100);
            return;
        }

        this.webviewView.webview.postMessage({
            type: 'insert-text',
            content: text,
        });
    }

    private getLineRef() {
        const editor = vscode.window.activeTextEditor;
        if (editor === undefined) { return; }

        const filePath = parseUri(editor.document.uri).pathParts.join('/');
        const start = editor.selection.start, end = editor.selection.end;
        const ref = `[[${filePath}#L${start.line}C${start.character}-L${end.line}C${end.character}]]`;
        return ref;
    }

    private async showLineRef(path:string, range:vscode.Range) {
        const uri = (vscode.workspace.workspaceFolders?.[0].uri.scheme===ROOT_NAME) ?
                    this.vfs.pathToUri(path) : await LocalReplicaSCMProvider.pathToUri(path);
        if (uri === undefined) { return; }

        vscode.window.showTextDocument(uri).then(editor => {
            editor.revealRange(range);
            editor.selection = new vscode.Selection(range.start, range.end);
        });
    }

    get triggers() {
        return [
            // register commands
            vscode.commands.registerCommand(`${ROOT_NAME}.collaboration.copyLineRef`, () => {
                const ref = this.getLineRef();
                ref && vscode.env.clipboard.writeText(ref);
            }),
            vscode.commands.registerCommand(`${ROOT_NAME}.collaboration.insertLineRef`, () => {
                const ref = this.getLineRef();
                ref && this.insertText(ref + ' ');
            }),
            // register chat webview
            vscode.window.registerWebviewViewProvider(`${ROOT_NAME}.chatWebview`, this, {webviewOptions:{retainContextWhenHidden:true}}),
        ];
    }
}
