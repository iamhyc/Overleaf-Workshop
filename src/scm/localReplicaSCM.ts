import * as vscode from 'vscode';
import * as DiffMatchPatch from 'diff-match-patch';
import { minimatch } from 'minimatch';
import { BaseSCM, CommitItem, SettingItem } from ".";
import { VirtualFileSystem, parseUri } from '../core/remoteFileSystemProvider';

const IGNORE_SETTING_KEY = 'ignore-patterns';

/**
 * A SCM which tracks exact the changes from the vfs.
 * It keeps no history versions.
 */
export class LocalReplicaSCMProvider extends BaseSCM {
    public static readonly label = vscode.l10n.t('Local Replica');

    public readonly iconPath: vscode.ThemeIcon = new vscode.ThemeIcon('folder-library');

    private syncCache: string[] = [];
    private baseCache: {[key:string]: Uint8Array} = {};
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
        '**/*.synctex(busy)',
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
            vscode.window.showErrorMessage( vscode.l10n.t('Invalid Path. Please make sure the absolute path to a folder with read/write permissions is used.') );
            return Promise.reject(error);
        }
    }

    public static async pathToUri(path: string): Promise<vscode.Uri | undefined> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri;
        if (workspaceRoot===undefined || workspaceRoot?.scheme!=='file') { return undefined; }

        const settingUri = vscode.Uri.joinPath(workspaceRoot, '.overleaf/settings.json');
        try {
            await vscode.workspace.fs.stat(settingUri);
            return vscode.Uri.joinPath(workspaceRoot, path);
        } catch (error) {
            return undefined;
        }
    }

    public static async uriToPath(uri: vscode.Uri): Promise<string | undefined> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri;
        if (workspaceRoot===undefined || workspaceRoot?.scheme!=='file') { return undefined; }

        const settingUri = vscode.Uri.joinPath(workspaceRoot, '.overleaf/settings.json');
        try {
            await vscode.workspace.fs.stat(settingUri);
            return uri.path.slice(workspaceRoot.path.length);
        } catch (error) {
            return undefined;
        }
    }

    public static async readSettings(): Promise<any | undefined> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri;
        if (vscode.workspace.workspaceFolders?.length!==1 || workspaceRoot?.scheme!=='file') { return undefined; }

        const settingUri = vscode.Uri.joinPath(workspaceRoot, '.overleaf/settings.json');
        try {
            await vscode.workspace.fs.stat(settingUri);
            const content = await vscode.workspace.fs.readFile(settingUri);
            return JSON.parse( new TextDecoder().decode(content) );
        } catch (error) {
            return undefined;
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

    private async overwrite(root: string='/') {
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
                const baseContent = this.baseCache[relPath];
                const localContent = await this.readFile(relPath);
                const remoteContent = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(vfsUri, name));
                if (baseContent===undefined || localContent===undefined) {
                    await this.writeFile(relPath, remoteContent);
                } else {
                    const dmp = new DiffMatchPatch();
                    const baseContentStr = new TextDecoder().decode(baseContent);
                    const localContentStr = new TextDecoder().decode(localContent);
                    const remoteContentStr = new TextDecoder().decode(remoteContent);
                    // merge local and remote changes
                    const localPatches = dmp.patch_make( baseContentStr, localContentStr );
                    const remotePatches = dmp.patch_make( baseContentStr, remoteContentStr );
                    const [mergedContentStr, _results] = dmp.patch_apply( remotePatches, localContentStr );
                    // write the merged content to local
                    const mergedContent = new TextEncoder().encode(mergedContentStr);
                    await this.writeFile(relPath, mergedContent);
                    // write the merged content to remote
                    if (localPatches.length!==0) {
                        await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(vfsUri, name), mergedContent);
                    }
                }
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
            this.syncCache = this.syncCache.filter(item => item!==key);
            return true;
        }

        return false;
    }

    private async syncFromVFS(vfsUri: vscode.Uri, type: 'update'|'delete') {
        const {pathParts} = parseUri(vfsUri);
        const relPath = '/' + pathParts.join('/');
        const localUri = vscode.Uri.joinPath(this.baseUri, relPath);

        if (this.bypassSync(relPath, type)) { return; }
        this.syncCache.push(`${type} ${relPath}`);
        console.log(`${new Date().toLocaleString()} ${type}: ${relPath} --> ${localUri.path}`);

        // apply update
        this.status = {status: 'pull', message: `${type}: ${relPath}`};
        if (type === 'update') {
            const stat = await vscode.workspace.fs.stat(vfsUri);
            if (stat.type===vscode.FileType.File) {
                const content = await vscode.workspace.fs.readFile(vfsUri);
                await this.writeFile(relPath, content);
                this.baseCache[relPath] = content;
            } else if (stat.type===vscode.FileType.Directory) {
                await vscode.workspace.fs.createDirectory(localUri);
            }
        } else {
            await vscode.workspace.fs.delete(localUri, {recursive:true});
        }
        this.status = {status: 'idle', message: ''};
    }

    private async syncToVFS(localUri: vscode.Uri, type: 'update'|'delete') {
        // get relative path to baseUri
        const basePath = this.baseUri.path;
        const relPath = localUri.path.slice(basePath.length);
        const vfsUri = this.vfs.pathToUri(relPath);

        if (this.bypassSync(relPath, type)) { return; }
        this.syncCache.push(`${type} ${relPath}`);
        console.log(`${new Date().toLocaleString()} ${type}: ${relPath} --> ${vfsUri.toString()}`);

        // apply update
        this.status = {status: 'push', message: `${type}: ${relPath}`};
        if (type === 'update') {
            const stat = await vscode.workspace.fs.stat(localUri);
            if (stat.type===vscode.FileType.File) {
                const content = await vscode.workspace.fs.readFile(localUri);
                await vscode.workspace.fs.writeFile(vfsUri, content);
                this.baseCache[relPath] = content;
            } else if (stat.type===vscode.FileType.Directory) {
                await vscode.workspace.fs.createDirectory(vfsUri);
            }
        } else {
            await vscode.workspace.fs.delete(localUri, {recursive:true});
        }
        this.status = {status: 'idle', message: ''};
    }

    private async initWatch() {
        // write ".overleaf/settings.json" if not exist
        const settingUri = vscode.Uri.joinPath(this.baseUri, '.overleaf/settings.json');
        try {
            await vscode.workspace.fs.stat(settingUri);
        } catch (error) {
            await vscode.workspace.fs.writeFile(settingUri, Buffer.from(
                JSON.stringify({
                    'uri': this.vfs.origin.toString(),
                    'serverName': this.vfs.serverName,
                    'projectName': this.vfs.projectName,
                }, null, 4)
            ));
        }

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

    readFile(relPath: string): Thenable<Uint8Array|undefined> {
        const uri = vscode.Uri.joinPath(this.baseUri, relPath);
        return new Promise(async (resolve, reject) => {
            try {
                const content = await vscode.workspace.fs.readFile(uri);
                resolve(content);
            } catch (error) {
                resolve(undefined);
            }
        });
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
        inputBox.placeholder = vscode.l10n.t('e.g., /home/user/empty/local/folder');
        inputBox.value = '/';
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
                label: vscode.l10n.t('Configure sync ignore patterns ...'),
                callback: async () => {
                    const ignorePatterns = this.getSetting<string[]>(IGNORE_SETTING_KEY) || this.ignorePatterns;
                    const quickPick = vscode.window.createQuickPick();
                    quickPick.ignoreFocusOut = true;
                    quickPick.title = vscode.l10n.t('Press Enter to add a new pattern, or click the trash icon to remove a pattern.');
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
