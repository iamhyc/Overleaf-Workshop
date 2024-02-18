import * as vscode from "vscode";
import { VirtualFileSystem } from "../core/remoteFileSystemProvider";
import { EventBus } from "../utils/eventBus";

export interface SettingItem extends vscode.QuickPickItem {
    callback: () => Promise<void>;
}

export interface StatusInfo {
    status: 'push' | 'pull' | 'idle' | 'need-attention',
    message?: string,
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
    private _status: StatusInfo = {status: 'idle', message: ''};
    public static readonly label: string;

    public readonly iconPath: vscode.ThemeIcon = new vscode.ThemeIcon('git-branch');

    /**
     * @param baseUri The base URI of the SCM
     */
    constructor(
        protected readonly vfs: VirtualFileSystem,
        public readonly baseUri: vscode.Uri,
    ) {}

    /**
     * Validate the base URI of the SCM.
     * 
     * @returns A promise that resolves to the validated URI
     */
    public static async validateBaseUri(uri: string): Promise<vscode.Uri> {
        return Promise.resolve( vscode.Uri.parse(uri) );
    }

    /**
     * Get the input box for the base URI.
     * 
     * @returns The input box
     */
    public static get baseUriInputBox(): vscode.QuickPick<vscode.QuickPickItem> {
        return vscode.window.createQuickPick();
    }

    /**
     * Directly write a file to the SCM.
     */
    abstract writeFile(path: string, content: Uint8Array): Thenable<void>;

    /**
     * Directly read a file from the SCM.
     */
    abstract readFile(path: string): Thenable<Uint8Array|undefined>;

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
    abstract apply(commitItem: CommitItem): Thenable<void>;

    /**
     * Sync commits from the other SCM.
     * 
     * @param commits The commits to sync
     */
    abstract syncFromSCM(commits: Iterable<CommitItem>): Thenable<void>;

    /**
     * Define when the SCM should be called.
     * 
     * @returns A list of disposable objects
     */
    abstract get triggers(): Promise<vscode.Disposable[]>;

    /**
     * Get the configuration items to be shown in QuickPick.
     * 
     * @returns A list of configuration items
     */
    abstract get settingItems(): SettingItem[];

    get status(): StatusInfo {
        return this._status;
    }

    protected set status(status: StatusInfo) {
        this._status = status;
        EventBus.fire('scmStatusChangeEvent', {status});
    }

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
            baseUri: this.baseUri.toString(),
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

