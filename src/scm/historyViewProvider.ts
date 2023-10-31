/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import { EventBus } from '../utils/eventBus';
import { RemoteFileSystemProvider, parseUri } from '../core/remoteFileSystemProvider';
import { OUTPUT_FOLDER_NAME, ROOT_NAME } from '../consts';
import { ProjectLabelResponseSchema } from '../api/base';

interface HistoryRecord {
    before?: number,
    currentVersion?: number,
    keyVersions: number[], //array of all `fromV` values
    revisions: {
        [fromV:number]: {
            toV: number,
            timestamp: number,
            users: {
                id: string,
                first_name: string,
                last_name?: string,
                email: string,
            }[]
        }
    },
    labels: {[version:number]: ProjectLabelResponseSchema[]},
    diff: {
        [path:string] : number[] //array of version numbers
    }
}

function formatTime(timestamp:number) {
    const msPerMinute = 60 * 1000;
    const msPerHour = msPerMinute * 60;
    const msPerDay = msPerHour * 24;
    const msPerMonth = msPerDay * 30;
    const msPerYear = msPerDay * 365;

    const elapsed = Date.now() - timestamp;

    if (elapsed < msPerMinute) {
        const elapsedSeconds = Math.round(elapsed/1000);
        return elapsedSeconds===0 ? 'now' : elapsedSeconds + 's';
    } else if (elapsed < msPerHour) {
        const elapsedMinutes = Math.round(elapsed/msPerMinute);
        return elapsedMinutes===1 ? '1 min' : elapsedMinutes + ' mins';
    } else if (elapsed < msPerDay ) {
        const elapsedHours = Math.round(elapsed/msPerHour );
        return elapsedHours===1 ? '1 hour' : elapsedHours + ' hours';
    } else if (elapsed < msPerMonth) {
        const elapsedDays = Math.round(elapsed/msPerDay);
        return elapsedDays===1 ? '1 day' : elapsedDays + ' days';
    } else if (elapsed < msPerYear) {
        const elapsedMonths = Math.round(elapsed/msPerMonth);
        return elapsedMonths===1 ? '1 month' : elapsedMonths + ' months';
    } else {
        const elapsedYears = Math.round(elapsed/msPerYear );
        return elapsedYears===1 ? '1 year' : elapsedYears + ' years';
    }
}

class HistoryItem extends vscode.TreeItem {
    constructor(
        label: string,
        readonly version: number,
        readonly tags?: ProjectLabelResponseSchema[]
    ) {
        const _tag = tags?.map(t=>t.comment).join(' | ');
        const _label = _tag? `${label} (${_tag})` : label;
        super(_label, vscode.TreeItemCollapsibleState.None);
        this.iconPath = _tag?.length? new vscode.ThemeIcon('tag') : new vscode.ThemeIcon('history');
        this.contextValue = _tag ? 'historyItemLabelled' : 'historyItem';
    }
}

export class HistoryDataProvider implements vscode.TreeDataProvider<HistoryItem>, vscode.TextDocumentContentProvider {
    private _path?: string;
    private _history?: HistoryRecord;

    constructor(private readonly vfsm: RemoteFileSystemProvider) {
        setInterval(this.refresh.bind(this), 30*1000);
    }

    private _onDidChangeTreeData: vscode.EventEmitter<HistoryItem | undefined | void> = new vscode.EventEmitter<HistoryItem | undefined | void>();

    readonly onDidChangeTreeData: vscode.Event<HistoryItem | undefined | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    async refreshData(path?:string, force:boolean=false) {
        this._path = path;
        if (force) {
            this._history = undefined;
        }
        await this.getHistory();
        this.refresh();
    }

    getTreeItem(element: HistoryItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: HistoryItem): Thenable<HistoryItem[]> {
        if (element !== undefined) { return Promise.resolve([]); }
        if (!this._history) { return Promise.resolve([]); }

        const _history = this._history;
        const versions = this._path? this._history.diff[this._path] : this._history.keyVersions;
        const historyItems = versions?.map(v => {
            const _version = Number( Object.keys(_history.revisions).find(fromV => v<=Number(fromV)) );

            const item = new HistoryItem(
                `Version ${_version}`,
                _version,
                _history.labels[_version],
            );
            const revision = _history.revisions[_version];
            item.description = '\t'+formatTime(revision.timestamp);
            item.tooltip = new vscode.MarkdownString(`$(history) ${new Date(revision.timestamp).toDateString()}\n\n`);
            item.tooltip.appendMarkdown(`**Participants**\n\n`);
            for (const user of revision.users) {
                item.tooltip.appendMarkdown(`$(account) ${user.first_name} ${user.last_name?user.last_name:''} (${user.email})\n`);
            }
            _history.labels[_version].length && item.tooltip.appendMarkdown(`\n**Comments**\n\n`);
            for (const label of _history.labels[_version]) {
                item.tooltip.appendMarkdown(`\`$(tag) ${label.comment}\` \n`);
            }
            item.tooltip.supportThemeIcons = true;
            if (this._path) {
                item.command = {
                    command: 'vscode.diff',
                    title: 'Compare with Previous',
                    arguments: [
                        vscode.Uri.parse(`${ROOT_NAME}-diff:${this._path}?${_version}`),
                        vscode.Uri.parse(`${ROOT_NAME}-diff:${this._path}?${revision.toV}`),
                        `${this._path} (v${_version} vs v${revision.toV})`,
                    ],
                };
            } else {
                //TODO: display global diff
            }
            return item;
        }) || [];

        if (this._history.before) {
            const item = new HistoryItem('Load More ...', NaN);
            item.iconPath = undefined;
            item.command = {
                command: 'projectHistory.loadMore',
                title: 'Load More ...',
                arguments: [this],
            };
            historyItems.push(item);
        }
        return Promise.resolve(historyItems);
    }

    provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<string> {
        const [pathname, version] = [uri.path, uri.query];
        const _uri = vscode.workspace.workspaceFolders?.[0].uri;
        if (!_uri) { return Promise.reject(); }

        return this.vfsm.prefetch(_uri)
        .then(vfs => vfs.getFileDiff(pathname, Number(version), Number(version)))
        .then(diff => {
            const text = diff?.diff[0]?.u;
            return Promise.resolve(text);
        });
    }

    get triggers() {
        return [
            vscode.workspace.registerTextDocumentContentProvider(`${ROOT_NAME}-diff`, this),
            // register commands
            vscode.commands.registerCommand('projectHistory.refresh', async () => {
                await this.refreshData(this._path, true);
            }),
            vscode.commands.registerCommand('projectHistory.loadMore', async (provider: HistoryDataProvider) => {
                await provider.getHistory(provider._history?.before);
                provider.refresh();
            }),
            vscode.commands.registerCommand('projectHistory.createLabel', async (item: HistoryItem) => {
                const label = await vscode.window.showInputBox({
                    prompt: 'Create a new label',
                    placeHolder: 'Enter a label name',
                });
                if (!label) { return; }

                const uri = vscode.workspace.workspaceFolders?.[0].uri;
                if (!uri) { return; }

                const vfs = await this.vfsm.prefetch(uri);
                const res = await vfs.createLabel(label, item.version);
                if (res) {
                    this._history?.labels[item.version].push(res);
                    this.refresh();
                }
            }),
            vscode.commands.registerCommand('projectHistory.deleteLabel', async (item: HistoryItem) => {
                const label = await vscode.window.showQuickPick(
                    item.tags?.map(t=>t.comment) || [],
                    { placeHolder: 'Select a label to delete' }
                );
                if (!label) { return; }

                const uri = vscode.workspace.workspaceFolders?.[0].uri;
                if (!uri) { return; }

                const vfs = await this.vfsm.prefetch(uri);
                const version = item.version;
                const labelId = item.tags?.find(t=>t.comment===label)?.id;
                const res = labelId && await vfs.deleteLabel(labelId);
                if (res) {
                    this._history?.labels[version].splice(
                        this._history?.labels[version].findIndex(t=>t.id===labelId), 1
                    );
                    this.refresh();
                }
            }),
            vscode.commands.registerCommand('projectHistory.downloadProject', async (item:HistoryItem) => {
                const uri = vscode.workspace.workspaceFolders?.[0].uri;
                if (!uri) { return; }
                const vfs = await this.vfsm.prefetch(uri);
                const version = item.version;
                const content = await vfs.downloadProjectArchive(version);
                const filename = `${vfs.projectName}-v${version}.zip`;

                const savePath = await vscode.window.showSaveDialog({
                    defaultUri: vscode.Uri.file(filename),
                    filters: { 'Zip Archive': ['zip'] },
                });
                if (!savePath) { return; }
                await vscode.workspace.fs.writeFile(savePath, content);
                vscode.window.showInformationMessage(`Project v${version} saved to ${savePath.fsPath}`);
            }),
        ];
    }

    private async getHistory(before?:number): Promise<HistoryRecord> {
        const uri = vscode.workspace.workspaceFolders?.[0].uri;
        if (!uri) { return Promise.reject(); }

        if (this._history===undefined) { // first time load
            this._history = {
                before: undefined,
                keyVersions: [], revisions: {},
                labels: {}, diff: {},
            };
        } else if (before===undefined) { // don't have to load
            return Promise.resolve(this._history);
        }

        const vfs = await this.vfsm.prefetch(uri);
        const updates = await vfs.getUpdates(before);
        this._history.before = updates?.nextBeforeTimestamp;
        
        // parse updates
        for (const update of updates?.updates!) {
            this._history.keyVersions.push(update.fromV);
            this._history.revisions[update.fromV] = {
                toV: update.toV,
                timestamp: update.meta.start_ts,
                users: update.meta.users,
            };
            this._history.labels[update.fromV] = update.labels;
            for (const path of update.pathnames) {
                this._history.diff[path] ?
                this._history.diff[path].push(update.fromV)
                : this._history.diff[path] = [update.fromV];
            }
            for (const op of update.project_ops) {
                if (op.add) {
                    this._history.diff[op.add.pathname] ?
                    this._history.diff[op.add.pathname].push(op.atV)
                    : this._history.diff[op.add.pathname] = [op.atV];
                } else if (op.remove) {
                    this._history.diff[op.remove.pathname] ?
                    this._history.diff[op.remove.pathname].push(op.atV)
                    : this._history.diff[op.remove.pathname] = [op.atV];
                }
            }
        }

        return Promise.resolve(this._history);
    }
}

export class HistoryViewProvider {
    private treeDataProvider: HistoryDataProvider;
    private historyView: vscode.TreeView<HistoryItem>;

    constructor(vfsm: RemoteFileSystemProvider) {
        const treeDataProvider = new HistoryDataProvider(vfsm);
        this.historyView = vscode.window.createTreeView('projectHistory', { treeDataProvider});
        this.treeDataProvider = treeDataProvider;
        this.updateView();
    }

    updateView(pathParts?: string[]) {
        this.historyView.description = pathParts?.at(-1);
        this.treeDataProvider.refreshData( pathParts?.join('/') );
    }

    get triggers() {
        return [
            ...this.treeDataProvider.triggers,
            // register commands
            vscode.commands.registerCommand('projectHistory.clearSelection', async() => {
                this.updateView(undefined);
            }),
            // on file open
            EventBus.on('fileWillOpenEvent', async ({uri}) => {
                setTimeout(() => {
                    // filter noise read events
                    const activeTextUri = vscode.window.activeTextEditor?.document.uri;
                    if (activeTextUri && activeTextUri.path!==uri.path) { return; }
                    if (!activeTextUri && vscode.workspace.textDocuments.map(d=>d.uri.path).includes(uri.path)) { return; }

                    // filter output folder
                    const {pathParts} = parseUri(uri);
                    if (pathParts[0]===OUTPUT_FOLDER_NAME) { return; }

                    this.updateView( pathParts );
                }, 100);
            }),
        ];
    }
}
