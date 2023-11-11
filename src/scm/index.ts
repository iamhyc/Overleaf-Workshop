import * as vscode from "vscode";
import { VirtualFileSystem } from "../core/remoteFileSystemProvider";
import { ProjectSCMPersist } from "../utils/globalStateManager";

export interface SettingItem extends vscode.QuickPickItem {
    callback: () => Promise<void>;
}

export interface CommitTag {
    comment: string,
    username: string,
    email: string,
    timestamp: number,
}

export interface FileEditOps {
    pathname: string,
    ops: {
        type: 'add' | 'delete',
        start: number,
        end: number,
        content: string,
    }[],
}

export interface CommitInfo {
    version: string,
    username: string,
    email: string,
    timestamp: number,
    commitMessage: string,
    tags: CommitTag[],
    diff: FileEditOps[],
}

export class CommitItem {
    constructor(public commit: CommitInfo) {}

    isEqualTo(other: CommitItem) {
        const otherCommit = other.commit;
        return (
            this.commit.username === otherCommit.username
            && this.commit.email === otherCommit.email
            && this.commit.timestamp === otherCommit.timestamp
            && this.commit.commitMessage === otherCommit.commitMessage
        );
    }
}

export abstract class BaseSCM {
    public static readonly label: string;
    public static readonly uriPrompt: string = 'Enter the URI of the SCM';

    public readonly iconPath: vscode.ThemeIcon = new vscode.ThemeIcon('git-branch');

    /**
     * @param baseUri The base URI of the SCM
     */
    constructor(
        protected readonly vfs: VirtualFileSystem,
        public readonly baseUri: vscode.Uri,
        settings?: JSON,
    ) {
        this.settings = settings || {} as JSON;
    }

    /**
     * Directly write a file to the SCM.
     */
    abstract writeFile(path: string, content: Uint8Array): Thenable<void>;

    /**
     * Directly read a file from the SCM.
     */
    abstract readFile(path: string): Thenable<Uint8Array>;

    /**
     * List history commits *in reverse time order* in the SCM.
     * 
     * @returns An iterable lazy list of commits
     */
    abstract list(): Iterable<CommitItem>;
    
    /**
     * Apply a commit to the SCM.
     * 
     * @param commitItem The commit to apply
     */
    abstract apply(commitItem: CommitItem): Promise<void>;

    /**
     * Sync commits from the other SCM.
     * 
     * @param commits The commits to sync
     */
    abstract syncFromSCM(commits: Iterable<CommitItem>): Promise<void>;

    /**
     * Define when the SCM should be called.
     * 
     * @returns A list of disposable objects
     */
    abstract get triggers(): vscode.Disposable[];

    /**
     * Get the configuration items to be shown in QuickPick.
     * 
     * @returns A list of configuration items
     */
    abstract get settingItems(): SettingItem[];


    get scmKey(): string {
        return this.baseUri.toString();
    }

    protected getSetting<T>(key: string): T {
        return this.settings[key as keyof JSON] as T;
    }

    protected setSetting<T>(key: string, value: T) {
        const newSettings = {...this.settings, [key]: value};
        this.settings = newSettings;
    }

    protected set settings(settings: JSON) {
        this.vfs.setProjectSCMPersist(this.scmKey, {
            label: (this.constructor as any).label,
            baseUri: this.baseUri,
            settings,
        });
    }

    protected get settings(): JSON {
        return this.vfs.getProjectSCMPersist(this.scmKey).settings;
    }

    async diff(): Promise<[number,number]> {
        //TODO:
        return Promise.resolve([0,0]);
    }
}

