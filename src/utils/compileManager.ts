import * as vscode from 'vscode';
import { RemoteFileSystemProvider, parseUri } from '../provider/remoteFileSystemProvider';
import { ROOT_NAME, ELEGANT_NAME, OUTPUT_FOLDER_NAME } from '../consts';
import { PdfDocument } from '../provider/pdfViewEditorProvider';
import { SyncCodeResponseSchema, SyncPdfResponseSchema } from '../api/base';

export const pdfViewRecord:{
    [key:string]: {
        [key:string]: {doc:PdfDocument, webviewPanel:vscode.WebviewPanel}
    }
} = {};

export class CompileManager {
    readonly status: vscode.StatusBarItem;

    constructor(
        private vfsm: RemoteFileSystemProvider,
    ) {
        this.vfsm = vfsm;
        this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -1);
        this.update('$(alert)', `${ELEGANT_NAME}: No Results`);
    }

    static check(uri?: vscode.Uri) {
        uri = uri || vscode.window.activeTextEditor?.document.uri;
        uri = uri || vscode.workspace.workspaceFolders?.[0].uri;
        return uri?.scheme === ROOT_NAME ? uri : undefined;
    }

    triggers() {
        return [
            vscode.workspace.onDidSaveTextDocument((e) => {
                CompileManager.check.bind(this)(e.uri) && e.fileName.match(/\.tex$|\.sty$|\.cls$|\.bib$/i) && this.compile();
            }),
        ];
    }

    update(text: string, tooltip?: string) {
        const uri = CompileManager.check();
        if (uri) {
            this.status.text = text;
            this.status.tooltip = tooltip;
            this.status.show();
        } else {
            this.status.hide();
        }
        return uri;
    }

    compile() {
        const uri = this.update('$(sync~spin) Compiling');
        if (uri) {
            this.vfsm.prefetch(uri)
            .then((vfs) => vfs.compile() )
            .then((res) => {
                switch (res) {
                    case undefined:
                        this.update('$(check)', `${ELEGANT_NAME}: Compile Success`);
                        break;
                    case true:
                        this.update('$(check)', `${ELEGANT_NAME}: Compile Success`);
                        const {identifier} = parseUri(uri);
                        Object.values(pdfViewRecord[identifier]).forEach(
                            (record) => record.doc.refresh()
                        );
                        break;
                    case false:
                        this.update('$(x)', `${ELEGANT_NAME}: Compile Failed`);
                        break;
                    default:
                        this.update('$(alert)', `${ELEGANT_NAME}: No Results`);
                        break;
                }
            });
        }
    }

    openPdf() {
        const uri = CompileManager.check();
        if (uri) {
            const rootPath = uri.path.split('/', 2)[1];
            const pdfUri = uri.with({
                path: `/${rootPath}/${OUTPUT_FOLDER_NAME}/output.pdf`,
            });
            vscode.commands.executeCommand('vscode.openWith', pdfUri,
                `${ROOT_NAME}.pdfViewer`,
                {preview:false, viewColumn: vscode.ViewColumn.Beside}
            );
        }
    }

    syncCode() {
        const uri = CompileManager.check();
        if (uri && vscode.window.activeTextEditor) {
            const {identifier, pathParts} = parseUri(uri);
            const startPoint = vscode.window.activeTextEditor.selection.start;
            const filePath = pathParts.join('/');
            const line = startPoint.line;
            const column = startPoint.character;
            this.vfsm.prefetch(uri)
            .then((vfs) => vfs.syncCode(filePath,line,column))
            .then((res) => {
                if (res) {
                    const pdfPath = `${OUTPUT_FOLDER_NAME}/output.pdf`;
                    const webview = pdfViewRecord[identifier][pdfPath].webviewPanel.webview;
                    // get page
                    webview.postMessage({
                        type: 'syncCode',
                        content: res
                    });
                }
            });
        }
    }

    syncPdf(r:{page:number, h:number, v:number, identifier:string}) {
        const uri = CompileManager.check();
        if (uri) {
            this.vfsm.prefetch(uri)
            .then((vfs) => vfs.syncPdf(r.page, r.h, r.v))
            .then((res) => {
                if (res) {
                    const {projectName} = parseUri(uri);
                    const {file,line,column} = res;
                    const _file = file.match(/output\.[^\.]+$/) ? `${OUTPUT_FOLDER_NAME}/${file}` : file;
                    const fileUri = uri.with({path: `/${projectName}/${_file}`});
                    // get doc by fileUri
                    const viewColumn = vscode.window.visibleTextEditors.at(-1)?.viewColumn || vscode.ViewColumn.Beside;
                    vscode.commands.executeCommand('vscode.open', fileUri, {viewColumn})
                    .then((doc) => {
                        for (const editor of vscode.window.visibleTextEditors) {
                            if (editor.document.uri.toString()===fileUri.toString()) {
                                const _identifier = r.identifier.replace(/\s+/g, '\\s+');
                                const matchIndex = editor.document.lineAt(line-1).text.match(_identifier)?.index || 0;
                                editor.selections = editor.selections.map((sel, index) => {
                                    return index===0?
                                    new vscode.Selection(line-1,matchIndex,line-1,matchIndex)
                                    : sel;
                                });
                                editor.revealRange(new vscode.Range(line-1,matchIndex,line-1,matchIndex), vscode.TextEditorRevealType.InCenter);
                                break;
                            }
                        }
                    });
                }
            });
        }
    }
}
