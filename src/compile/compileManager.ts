import * as vscode from 'vscode';
import { RemoteFileSystemProvider, parseUri } from '../provider/remoteFileSystemProvider';
import { ROOT_NAME, ELEGANT_NAME, OUTPUT_FOLDER_NAME } from '../consts';
import { PdfDocument } from '../provider/pdfViewEditorProvider';
import { LatexParser, ErrorSchema } from './compileLogParser';

// map string level to severity
const severityMap: Record<string, vscode.DiagnosticSeverity> = {
    error: vscode.DiagnosticSeverity.Error,
    warning: vscode.DiagnosticSeverity.Warning,
    information: vscode.DiagnosticSeverity.Information,
};


export const pdfViewRecord: {
    [key: string]: {
        [key: string]: { doc: PdfDocument, webviewPanel: vscode.WebviewPanel }
    }
} = {};



class CompileDiagnosticProvider {
    private diagnosticCollection = vscode.languages.createDiagnosticCollection(ROOT_NAME);
    constructor(private readonly vfsm: RemoteFileSystemProvider) { };


    private async getRange(log: ErrorSchema, path: string, vfs: any) {
        let textDoc: vscode.TextDocument;
        try {
            textDoc = (await vscode.workspace.openTextDocument(vfs.pathToUri(path)));
        }
        catch (error) {
            return null;
        }
        if (log.line !== null) {
            const _range = new vscode.Range(
                new vscode.Position(log.line - 1, 0),
                new vscode.Position(log.line, 0),
            );
            const lineContent = textDoc.getText(_range);
            const lineMatch = lineContent.match(/^\s*(.*?)\s*$/)?.[1] || '';
            const lineStart = lineContent.indexOf(lineMatch);
            const lineEnd = lineStart + lineMatch.length;
            return new vscode.Range(
                new vscode.Position(log.line - 1, lineStart),
                new vscode.Position(log.line - 1, lineEnd),
            );
        }
        else {
            return new vscode.Range(
                new vscode.Position(0, 0),
                new vscode.Position(1, 0),
            );
        }
    }
    private validatePath(path: string) {
        const outputRegex = new RegExp(/\.\/(output.(aux|bbl|toc|lof|lot|bbl|bst|ttt|fff))\b/);
        const match = outputRegex.exec(path);
        if (match) {
            return path.replace(match[0], `${OUTPUT_FOLDER_NAME}/${match[1]}`);
        }
        return path;
    }

    private async updateDiagnostics(uri: vscode.Uri) {
        this.diagnosticCollection.clear();
        const vfs = await this.vfsm.prefetch(uri);
        const logPath = `${OUTPUT_FOLDER_NAME}/output.log`;
        const _uri = vfs.pathToUri(logPath);
        let content ='';
        content = new TextDecoder().decode(await vfs.openFile(_uri));
        const logs = new LatexParser(content).parse();
        if (logs === undefined) {
            return content === ''? true :false;
        }
        let hasError = false;
        const diagnosticsRecorder: { [key: string]: vscode.Diagnostic[] } = {};
        for (const log of logs.all) {
            if (!log.file.startsWith('./')) { continue; }
            const path = this.validatePath(log.file);
            const range = await this.getRange(log, path, vfs);
            if (range === null) {
                continue;
            }
            if (!diagnosticsRecorder[path]) {
                diagnosticsRecorder[path] = [];
            }
            const diagnostic = new vscode.Diagnostic(range, log.message, severityMap[log.level]);
            diagnostic.source = "Compile Checker";
            diagnosticsRecorder[path].push(diagnostic);

            if (log.level === 'error') {
                hasError = true;
            }
        }
        for (const file in diagnosticsRecorder) {
            const diagnostics = diagnosticsRecorder[file];
            const _uri = vfs.pathToUri(file);
            this.diagnosticCollection.set(_uri, diagnostics);
        }
        return hasError;
    }
    get triggers() {
        return [
            this.diagnosticCollection,
            vscode.commands.registerCommand('compileManager.compileErrorCheck', async (uri) => {
                return await this.updateDiagnostics(uri);
            }),
        ];
    }
}

export class CompileManager {
    readonly status: vscode.StatusBarItem;
    private diagnosticProvider: CompileDiagnosticProvider;

    constructor(
        private vfsm: RemoteFileSystemProvider,
    ) {
        this.vfsm = vfsm;
        this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -1);
        this.update('$(alert)', {tooltip:`${ELEGANT_NAME}: No Results`, color:'#FFCC00'});
        this.diagnosticProvider = new CompileDiagnosticProvider(vfsm);
    }

    static check(uri?: vscode.Uri) {
        uri = uri || vscode.window.activeTextEditor?.document.uri;
        uri = uri || vscode.workspace.workspaceFolders?.[0].uri;
        return uri?.scheme === ROOT_NAME ? uri : undefined;
    }

    get triggers() {
        return [
            vscode.workspace.onDidSaveTextDocument((e) => {
                CompileManager.check.bind(this)(e.uri) && e.fileName.match(/\.tex$|\.sty$|\.cls$|\.bib$/i) && this.compile();
            }),
            ...this.diagnosticProvider.triggers,
        ];
    }

    update(text: string, options?:{tooltip?:string, color?:string}) {
        const uri = CompileManager.check();
        if (uri) {
            this.status.text = text;
            this.status.tooltip = options?.tooltip;
            this.status.color = options?.color;
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
                .then((vfs) => vfs.compile())
                .then((res) => {
                    switch (res) {
                        case undefined:
                            this.update('$(check)', {tooltip:`${ELEGANT_NAME}: Compile Success`});
                            break;
                        case false:
                            this.update('$(x)', {tooltip:`${ELEGANT_NAME}: Compile Failed`, color:'#FF0000'});
                            break;
                        case true:
                            return true;
                        default:
                            this.update('$(alert)', {tooltip:`${ELEGANT_NAME}: No Results`, color:'#FFCC00'});
                            break;
                    }
                })
                .then(status =>
                    status ?
                        vscode.commands.executeCommand('compileManager.compileErrorCheck', uri)
                        : Promise.reject()
                )
                .then((hasError) => {
                    if (hasError) {
                        this.update('$(x)', {tooltip:`${ELEGANT_NAME}: Compile Failed`, color:'#FF0000'});
                    } else {
                        this.update('$(check)', {tooltip:`${ELEGANT_NAME}: Compile Success`});
                    }
                    // refresh pdf
                    const { identifier } = parseUri(uri);
                    Object.values(pdfViewRecord[identifier]).forEach(
                        (record) => record.doc.refresh()
                    );
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
                { preview: false, viewColumn: vscode.ViewColumn.Beside }
            );
        }
    }

    syncCode() {
        const uri = CompileManager.check();
        if (uri && vscode.window.activeTextEditor) {
            const { identifier, pathParts } = parseUri(uri);
            const startPoint = vscode.window.activeTextEditor.selection.start;
            const filePath = pathParts.join('/');
            const line = startPoint.line;
            const column = startPoint.character;
            this.vfsm.prefetch(uri)
                .then((vfs) => vfs.syncCode(filePath, line, column))
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

    syncPdf(r: { page: number, h: number, v: number, identifier: string }) {
        const uri = CompileManager.check();
        if (uri) {
            this.vfsm.prefetch(uri)
                .then((vfs) => vfs.syncPdf(r.page, r.h, r.v))
                .then((res) => {
                    if (res) {
                        const { projectName } = parseUri(uri);
                        const { file, line, column } = res;
                        const _file = file.match(/output\.[^\.]+$/) ? `${OUTPUT_FOLDER_NAME}/${file}` : file;
                        const fileUri = uri.with({ path: `/${projectName}/${_file}` });
                        // get doc by fileUri
                        const viewColumn = vscode.window.visibleTextEditors.at(-1)?.viewColumn || vscode.ViewColumn.Beside;
                        vscode.commands.executeCommand('vscode.open', fileUri, { viewColumn })
                            .then((doc) => {
                                for (const editor of vscode.window.visibleTextEditors) {
                                    if (editor.document.uri.toString() === fileUri.toString()) {
                                        const _identifier = r.identifier.replace(/\s+/g, '\\s+');
                                        const matchIndex = editor.document.lineAt(line - 1).text.match(_identifier)?.index || 0;
                                        editor.selections = editor.selections.map((sel, index) => {
                                            return index === 0 ?
                                                new vscode.Selection(line - 1, matchIndex, line - 1, matchIndex)
                                                : sel;
                                        });
                                        editor.revealRange(new vscode.Range(line - 1, matchIndex, line - 1, matchIndex), vscode.TextEditorRevealType.InCenter);
                                        break;
                                    }
                                }
                            });
                    }
                });
        }
    }
}
