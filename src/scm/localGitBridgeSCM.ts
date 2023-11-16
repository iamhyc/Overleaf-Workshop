import * as vscode from 'vscode';
import { BaseSCM, CommitItem, SettingItem } from ".";
import { VirtualFileSystem } from '../core/remoteFileSystemProvider';

export class LocalGitBridgeSCMProvider extends BaseSCM {
    public static readonly label = 'Git Bridge';

    public readonly iconPath: vscode.ThemeIcon = new vscode.ThemeIcon('github');

    constructor(
        vfs: VirtualFileSystem,
        public readonly baseUri: vscode.Uri,
    ) {
        super(vfs, baseUri);
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

    get triggers(): Promise<vscode.Disposable[]> {
        return Promise.resolve([]);
    }

    public static get baseUriInputBox(): vscode.QuickPick<vscode.QuickPickItem> {
        const inputBox = vscode.window.createQuickPick();
        inputBox.placeholder = 'e.g., https://github.com/username/reponame.git';
        return inputBox;
    }

    get settingItems(): SettingItem[] {
        return [];
    }
}