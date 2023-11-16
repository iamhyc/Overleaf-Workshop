import * as vscode from 'vscode';
import { minimatch } from 'minimatch';
import { BaseSCM, CommitItem, SettingItem } from ".";
import { VirtualFileSystem, parseUri } from '../core/remoteFileSystemProvider';

const IGNORE_SETTING_KEY = 'ignore-patterns';

/**
 * A SCM which tracks exact the changes from the vfs.
 * It keeps no history versions.
 */
export class LocalReplicaSCMProvider extends BaseSCM {
    public static readonly label = 'Local Replica';

    public readonly iconPath: vscode.ThemeIcon = new vscode.ThemeIcon('folder-library');

    private syncCache: string[] = [];
    private vfsWatcher?: vscode.FileSystemWatcher;
    private localWatcher?: vscode.FileSystemWatcher;
    private ignorePatterns: string[] = [
        '**/.*',
        '**/.*/**',
        '**/*.aux',
        '**/*.bbl',
        '**/*.bcf',
        '**/*.blg',
        '**/*.fdb_latexmk',
        '**/*.fls',
        '**/*.lof',
        '**/*.log',
        '**/*.lot',
        '**/*.out',
        '**/*.run.xml',
        '**/*.synctex.gz',
        '**/*.toc',
        '**/*.xdv',
        '**/main.pdf',
        '**/output.pdf',
    ];

    constructor(
        protected readonly vfs: VirtualFileSystem,
        public readonly baseUri: vscode.Uri,
    ) {
        super(vfs, baseUri);
        if ( !baseUri.path.endsWith(`/${vfs.projectName}`) ) {
            this.baseUri = vscode.Uri.joinPath(baseUri, vfs.projectName);
        }
    }

    public static async validateBaseUri(uri: string): Promise<vscode.Uri> {
        try {
            let baseUri = vscode.Uri.file(uri);
            // try to create the folder with `mkdirp` semantics
            await vscode.workspace.fs.createDirectory(baseUri);
            await vscode.workspace.fs.stat(baseUri);
            return baseUri;
        } catch (error) {
            vscode.window.showErrorMessage('Invalid Path. Please make sure the absolute path to a folder with read/write permissions is used.');
            return Promise.reject(error);
        }
    }

    private matchIgnorePatterns(path: string): boolean {
        const ignorePatterns = this.getSetting<string[]>(IGNORE_SETTING_KEY) || this.ignorePatterns;
        for (const pattern of ignorePatterns) {
            if (minimatch(path, pattern, {dot:true})) {
                return true;
            }
        }
        return false;
    }

    async overwrite(root: string='/') {
        const vfsUri = this.vfs.pathToUri(root);
        const files = await vscode.workspace.fs.readDirectory(vfsUri);

        for (const [name, type] of files) {
            const relPath = root + name;
            // bypass ignore files
            if (this.matchIgnorePatterns(relPath)) {
                continue;
            }
            // recursively overwrite
            if (type === vscode.FileType.Directory) {
                const nextRoot = relPath+'/';
                await this.overwrite(nextRoot);
            } else {
                const content = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(vfsUri, name));
                this.syncCache.push(`update ${relPath}`); //avoid loop call
                await this.writeFile(relPath, content);
            }
        }
    }

    private bypassSync(relPath: string, type: 'update'|'delete'): boolean {
        // bypass ignore files
        if (this.matchIgnorePatterns(relPath)) {
            return true;
        }

        // bypass loop call
        const key = `${type} ${relPath}`;
        if (this.syncCache.includes(key)) {
            this.syncCache = this.syncCache.filter(path => path!==relPath);
            return true;
        }

        return false;
    }

    private async syncFromVFS(vfsUri: vscode.Uri, type: 'update'|'delete') {
        const {pathParts} = parseUri(vfsUri);
        const relPath = '/' + pathParts.join('/');
        const localUri = vscode.Uri.joinPath(this.baseUri, relPath);

        console.log(`syncFromVFS ${type}: ${relPath}`);
        if (this.bypassSync(relPath, type)) { return; }
        this.syncCache.push(`${type} ${relPath}`);
        console.log(`${type}: ${relPath} --> ${localUri.path}`);

        // apply update
        if (type === 'update') {
            const stat = await vscode.workspace.fs.stat(vfsUri);
            if (stat.type===vscode.FileType.File) {
                const content = await vscode.workspace.fs.readFile(vfsUri);
                await this.writeFile(relPath, content);
            } else if (stat.type===vscode.FileType.Directory) {
                await vscode.workspace.fs.createDirectory(localUri);
            }
        } else {
            await vscode.workspace.fs.delete(localUri, {recursive:true});
        }
    }

    private async syncToVFS(localUri: vscode.Uri, type: 'update'|'delete') {
        // get relative path to baseUri
        const basePath = this.baseUri.path;
        const relPath = localUri.path.slice(basePath.length);
        const vfsUri = this.vfs.pathToUri(relPath);

        console.log(`syncToVFS ${type}: ${relPath}`);
        if (this.bypassSync(relPath, type)) { return; }
        this.syncCache.push(`${type} ${relPath}`);
        console.log(`${type}: ${relPath} --> ${vfsUri.toString()}`);

        // apply update
        if (type === 'update') {
            const stat = await vscode.workspace.fs.stat(localUri);
            if (stat.type===vscode.FileType.File) {
                const content = await vscode.workspace.fs.readFile(localUri);
                await vscode.workspace.fs.writeFile(vfsUri, content);
            } else if (stat.type===vscode.FileType.Directory) {
                await vscode.workspace.fs.createDirectory(vfsUri);
            }
        } else {
            await vscode.workspace.fs.delete(localUri, {recursive:true});
        }
    }

    private async initWatch() {
        await this.overwrite();
        this.vfsWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern( this.vfs.origin, '**/*' )
        );
        this.localWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern( this.baseUri.path, '**/*' )
        );

        return [
            // sync from vfs to local
            this.vfsWatcher.onDidChange(async uri => await this.syncFromVFS(uri, 'update')),
            this.vfsWatcher.onDidCreate(async uri => await this.syncFromVFS(uri, 'update')),
            this.vfsWatcher.onDidDelete(async uri => await this.syncFromVFS(uri, 'delete')),
            // sync from local to vfs
            this.localWatcher.onDidChange(async uri => await this.syncToVFS(uri, 'update')),
            this.localWatcher.onDidCreate(async uri => await this.syncToVFS(uri, 'update')),
            this.localWatcher.onDidDelete(async uri => await this.syncToVFS(uri, 'delete')),
        ];
    }

    writeFile(relPath: string, content: Uint8Array): Thenable<void> {
        const uri = vscode.Uri.joinPath(this.baseUri, relPath);
        return vscode.workspace.fs.writeFile(uri, content);
    }

    readFile(relPath: string): Thenable<Uint8Array> {
        const uri = vscode.Uri.joinPath(this.baseUri, relPath);
        return vscode.workspace.fs.readFile(uri);
    }

    get triggers(): Promise<vscode.Disposable[]> {
        return this.initWatch().then((watches) => {
            if (this.vfsWatcher!==undefined && this.localWatcher!==undefined) {
                return [
                    this.vfsWatcher,
                    this.localWatcher,
                    ...watches,
                ];
            } else {
                return [];
            }
        });
    }

    public static get baseUriInputBox(): vscode.QuickPick<vscode.QuickPickItem> {
        const inputBox = vscode.window.createQuickPick();
        inputBox.placeholder = 'e.g., /home/user/empty/local/folder';
        // enable auto-complete
        inputBox.onDidChangeValue(async value => {
            try {
                // remove the last part of the path
                inputBox.busy = true;
                const path = value.split('/').slice(0, -1).join('/');
                const items = await vscode.workspace.fs.readDirectory( vscode.Uri.file(path) );
                const subDirs = items.filter( ([name, type]) => type===vscode.FileType.Directory )
                                    .filter( ([name, type]) => `${path}/${name}`.startsWith(value) );
                inputBox.busy = false;
                // update the sub-directories
                if (subDirs.length!==0) {
                    const candidates = subDirs.map(([name, type]) => ({label:name, alwaysShow:true, picked:false}));
                    if (path!=='') {
                        candidates.unshift({label:'..', alwaysShow:true, picked:false});
                    }
                    inputBox.items = candidates;
                    inputBox.activeItems = [];
                }
            }
            finally {
                inputBox.activeItems = [];
            }
        });
        inputBox.onDidAccept(() => {
            if (inputBox.selectedItems.length!==0) {
                const selected = inputBox.selectedItems[0];
                const path = inputBox.value.split('/').slice(0, -1).join('/');
                inputBox.value = selected.label==='..'? path : `${path}/${selected.label}/`;
            }
        });
        return inputBox;
    }

    get settingItems(): SettingItem[] {
        return [
            // configure ignore patterns
            {
                label: 'Configure sync ignore patterns ...',
                callback: async () => {
                    const ignorePatterns = this.getSetting<string[]>(IGNORE_SETTING_KEY) || this.ignorePatterns;
                    const quickPick = vscode.window.createQuickPick();
                    quickPick.items = ignorePatterns.map(pattern => ({
                        label: pattern,
                        buttons: [{iconPath: new vscode.ThemeIcon('trash')}],
                    }));
                    // remove pattern when click the trash icon
                    quickPick.onDidTriggerItemButton(async ({item}) => {
                        const index = ignorePatterns.indexOf(item.label);
                        ignorePatterns.splice(index, 1);
                        await this.setSetting(IGNORE_SETTING_KEY, ignorePatterns);
                        quickPick.items = ignorePatterns.map(pattern => ({
                            label: pattern,
                            buttons: [{iconPath: new vscode.ThemeIcon('trash')}],
                        }));
                    });
                    // add new pattern when not exist
                    quickPick.onDidAccept(async () => {
                        if (quickPick.selectedItems.length===0) {
                            const pattern = quickPick.value;
                            if (pattern!=='') {
                                ignorePatterns.push(pattern);
                                await this.setSetting(IGNORE_SETTING_KEY, ignorePatterns);
                                quickPick.items = ignorePatterns.map(pattern => ({
                                    label: pattern,
                                    buttons: [{iconPath: new vscode.ThemeIcon('trash')}],
                                }));
                                quickPick.value = '';
                            }
                        }
                    });
                    // show the quick pick
                    quickPick.show();
                },
            },
        ];
    }

    list(): Iterable<CommitItem> { return []; }
    async apply(commitItem: CommitItem): Promise<void> { return Promise.resolve(); }
    syncFromSCM(commits: Iterable<CommitItem>): Promise<void> { return Promise.resolve(); }
}
