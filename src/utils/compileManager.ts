import * as vscode from 'vscode';
import { RemoteFileSystemProvider } from '../provider/remoteFileSystemProvider';
import { ROOT_NAME, ELEGANT_NAME } from '../consts';

export class CompileManager {
    readonly status: vscode.StatusBarItem;

    constructor(
        private vfsm: RemoteFileSystemProvider,
    ) {
        this.vfsm = vfsm;
        this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -1);
        this.update('$(alert)', `${ELEGANT_NAME}: No Results`);
    }

    check(uri?: vscode.Uri) {
        uri = uri || vscode.window.activeTextEditor?.document.uri;
        return uri?.scheme === ROOT_NAME ? uri : undefined;
    }

    triggers() {
        return [
            vscode.workspace.onDidSaveTextDocument((e) => {
                this.check.bind(this)(e.uri) && e.fileName.match(/\.tex$|\.sty$|\.cls$|\.bib$/i) && this.compile();
            }),
        ];
    }

    update(text: string, tooltip?: string) {
        const uri = this.check();
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
        const res = this.update('$(sync~spin) Compiling');
        if (res) {
            this.vfsm.prefetch(res)
            .then((vfs) => vfs.compile() )
            .then((res) => {
                switch (res) {
                    case true:
                        this.update('$(check)', `${ELEGANT_NAME}: Compile Success`);
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
        const uri = this.check();
        if (uri) {
            const pdfUri = uri.with({
                path: uri.path.replace(/\/[^\/]*$/, `/${ROOT_NAME}/output.pdf`)
            });
            vscode.commands.executeCommand('vscode.open', pdfUri, vscode.ViewColumn.Two);
        }
    }
}
