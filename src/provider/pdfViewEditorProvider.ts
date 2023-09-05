import * as vscode from 'vscode';
import { ROOT_NAME } from '../consts';
import { pdfViewRecord } from '../utils/compileManager';
import { parseUri } from './remoteFileSystemProvider';

export class PdfDocument implements vscode.CustomDocument {
    cache: Uint8Array = new Uint8Array(0);

    private readonly _onDidChange = new vscode.EventEmitter<{}>();
    readonly onDidChange = this._onDidChange.event;

    constructor(readonly uri: vscode.Uri) {
        if (uri.scheme !== ROOT_NAME) {
            throw new Error(`Invalid uri scheme: ${uri}`);
        }
        this.uri = uri;
    }

    dispose() { }

    async refresh(): Promise<Uint8Array> {
        this.cache = new Uint8Array(await vscode.workspace.fs.readFile(this.uri));
        this._onDidChange.fire({content:this.cache});
        return this.cache;
    }
}

export class PdfViewEditorProvider implements vscode.CustomEditorProvider<PdfDocument> {
    private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<PdfDocument>>();
    readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

    constructor(private readonly context:vscode.ExtensionContext) {
        this.context = context;
    }

    public saveCustomDocument(document: PdfDocument, cancellation: vscode.CancellationToken): Thenable<void> {
        return Promise.resolve();
    }
    public saveCustomDocumentAs(document: PdfDocument, destination: vscode.Uri, cancellation: vscode.CancellationToken): Thenable<void> {
        return Promise.resolve();
    }
    public revertCustomDocument(document: PdfDocument, cancellation: vscode.CancellationToken): Thenable<void> {
        return Promise.resolve();
    }
    public backupCustomDocument(document: PdfDocument, context: vscode.CustomDocumentBackupContext, cancellation: vscode.CancellationToken): Thenable<vscode.CustomDocumentBackup> {
        return Promise.resolve({id: '', delete: () => {}});
    }

    async openCustomDocument(uri: vscode.Uri): Promise<PdfDocument> {
        const doc = new PdfDocument(uri);
        await doc.refresh();
        return doc;
    }

    async resolveCustomEditor(doc: PdfDocument, webviewPanel: vscode.WebviewPanel): Promise<void> {
        const {identifier} = parseUri(doc.uri);
        if (pdfViewRecord[identifier]) {
            pdfViewRecord[identifier].push({doc, webviewPanel});
        } else {
            pdfViewRecord[identifier] = [{doc, webviewPanel}];
        }

        doc.onDidChange(() => {
            webviewPanel.webview.postMessage({type:'update', content:doc.cache.buffer});
        });

        webviewPanel.webview.options = {enableScripts:true};
        webviewPanel.webview.html = await this.getHtmlForWebview(webviewPanel.webview);
        webviewPanel.webview.postMessage({type:'update', content:doc.cache.buffer});
        webviewPanel.webview.onDidReceiveMessage((e) => {
            switch (e.type) {
                case 'syncCode':
                    break;
                default:
                    break;
            }
        });
    }

    private async getHtmlForWebview(webview: vscode.Webview): Promise<string> {
        const vendorJsPath = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'views', 'vendor'));
        const commonJsPath = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'views', 'vscode-pdf-viewer.js'));
        const htmlPath = vscode.Uri.joinPath(this.context.extensionUri, 'views', 'vscode-pdf-viewer.html');
        let html = (await vscode.workspace.fs.readFile(htmlPath)).toString();
        html = html.replace(/vendor\//g, vendorJsPath.toString()+'/');
        html = html.replace('vscode-pdf-viewer.js', commonJsPath.toString());
        return html;
    }

}
