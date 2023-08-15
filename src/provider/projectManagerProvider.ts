import * as vscode from 'vscode';

class DataItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    ) {
        super(label, collapsibleState);
    }
}

class Server extends DataItem {
    constructor(
        public readonly name: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        private viewItem: string,
    ) {
        super(name, collapsibleState);
        this.viewItem = 'server';
    }
}

class Project extends DataItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        private viewItem: string,
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.viewItem = 'project';
    }
}

export class ProjectManagerProvider implements vscode.TreeDataProvider<DataItem> {
    constructor(){}

    getTreeItem(element: DataItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: DataItem): Thenable<DataItem[]> {
        if (element) {
            return Promise.resolve([]);
        } else {
            return Promise.resolve([]);
        }
    }

    addServer() {
        vscode.window.showInputBox({'placeHolder': 'Overleaf server address, e.g. "localhost:8080"'})
        .then((value) => {
            if (value) {
                
            }
        });
    }

    loginServer(element: Server) { console.log('login: ', element.name) }
    logoutServer(element: Server) { console.log('logout: ', element.name) }
    refreshServer(element: Server) { console.log('refresh: ', element.name) }
    deleteServer(element: Server) { console.log('delete: ', element.name) }

    openProjectInCurrentWindow(element: Project) { console.log('open: ', element.label) }
    openProjectInNewWindow(element: Project) { console.log('open in new window: ', element.label) }
    private _openProject(element: Project, newWindow: boolean) {}
}
