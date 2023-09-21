/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import { SocketIOAPI } from '../api/socketio';
import { VirtualFileSystem } from '../provider/remoteFileSystemProvider';

export interface UpdateUserSchema {
    id: string,
    user_id: string,
    name: string,
    email: string,

    doc_id?: string,
    row?: number,
    column?: number,
    last_updated_at?: number, //unix timestamp
}

export interface OnlineUserSchema {
    client_age: number,
    client_id: string,
    connected: boolean,
    cursorData?: {
        column: number,
        doc_id: string,
        row: number,
    },
    email: string,
    first_name: string,
    last_name?: string,
    last_updated_at: string, //unix timestamp
    user_id: string,
}

export class ClientManager {
    private readonly status: vscode.StatusBarItem;
    private readonly onlineUsers: {[K:string]:UpdateUserSchema} = {};

    constructor(
        private readonly vfs: VirtualFileSystem,
        private readonly publicId: string,
        private readonly socket: SocketIOAPI) {
        this.socket.updateEventHandlers({
            onClientUpdated: (user:UpdateUserSchema) => {
                this.onlineUsers[user.id] = {
                    last_updated_at: Date.now(),
                    ...user
                };
                this.updateStatus();
            },
            onClientDisconnected: (id:string) => {
                delete this.onlineUsers[id];
                this.updateStatus();
            }
        });
        this.socket.getConnectedUsers().then(users => {
            users.forEach(user => {
                this.onlineUsers[user.client_id] = {
                    id: user.client_id,
                    user_id: user.user_id,
                    name: [user.first_name, user.last_name].filter(Boolean).join(' '),
                    email: user.email,
                    doc_id: user.cursorData?.doc_id,
                    row: user.cursorData?.row,
                    column: user.cursorData?.column,
                    last_updated_at: Number(user.last_updated_at),
                };
            });
            this.updateStatus();
        });

        this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
        // this.status.command = 'collaboration.clientManager';
        this.updateStatus();
    }

    jumpToUser(id: string) {
        const user = this.onlineUsers[id];
        if (user.doc_id !== undefined && user.row !== undefined && user.column !== undefined) {
            const doc = this.vfs._resolveById(user.doc_id);
            const uri = doc ? this.vfs.pathToUri(doc.path) : undefined;
            uri && vscode.window.showTextDocument(uri, {
                selection: new vscode.Selection(user.row, user.column, user.row, user.column),
                preview: false,
            });
        }
    }

    updatePosition(clientId:string, docId: string, row: number, column: number) {
        this.onlineUsers[clientId].doc_id = docId;
        this.onlineUsers[clientId].row = row;
        this.onlineUsers[clientId].column = column;
    }

    updateStatus() {
        const count = Object.keys(this.onlineUsers).length;
        switch (count) {
            case undefined:
                this.status.text = '$(vm-outline)';
                this.status.tooltip = 'Overleaf Collaboration: Not connected';
                break;
            case 0:
                this.status.text = '$(vm-active)';
                this.status.tooltip = 'Overleaf Collaboration: Active';
                break;
            default:
                this.status.text = `$(vm-active) ${count}`;
                const tooltip = new vscode.MarkdownString();
                tooltip.appendMarkdown('Overleaf Collaboration: Active\n\n');
                Object.values(this.onlineUsers).forEach(user => {
                    const args = JSON.stringify([user.id]);
                    const commandUri = vscode.Uri.parse(`command:collaboration.jumpToUser?${encodeURIComponent(args)}`);
                    const userInfo = `${user.name}`;
                    const doc_path = user.doc_id ? this.vfs._resolveById(user.doc_id)?.path.slice(1) : undefined;
                    const cursorInfo = user.row ? ` @ [${doc_path}#L${user.row+1}](${commandUri})` : '';
                    tooltip.appendMarkdown(`${userInfo} ${cursorInfo}\n\n`);
                });
                tooltip.isTrusted = true;
                this.status.tooltip = tooltip;
                break;
        }
        this.status.show();
    }

    get triggers() {
        return [
            vscode.commands.registerCommand('collaboration.jumpToUser', (uid) => {
                this.jumpToUser(uid);
            }),
            vscode.window.onDidChangeTextEditorSelection(async e => {
                const doc = await this.vfs._resolveUri(e.textEditor.document.uri);
                const docId = doc?.fileEntity?._id;
                if (docId) {
                    this.socket.updatePosition(docId, e.selections[0].active.line, e.selections[0].active.character);
                    this.updatePosition(this.publicId, docId, e.selections[0].active.line, e.selections[0].active.character);
                    this.updateStatus();
                }
            }),
        ];
    }
}
