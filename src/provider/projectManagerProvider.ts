import * as vscode from 'vscode';
import { GlobalStateManager } from '../utils/globalStateManager';

class DataItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    ) {
        super(label, collapsibleState);
    }
}

class ServerItem extends DataItem {
    constructor(
        public readonly name: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    ) {
        super(name, collapsibleState);
        this.iconPath = new vscode.ThemeIcon('vm');
        this.contextValue = collapsibleState===vscode.TreeItemCollapsibleState.None ? 'server_no_login' : 'server_login';
    }
}

class ProjectItem extends DataItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'project';
    }
}

export class ProjectManagerProvider implements vscode.TreeDataProvider<DataItem> {
    constructor(
        private context:vscode.ExtensionContext) {
        this.context = context;
    }

    private _onDidChangeTreeData: vscode.EventEmitter<DataItem | undefined | void> = new vscode.EventEmitter<DataItem | undefined | void>();

    readonly onDidChangeTreeData: vscode.Event<DataItem | undefined | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: DataItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: DataItem): Thenable<DataItem[]> {
        if (element) {
            return Promise.resolve([]);
        } else {
            const servers = GlobalStateManager.getServers(this.context);
            const serverItems = Object.values(servers).map(server => new ServerItem(
                server.name,
                server.login?.projects? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
            ));
            return Promise.resolve(serverItems);
        }
    }

    addServer() {
        vscode.window.showInputBox({'placeHolder': 'Overleaf server address, e.g. "http://localhost:8080"'})
        .then((url) => {
            if (url) {
                try {
                    // check if url is valid
                    const _url = new URL(url);
                    if (!(_url.protocol==='http:' || _url.protocol==='https:')) {
                        throw new Error()
                    }
                    if (GlobalStateManager.addServer(this.context, _url.host, _url.href)) {
                        this.refresh();
                    }
                } catch (e) {
                    vscode.window.showErrorMessage('Invalid server address.');
                }
            }
        });
    }

    removeServer(name:string) {
        vscode.window.showInformationMessage(`Remove server "${name}" ?`, "Yes", "No")
        .then((answer) => {
            if (answer === "Yes") {
                if (GlobalStateManager.removeServer(this.context, name)) {
                    this.refresh();
                }
            }
        });
    }

    loginServer(name: string) { 
        vscode.window.showInputBox({'placeHolder': 'Email'})
        .then(email => {
            if (email) {
                vscode.window.showInputBox({'placeHolder': 'Password', 'password': true})
                .then(password => {
                    if (password) {
                        GlobalStateManager.loginServer(this.context, name, {email, password})
                        .then(success => {
                            if (success) {
                                this.refresh();
                            } else {
                                vscode.window.showErrorMessage('Login failed.');
                            }
                        })
                    }
                });
            }
        });
    }

    logoutServer(element: ServerItem) { console.log('logout: ', element.name) }
    refreshServer(element: ServerItem) { console.log('refresh: ', element.name) }
    deleteServer(element: ServerItem) { console.log('delete: ', element.name) }

    openProjectInCurrentWindow(element: ProjectItem) { console.log('open: ', element.label) }
    openProjectInNewWindow(element: ProjectItem) { console.log('open in new window: ', element.label) }
    private _openProject(element: ProjectItem, newWindow: boolean) {}
}
