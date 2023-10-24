/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import { SocketIOAPI } from '../api/socketio';
import { VirtualFileSystem } from '../provider/remoteFileSystemProvider';
import { ELEGANT_NAME } from '../consts';
import { ChatViewProvider } from './chatViewProvider';

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
        color: UserColors,
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

enum UserColors {
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
    timestamp = Math.floor(timestamp / 1000);
    const hours = Math.floor(timestamp / 3600);
    const minutes = Math.floor(timestamp / 60) % 60;
    const ten_seconds = Math.floor(timestamp % 60 / 10);
    const hoursStr = hours > 0 ? `${hours}h ` : '';
    const minutesStr = minutes > 0 ? `${minutes}m` : '';
    const secondsStr = minutesStr==='' && ten_seconds > 0 ? `${ten_seconds*10}s` : '';
    return `${hoursStr}${minutesStr}${secondsStr}`;
}

export class ClientManager {
    private activeExists?: string;
    private inactivateTask?: NodeJS.Timeout;
    private readonly status: vscode.StatusBarItem;
    private readonly onlineUsers: {[K:string]:UpdateUserSchema} = {};
    private connectedFlag: boolean = true;
    private readonly chatViewer: ChatViewProvider;

    constructor(
        private readonly vfs: VirtualFileSystem,
        private readonly context: vscode.ExtensionContext,
        private readonly publicId: string,
        private readonly socket: SocketIOAPI) {
        this.socket.updateEventHandlers({
            onClientUpdated: (user:UpdateUserSchema) => {
                if (user.id !== this.publicId) { this.setStatusActive(user.id); }
                this.updatePosition(user.id, user.doc_id, user.row, user.column, user);
            },
            onClientDisconnected: (id:string) => {
                this.removePosition(id);
            },
            onDisconnected: () => {
                this.connectedFlag = false;
            },
            onConnectionAccepted: (publicId:string) => {
                this.connectedFlag = true;
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

        this.chatViewer = new ChatViewProvider(this.vfs, this.publicId, this.context.extensionUri, this.socket);
        this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
        this.updateStatus();
    }

    setStatusActive(clientId:string, timeout:number=10) {
        this.inactivateTask && clearTimeout(this.inactivateTask);
        this.inactivateTask = setTimeout(() => {
            this.activeExists = undefined;
        }, timeout*1000);
        this.activeExists = clientId;
    }

    private jumpToUser(id: string) {
        const user = this.onlineUsers[id];
        const doc = this.vfs._resolveById(user.doc_id);
        const uri = doc ? this.vfs.pathToUri(doc.path) : undefined;
        uri && vscode.window.showTextDocument(uri, {
            selection: new vscode.Selection(user.row, user.column, user.row, user.column),
            preview: false,
        });
    }

    private refreshDecorations(visibleTextEditors: readonly vscode.TextEditor[]) {
        Object.values(this.onlineUsers).forEach(user => {
            const doc = this.vfs._resolveById(user.doc_id);
            const uri = doc && this.vfs.pathToUri(doc.path);
            const editor = uri && vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri.toString());
            const selection = user.selection;
            selection && editor?.setDecorations(selection.decoration, selection.ranges);
        });
    }

    private updatePosition(clientId:string, docId: string, row: number, column: number, details?:UpdateUserSchema) {
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
            const color = Object.values(UserColors)[length % Object.keys(UserColors).length];
            const decoration = vscode.window.createTextEditorDecorationType({
                outline: `1px solid ${color}`,
                overviewRulerColor: color,
                rangeBehavior: vscode.DecorationRangeBehavior.OpenClosed,
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
    }

    private removePosition(clientId:string) {
        const doc = this.vfs._resolveById(this.onlineUsers[clientId]?.doc_id);
        const uri = doc && this.vfs.pathToUri(doc.path);
        const editor = uri && vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri.toString());
        // delete decoration
        const selection = this.onlineUsers[clientId].selection;
        selection && editor?.setDecorations(selection.decoration, []);
        // delete record
        delete this.onlineUsers[clientId];
    }

    private updateStatus() {
        const count = Object.keys(this.onlineUsers).length;
        switch (this.connectedFlag){
            case false:
                this.status.color = 'red';
                this.status.text = '$(sync-ignored)';
                this.status.tooltip = `${ELEGANT_NAME}: Not connected`;
                // Kick out all users indication since the connection is lost
                Object.keys(this.onlineUsers).forEach(clientId => {
                    this.removePosition(clientId);
                });
                break;
            case true:
                switch (count) {
                    case 0:
                        this.status.color = undefined;
                        this.status.text = '$(organization)';
                        this.status.tooltip = `${ELEGANT_NAME}: Online`;
                        break;
                    default:
                        this.status.color = this.activeExists ? this.onlineUsers[this.activeExists].selection?.color : undefined;
                        this.status.text = `$(organization) ${count}`;
                        const tooltip = new vscode.MarkdownString();
                        tooltip.appendMarkdown(`${ELEGANT_NAME}: ${this.activeExists?"Active":"Idle"}\n\n`);
                        Object.values(this.onlineUsers).forEach(user => {
                            const userArgs = JSON.stringify([`@[[${user.name}#${user.user_id}]] `]);
                            const userCommandUri = vscode.Uri.parse(`command:collaboration.insertText?${encodeURIComponent(userArgs)}`);
                            const userInfo = `<a href=${userCommandUri}>@<span style="color:${user.selection?.color};"><b>${user.name}</b></span></a>`;

                            const jumpArgs = JSON.stringify([user.id]);
                            const jumpCommandUri = vscode.Uri.parse(`command:collaboration.jumpToUser?${encodeURIComponent(jumpArgs)}`);
                                    const docPath = user.doc_id ? this.vfs._resolveById(user.doc_id)?.path.slice(1) : undefined;
                                    const cursorInfo = user.row ? ` at <a href="${jumpCommandUri}">${docPath}#L${user.row+1}</a>` : '';
                
                            const since_last_update = user.last_updated_at ? formatTime(Date.now() - user.last_updated_at) : '';
                            const timeInfo = since_last_update==='' ? 'Just now' : `${since_last_update} ago`;
                            tooltip.appendMarkdown(`${userInfo} ${cursorInfo} ${timeInfo}\n\n`);
                        });
                        tooltip.isTrusted = true;
                        tooltip.supportHtml = true;
                        this.status.tooltip = tooltip;
                        break;
                }
                break;
        }
        
        this.status.show();
        setTimeout(this.updateStatus.bind(this), 500);
    }

    get triggers() {
        return [
            // register commands
            vscode.commands.registerCommand('collaboration.insertText', (text) => {
                this.chatViewer.insertText(text);
            }),
            vscode.commands.registerCommand('collaboration.jumpToUser', (uid) => {
                this.jumpToUser(uid);
            }),
            // register chat view provider
            ...this.chatViewer.triggers,
            // update this client's position
            vscode.window.onDidChangeTextEditorSelection(async e => {
                if (e.kind===undefined) { return; }
                const doc = await this.vfs._resolveUri(e.textEditor.document.uri);
                const docId = doc?.fileEntity?._id;
                if (docId) {
                    this.socket.updatePosition(docId, e.selections[0].active.line, e.selections[0].active.character);
                }
            }),
            // refresh decorations when editor is switched
            vscode.window.onDidChangeVisibleTextEditors(e => {
                this.refreshDecorations(e);
            }),
        ];
    }
}
