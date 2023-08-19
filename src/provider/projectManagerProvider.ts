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
        private api: any,
        public readonly name: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    ) {
        super(name, collapsibleState);
        this.api = api;
        this.iconPath = new vscode.ThemeIcon('vm');
        this.contextValue = collapsibleState===vscode.TreeItemCollapsibleState.None ? 'server_no_login' : 'server_login';
    }
}

class ProjectItem extends DataItem {
    constructor(
        public readonly label: string,
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('notebook');
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
            if (element instanceof ServerItem) {
                const _promise = GlobalStateManager.fetchServerProjects(this.context, element.name);
                return _promise.then(projects => {
                    const projectItems = projects.map(project => new ProjectItem(project.name));
                    return projectItems;
                });
            } else {
                return Promise.resolve([]);
            }
        } else {
            const persists = GlobalStateManager.getServers(this.context);
            const serverItems = Object.values(persists).map(persist => new ServerItem(
                persist.api,
                persist.server.name,
                persist.server.login? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
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

    logoutServer(name: string) {
        vscode.window.showInformationMessage(`Logout server "${name}" ?`, "Yes", "No")
        .then((answer) => {
            if (answer === "Yes") {
                GlobalStateManager.logoutServer(this.context, name)
                .then(success => {
                    if (success)
                        this.refresh();
                });
            }
        });
    }
    refreshServer(element: ServerItem) { }
    deleteServer(element: ServerItem) { }

    openProjectInCurrentWindow(element: ProjectItem) { }
    openProjectInNewWindow(element: ProjectItem) { }
    private _openProject(element: ProjectItem, newWindow: boolean) {}
}
