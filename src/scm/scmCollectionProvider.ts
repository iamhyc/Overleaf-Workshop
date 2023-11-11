import * as vscode from 'vscode';
import { OUTPUT_FOLDER_NAME } from '../consts';
import { VirtualFileSystem } from '../core/remoteFileSystemProvider';

import { BaseSCM, CommitItem } from ".";
import { LocalDoubleSCMProvider } from './localDoubleSCM';
import { LocalGitBridgeSCMProvider } from './localGitBridgeSCMProvider'; 
import { HistoryViewProvider } from './historyViewProvider';
import { GlobalStateManager } from '../utils/globalStateManager';

interface ExtendedSCM extends BaseSCM {}

const supportedSCMs = [
    LocalDoubleSCMProvider,
    // LocalGitBridgeSCMProvider,
];
type SupportedSCM = typeof supportedSCMs[number];

class CoreSCMProvider extends BaseSCM {

    constructor(protected readonly vfs: VirtualFileSystem) {
        super(vfs, vfs.origin);
    }

    get triggers() { return[]; }
    get settingItems() { return[]; }
    async syncFromSCM() {}
    async apply(commitItem: CommitItem) {};

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

    async overwrite(dstSCM: BaseSCM, root: string='/') {
        const baseUri = this.vfs.pathToUri(root);
        vscode.workspace.fs.readDirectory(baseUri).then( async (files) => {
            for (const [name, type] of files) {
                // bypass folders
                if (['.git', '.vscode', `${OUTPUT_FOLDER_NAME}`].includes(name)) {
                    continue;
                }
                // recursively overwrite
                if (type === vscode.FileType.Directory) {
                    const nextRoot = root+name+'/';
                    await this.overwrite(dstSCM, nextRoot);
                } else {
                    const path = vscode.Uri.joinPath(baseUri, name).path;
                    const content = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(baseUri, name));
                    await dstSCM.writeFile(path, content);
                }
            }
        });
    }
}

export class SCMCollectionProvider {
    private readonly core: CoreSCMProvider;
    private readonly scms: {scm:BaseSCM, triggers: vscode.Disposable[]}[] = [];
    private historyDataProvider: HistoryViewProvider;

    constructor(
        private readonly vfs: VirtualFileSystem,
        private readonly context: vscode.ExtensionContext,
    ) {
        this.core = new CoreSCMProvider( vfs );
        this.historyDataProvider = new HistoryViewProvider( vfs );
        this.initSCMs();
    }

    private initSCMs() {
        const scmPersists = GlobalStateManager.getServerProjectSCMPersists(this.context, this.vfs.serverName, this.vfs.projectId);
        Object.values(scmPersists).forEach(scmPersist => {
            const scmProto = supportedSCMs.find(scm => scm.label===scmPersist.label);
            if (scmProto!==undefined) {
                this.createSCM(scmProto, this.vfs.origin, scmPersist.settings);
            }
        });
    }

    private createSCM(scmProto: SupportedSCM, baseUri: vscode.Uri, settings?: JSON) {
        const scm = new scmProto(this.vfs, baseUri, settings);
        const triggers = scm.triggers;
        this.scms.push({scm,triggers});
        return scm;
    }

    private removeSCM(item: {scm:BaseSCM, triggers: vscode.Disposable[]}) {
        const index = this.scms.indexOf(item);
        if (index!==-1) {
            item.triggers.forEach(trigger => trigger.dispose());
            this.scms.splice(index, 1);
        }
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
                label: `Create Source Control: ${scmProto.label} ...`,
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
                    vscode.window.showQuickPick(['Remove', 'Configure...'])
                    .then((action) => {
                        switch (action) {
                            case 'Remove':
                                this.removeSCM(_select.item);
                                break;
                            case 'Configure...':
                                // this.showSCMSettings(_select.item);
                                break;
                        }
                    });
                }
                // create new scm
                if ( _select.scmProto ) {
                    vscode.window.showInputBox({
                        prompt: 'Please input the baseUri of the SCM',
                        placeHolder: _select.scmProto.uriPrompt,
                    }).then((uri) => {
                        if (uri) {
                            const baseUri = vscode.Uri.parse(uri);
                            this.createSCM(_select.scmProto, baseUri);
                        } else {
                            return;
                        }
                    });
                }
            }
        });
    }

    get triggers() {
        return [
            // Register: HistoryViewProvider
            ...this.historyDataProvider.triggers,
            // register commands
            vscode.commands.registerCommand('projectHistory.configSCM', () => {
                this.showSCMConfiguration();
            }),
        ];
    }
    
}