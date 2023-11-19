import * as vscode from 'vscode';
import { VirtualFileSystem } from '../core/remoteFileSystemProvider';

import { BaseSCM, CommitItem, SettingItem } from ".";
import { LocalReplicaSCMProvider } from './localReplicaSCM';
import { LocalGitBridgeSCMProvider } from './localGitBridgeSCM'; 
import { HistoryViewProvider } from './historyViewProvider';
import { GlobalStateManager } from '../utils/globalStateManager';
import { EventBus } from '../utils/eventBus';

const supportedSCMs = [
    LocalReplicaSCMProvider,
    // LocalGitBridgeSCMProvider,
];
type SupportedSCM = typeof supportedSCMs[number];

class CoreSCMProvider extends BaseSCM {
    constructor(protected readonly vfs: VirtualFileSystem) {
        super(vfs, vfs.origin);
    }

    validateBaseUri() { return Promise.resolve(true); }
    async syncFromSCM() {}
    async apply(commitItem: CommitItem) {};
    get triggers() { return Promise.resolve([]); }
    get settingItems() { return[]; }

    writeFile(path: string, content: Uint8Array): Thenable<void> {
        const uri = this.vfs.pathToUri(path);
        return vscode.workspace.fs.writeFile(uri, content);
    }

    readFile(path: string): Thenable<Uint8Array> {
        const uri = this.vfs.pathToUri(path);
        return vscode.workspace.fs.readFile(uri);
    }

    list(): Iterable<CommitItem> {
        return [];
    }
}

interface SCMRecord {
    scm: BaseSCM;
    triggers: vscode.Disposable[];
}

export class SCMCollectionProvider {
    private readonly core: CoreSCMProvider;
    private readonly scms: SCMRecord[] = [];
    private readonly statusBarItem: vscode.StatusBarItem;
    private readonly statusListener: vscode.Disposable;
    private historyDataProvider: HistoryViewProvider;

    constructor(
        private readonly vfs: VirtualFileSystem,
        private readonly context: vscode.ExtensionContext,
    ) {
        this.core = new CoreSCMProvider( vfs );
        this.historyDataProvider = new HistoryViewProvider( vfs );
        this.initSCMs();

        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        this.statusBarItem.command = 'projectSCM.configSCM';
        this.statusListener = EventBus.on('scmStatusChangeEvent', () => {this.updateStatus();});
    }

    private updateStatus() {
        let numPush = 0, numPull = 0;
        let tooltip = new vscode.MarkdownString(`**Project Source Control**\n\n`);
        tooltip.supportHtml = true;
        tooltip.supportThemeIcons = true;

        // update status bar item tooltip
        if (this.scms.length===0) {
            tooltip.appendMarkdown(`*Click to configure.*\n\n`);
        } else {
            for (const {scm} of this.scms) {
                const icon = scm.iconPath.id;
                const label = (scm.constructor as any).label;
                const uri = scm.baseUri.toString();
                const slideUri = uri.length<=30? uri : uri.replace(/^(.{15}).*(.{15})$/, '$1...$2');
                tooltip.appendMarkdown(`----\n\n$(${icon}) **${label}**: [${slideUri}](${uri})\n\n`);
                //
                if (scm.status.status==='idle') {
                    tooltip.appendMarkdown('&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;*Synced.*\n\n');
                } else {
                    // show status message
                    tooltip.appendMarkdown(`&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;***${scm.status.message}***\n\n`);
                    // update counters
                    switch (scm.status.status) {
                        case 'push': numPush++; break;
                        case 'pull': numPull++; break;
                    }
                }
            }   
        }
        this.statusBarItem.tooltip = tooltip;

        // update status bar item text
        if (numPush!==0) {
            this.statusBarItem.text = `$(cloud-upload)`;
        } else if (numPull!==0) {
            this.statusBarItem.text = `$(cloud-download)`;
        } else {
            this.statusBarItem.text = `$(cloud)`;
        }

        this.statusBarItem.show();
    }

    private initSCMs() {
        const scmPersists = GlobalStateManager.getServerProjectSCMPersists(this.context, this.vfs.serverName, this.vfs.projectId);
        Object.values(scmPersists).forEach(async scmPersist => {
            const scmProto = supportedSCMs.find(scm => scm.label===scmPersist.label);
            if (scmProto!==undefined) {
                const baseUri = vscode.Uri.parse(scmPersist.baseUri);
                await this.createSCM(scmProto, baseUri);
            }
        });
    }

    private async createSCM(scmProto: SupportedSCM, baseUri: vscode.Uri, newSCM=false) {
        const scm = new scmProto(this.vfs, baseUri);
        // insert into global state
        if (newSCM) {
            this.vfs.setProjectSCMPersist(scm.scmKey, {
                label: scmProto.label,
                baseUri: scm.baseUri.path,
                settings: {} as JSON,
            });
        }
        // insert into collection
        try {
            const triggers = await scm.triggers;
            this.scms.push({scm,triggers});
            this.updateStatus();
            return scm;
        } catch (error) {
            // permanently remove failed scm
            this.vfs.setProjectSCMPersist(scm.scmKey, undefined);
            return undefined;
        }
    }

    private removeSCM(item: SCMRecord) {
        const index = this.scms.indexOf(item);
        if (index!==-1) {
            // remove from collection
            item.triggers.forEach(trigger => trigger.dispose());
            this.scms.splice(index, 1);
            // remove from global state
            this.vfs.setProjectSCMPersist(item.scm.scmKey, undefined);
            this.updateStatus();
        }
    }

    private createNewSCM(scmProto: SupportedSCM) {
        return new Promise(resolve => {
            const inputBox = scmProto.baseUriInputBox;
            inputBox.ignoreFocusOut = true;
            inputBox.show();
            //
            inputBox.onDidAccept(() => {
                if (inputBox.selectedItems.length===0) {
                    inputBox.hide();
                    resolve(inputBox.value);
                }
            });
        })
        .then((uri) => scmProto.validateBaseUri(uri as string || ''))
        .then(async (baseUri) => {
            if (baseUri) {
                const scm = await this.createSCM(scmProto, baseUri, true);
                if (scm) {
                    vscode.window.showInformationMessage(`"${scmProto.label}" created: ${scm.baseUri.toString()}.`);
                } else {
                    vscode.window.showErrorMessage(`"${scmProto.label}" creation failed.`);
                }
            }
        });
    }

    private configSCM(scmItem: SCMRecord) {
        const baseUri = scmItem.scm.baseUri.toString();
        const settingItems = scmItem.scm.settingItems as SettingItem[];
        const quickPickItems = [
            {label:'Remove', description:`${baseUri}`},
            {label:'', kind:vscode.QuickPickItemKind.Separator},
            ...settingItems,
        ];

        return vscode.window.showQuickPick(quickPickItems)
        .then((select) => {
            if (select===undefined) { return; }
            switch (select.label) {
                case 'Remove':
                    vscode.window.showInformationMessage(`Remove ${baseUri}?`, 'Yes', 'No')
                    .then((select) => {
                        if (select==='Yes') {
                            this.removeSCM(scmItem);
                        }
                    });
                    break;
                default:
                    const settingItem = settingItems.find(item => item.label===select.label);
                    settingItem?.callback();
                    break;
            }
        });
    }

    showSCMConfiguration() {
        // group 1: show existing scms
        const scmItems: vscode.QuickPickItem[] = this.scms.map((item) => {
            const { scm } = item;
            return {
                label: (scm.constructor as any).label,
                iconPath: scm.iconPath,
                description: scm.baseUri.toString(),
                item,
            };
        });
        if (scmItems.length!==0) {
            scmItems.push({kind:vscode.QuickPickItemKind.Separator, label:''});
        }
        // group 2: create new scm
        const createItems: vscode.QuickPickItem[] = supportedSCMs.map((scmProto) => {
            return {
                label: `Create Source Control: ${scmProto.label}`,
                scmProto,
            };
        });

        // show quick pick
        vscode.window.showQuickPick([...scmItems, ...createItems], {
            placeHolder: 'Select a SCM to configure',
        }).then((select) => {
            if (select) {
                const _select = select as any;
                // configure existing scm
                if (_select.item) {
                    this.configSCM( _select.item as SCMRecord );
                }
                // create new scm
                if ( _select.scmProto ) {
                    this.createNewSCM(_select.scmProto as SupportedSCM );
                }
            }
        });
    }

    get triggers() {
        return [
            // Register: HistoryViewProvider
            ...this.historyDataProvider.triggers,
            // register status bar item
            this.statusBarItem,
            this.statusListener,
            // register commands
            vscode.commands.registerCommand('projectSCM.configSCM', () => {
                return this.showSCMConfiguration();
            }),
            vscode.commands.registerCommand('projectSCM.newSCM', (scmProto) => {
                return this.createNewSCM(scmProto);
            }),
        ];
    }
    
}