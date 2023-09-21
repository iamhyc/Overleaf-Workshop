/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import { SocketIOAPI } from '../api/socketio';
import { VirtualFileSystem } from '../provider/remoteFileSystemProvider';

export interface UpdateUserSchema {
    id: string,
    user_id: string,
    name: string,
    email: string,
    doc_id: string,
    row: number,
    column: number,

    last_updated_at?: number, //unix timestamp
    selection?: {
        color: UserColor,
        hoverMessage: vscode.MarkdownString,
        decoration: vscode.TextEditorDecorationType,
        ranges: vscode.DecorationOptions[],
    },
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

enum UserColor {
    ORANGE = '#ff8000',
    PURPLE = '#8000ff',
    PINK = '#ff00ff',
    BROWN = '#804000',
    GRAY = '#808080',
    LIGHT_BLUE = '#0080ff',
    LIGHT_GREEN = '#00ff80',
    LIGHT_PURPLE = '#ff80ff',
    LIGHT_PINK = '#ff80c0',
    LIGHT_YELLOW = '#ffff80',
    LIGHT_ORANGE = '#ffc080',
    LIGHT_RED = '#ff8080',
    LIGHT_GRAY = '#c0c0c0',
    LIGHT_BROWN = '#c08040',
    DARK_BLUE = '#000080',
    DARK_GREEN = '#008040',
    DARK_PURPLE = '#800080',
    DARK_PINK = '#ff0080',
    DARK_YELLOW = '#808000',
    DARK_ORANGE = '#804000',
    DARK_RED = '#800000',
    DARK_GRAY = '#808080',
    DARK_BROWN = '#804000',
}

function formatTime(timestamp:number) {
    const hours = Math.floor(timestamp / 3600);
    const minutes = Math.floor(timestamp / 60) % 60;
    const seconds = timestamp % 60;
    const hoursStr = hours > 0 ? `${hours}h ` : '';
    const minutesStr = minutes > 0 ? `${minutes}m ` : '';
    const secondsStr = seconds > 0 ? `${seconds}s` : '';
    return `${hoursStr}${minutesStr}${secondsStr}`;
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
                this.updatePosition(user.id, user.doc_id, user.row, user.column, user);
            },
            onClientDisconnected: (id:string) => {
                this.removePosition(id);
            }
        });
        this.socket.getConnectedUsers().then(users => {
            users.forEach(user => {
                const onlineUser = {
                    id: user.client_id,
                    user_id: user.user_id,
                    name: [user.first_name, user.last_name].filter(Boolean).join(' '),
                    email: user.email,
                    doc_id: user.cursorData?.doc_id || '',
                    row: user.cursorData?.row || 0,
                    column: user.cursorData?.column || 0,
                    last_updated_at: Number(user.last_updated_at),
                };
                if (user.client_id !== this.publicId) {
                    this.onlineUsers[user.client_id] = onlineUser;
                    this.updatePosition(user.client_id, onlineUser.doc_id, onlineUser.row, onlineUser.column, onlineUser);
                }
            });
        });

        this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
        this.status.command = 'collaboration.refreshStatus';
        this.updateStatus();
    }

    jumpToUser(id: string) {
        const user = this.onlineUsers[id];
        const doc = this.vfs._resolveById(user.doc_id);
        const uri = doc ? this.vfs.pathToUri(doc.path) : undefined;
        uri && vscode.window.showTextDocument(uri, {
            selection: new vscode.Selection(user.row, user.column, user.row, user.column),
            preview: false,
        });
    }

    refreshDecorations(visibleTextEditors: readonly vscode.TextEditor[]) {
        Object.values(this.onlineUsers).forEach(user => {
            const doc = this.vfs._resolveById(user.doc_id);
            const uri = doc && this.vfs.pathToUri(doc.path);
            const editor = uri && vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri.toString());
            const selection = user.selection;
            selection && editor?.setDecorations(selection.decoration, selection.ranges);
        });
    }

    updatePosition(clientId:string, docId: string, row: number, column: number, details?:UpdateUserSchema) {
        if (clientId === this.publicId) { return; }

        // update record
        if (this.onlineUsers[clientId]===undefined) {
            if (details === undefined) { return; }
            this.onlineUsers[clientId] = {
                last_updated_at: Date.now(),
                ...details
            };
        } else {
            this.onlineUsers[clientId].doc_id = docId;
            this.onlineUsers[clientId].row = row;
            this.onlineUsers[clientId].column = column;
            this.onlineUsers[clientId].last_updated_at = Date.now();
        }

        const selection = this.onlineUsers[clientId].selection;
        // remove decoration
        const oldDoc = this.vfs._resolveById(this.onlineUsers[clientId]?.doc_id);
        if (oldDoc && oldDoc.fileEntity._id !== docId && selection) {
            const oldUri = this.vfs.pathToUri(oldDoc.path);
            const oldEditor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === oldUri.toString());
            oldEditor && oldEditor.setDecorations(selection.decoration, []);
        }
        // update decoration
        const newDoc = this.vfs._resolveById(docId);
        const newUri = newDoc && this.vfs.pathToUri(newDoc.path);
        const newEditor = newUri && vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === newUri.toString());
        if (selection===undefined) {
            const length = Object.keys(this.onlineUsers).length;
            const color = Object.values(UserColor)[length % Object.keys(UserColor).length];
            const decoration = vscode.window.createTextEditorDecorationType({
                outline: `1px solid ${color}`,
                overviewRulerColor: color,
            });
            const hoverMessage = new vscode.MarkdownString(`<span style="color:${color};"><b>${this.onlineUsers[clientId].name}</b></span>`);
            hoverMessage.supportHtml = true;
            const _selection = {
                color,
                decoration,
                hoverMessage,
                ranges: [{
                    range: new vscode.Range(row, column, row, column),
                    hoverMessage: hoverMessage,
                }],
            };
            this.onlineUsers[clientId].selection = _selection;
            newEditor?.setDecorations(_selection.decoration, _selection.ranges);
        } else {
            selection.ranges = [{
                range: new vscode.Range(row, column, row, column),
                hoverMessage: selection.hoverMessage,
            }];
            newEditor?.setDecorations(selection.decoration, selection.ranges);
        }

        // update status bar
        this.updateStatus();
    }

    removePosition(clientId:string) {
        const doc = this.vfs._resolveById(this.onlineUsers[clientId]?.doc_id);
        const uri = doc && this.vfs.pathToUri(doc.path);
        const editor = uri && vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri.toString());
        // delete decoration
        const selection = this.onlineUsers[clientId].selection;
        selection && editor?.setDecorations(selection.decoration, []);
        // delete record
        delete this.onlineUsers[clientId];
        this.updateStatus();
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
                this.status.tooltip = 'Overleaf Collaboration: Online';
                break;
            default:
                this.status.text = `$(vm-active) ${count}`;
                const tooltip = new vscode.MarkdownString();
                tooltip.appendMarkdown('Overleaf Collaboration: Online\n\n');
                Object.values(this.onlineUsers).forEach(user => {
                    const args = JSON.stringify([user.id]);
                    const commandUri = vscode.Uri.parse(`command:collaboration.jumpToUser?${encodeURIComponent(args)}`);
                    const userInfo = `[<span style="color:${user.selection?.color};"><b>${user.name}</b></span>](mailto:${user.email})`;
                    const docPath = user.doc_id ? this.vfs._resolveById(user.doc_id)?.path.slice(1) : undefined;
                    const cursorInfo = user.row ? ` @ [${docPath}#L${user.row+1}](${commandUri})` : '';
                    const timeInfo = user.last_updated_at ? formatTime(Math.floor((Date.now() - user.last_updated_at) / 1000))+' ago' : '';
                    tooltip.appendMarkdown(`${userInfo} ${cursorInfo} ${timeInfo}\n\n`);
                });
                tooltip.isTrusted = true;
                tooltip.supportHtml = true;
                this.status.tooltip = tooltip;
                break;
        }
        this.status.show();
    }

    get triggers() {
        return [
            // register commands
            vscode.commands.registerCommand('collaboration.jumpToUser', (uid) => {
                this.jumpToUser(uid);
            }),
            vscode.commands.registerCommand('collaboration.refreshStatus', () => {
                this.updateStatus();
            }),
            // update this client's position
            vscode.window.onDidChangeTextEditorSelection(async e => {
                const doc = await this.vfs._resolveUri(e.textEditor.document.uri);
                const docId = doc?.fileEntity?._id;
                if (docId) {
                    this.socket.updatePosition(docId, e.selections[0].active.line, e.selections[0].active.character);
                }
            }),
            //
            vscode.window.onDidChangeVisibleTextEditors(e => {
                this.refreshDecorations(e);
            }),
        ];
    }
}
