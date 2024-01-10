import * as vscode from 'vscode';

export const ROOT_NAME = 'overleaf-workshop';
export const ELEGANT_NAME = 'Overleaf Workshop';

export const OUTPUT_FOLDER_NAME = vscode.workspace.getConfiguration('overleaf-workshop').get('compileOutputFolderName', '.output') || '.output';

export const BIB_ENTRY = 'bib-file';
