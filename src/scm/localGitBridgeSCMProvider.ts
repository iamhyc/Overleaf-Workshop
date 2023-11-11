import * as vscode from 'vscode';
import { BaseSCM, CommitItem, SettingItem } from ".";
import { VirtualFileSystem } from '../core/remoteFileSystemProvider';

export class LocalGitBridgeSCMProvider extends BaseSCM {
    public static readonly label = 'Git Bridge';
    public static readonly uriPrompt: string = 'e.g., https://github.com/username/reponame.git';

    public readonly iconPath: vscode.ThemeIcon = new vscode.ThemeIcon('github');

    constructor(
        vfs: VirtualFileSystem,
        public readonly baseUri: vscode.Uri,
        settings?: JSON,
    ) {
        super(vfs, baseUri, settings);
    }

    writeFile(path: string, content: Uint8Array): Thenable<void> {
        return Promise.resolve();
    }

    readFile(path: string): Thenable<Uint8Array> {
        return Promise.resolve(new Uint8Array());
    }

    list(): Iterable<CommitItem> {
        return [];
    }

    async apply(commitItem: CommitItem): Promise<void> {
        return;
    }

    async syncFromSCM(commits: Iterable<CommitItem>): Promise<void> {
        return Promise.resolve();
    }

    get triggers(): vscode.Disposable[] {
        return [];
    }

    get settingItems(): SettingItem[] {
        return [];
    }
}