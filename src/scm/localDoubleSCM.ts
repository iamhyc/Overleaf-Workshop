import * as vscode from 'vscode';
import { BaseSCM, CommitItem, SettingItem } from ".";
import { VirtualFileSystem } from '../core/remoteFileSystemProvider';

export class LocalDoubleSCMProvider extends BaseSCM {
    public static readonly label = 'Local Double';
    public static readonly uriPrompt: string = 'e.g., ~/path/to/empty/local/folder';

    public readonly iconPath: vscode.ThemeIcon = new vscode.ThemeIcon('folder-library');

    constructor(
        protected readonly vfs: VirtualFileSystem,
        public readonly baseUri: vscode.Uri,
        settings?: JSON,
    ) {
        super(vfs, baseUri, settings);
    }

    writeFile(path: string, content: Uint8Array): Thenable<void> {
        const uri = vscode.Uri.joinPath(this.baseUri, path);
        return vscode.workspace.fs.writeFile(uri, content);
    }

    readFile(path: string): Thenable<Uint8Array> {
        const uri = vscode.Uri.joinPath(this.baseUri, path);
        return vscode.workspace.fs.readFile(uri);
    }

    list(): Iterable<CommitItem> {
        return [];
    }

    async apply(commitItem: CommitItem): Promise<void> {
        return;
    }

    syncFromSCM(commits: Iterable<CommitItem>): Promise<void> {
        return Promise.resolve();
    }

    get triggers(): vscode.Disposable[] {
        return [];
    }

    get settingItems(): SettingItem[] {
        return [];
    }
}