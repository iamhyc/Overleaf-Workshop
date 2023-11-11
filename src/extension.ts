import * as vscode from 'vscode';
import { ROOT_NAME, ELEGANT_NAME } from './consts';

import { RemoteFileSystemProvider } from './core/remoteFileSystemProvider';
import { ProjectManagerProvider } from './core/projectManagerProvider';
import { PdfViewEditorProvider } from './core/pdfViewEditorProvider';
import { CompileManager } from './compile/compileManager';
import { LangIntellisenseProvider } from './intellisense/langIntellisenseProvider';
import { HistoryViewProvider } from './scm/historyViewProvider';

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

    // Register: ProjectManagerProvider on Activitybar
    const projectManagerProvider = new ProjectManagerProvider(context);
    vscode.window.registerTreeDataProvider('projectManager', projectManagerProvider);
    context.subscriptions.push( ...projectManagerProvider.triggers );

    // Register: CompileManager on Statusbar
    const compileManager = new CompileManager(remoteFileSystemProvider);
    context.subscriptions.push( compileManager.status );
    context.subscriptions.push( ...compileManager.triggers );

    // Register: LangIntellisenseProvider
    const langIntellisenseProvider = new LangIntellisenseProvider(context, remoteFileSystemProvider);
    context.subscriptions.push( ...langIntellisenseProvider.triggers );
}
