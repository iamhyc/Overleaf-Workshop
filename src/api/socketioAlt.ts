/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { BaseAPI, Identity, ProjectMessageResponseSchema, ProjectSettingsSchema } from './base';
import { FileEntity, DocumentEntity, FileRefEntity, FileType, FolderEntity, ProjectEntity, VirtualFileSystem } from '../core/remoteFileSystemProvider';
import { OnlineUserSchema, UpdateSchema, UpdateUserSchema } from './socketio';

const MessageRefreshInterval = 3*1000;//ms
const SettingsRefreshInterval = 12*1000;//ms

type EmitCallbackType = (err: Error|undefined, ...data:any[]) => void;
type EmitEventsSupport = {
    'joinProject': [{project_id: string}],
    'joinDoc': [string, {encodeRanges: true}], //docId
    'leaveDoc': [string], //docId
    'applyOtUpdate': [string, UpdateSchema],
    'clientTracking.getConnectedUsers': [],
    'clientTracking.updatePosition': [{doc_id:string,row:number,column:number}],
};
type ListenEventsSupport = {
    // initially triggered
    'connect': {},
    'connectionAccepted': {_:any, publicId:string},
    'joinProjectResponse': {publicId:string,project:ProjectEntity},
    // manually triggered
    'disconnect': {},
    // not triggered
    'connect_failed': {},
    'forceDisconnect': {message:string, delay:number},
    'connectionRejected': {err:{message:string}},
    'error': {err:{message:string}},
    'otUpdateApplied': {update:UpdateSchema},

    // (periodically) via FileTree diff
    'reciveNewDoc': {parentFolderId:string, doc:DocumentEntity},
    'reciveNewFile': {parentFolderId:string, file:FileEntity},
    'reciveNewFolder': {parentFolderId:string, folder:FolderEntity},
    'reciveEntityRename': {entityId:string, newName:string},
    'removeEntity': {entityId:string},
    'reciveEntityMove': {entityId:string, folderId:string},
    // (periodically) via FileTree diff
    'clientTracking.clientUpdated': {user:UpdateUserSchema},
    'clientTracking.clientDisconnected': {publicId:string},
    // (periodically) via `getMessages`
    'new-chat-message': {message:ProjectMessageResponseSchema},
    // (periodically) via `getProjectSettings`
    'spellCheckLanguageUpdated': {language:string},
    'compilerUpdated': {compiler:string},
};


export class SocketIOAlt {
    private _eventEmitter = new EventEmitter();

    private msgRefreshTask?: NodeJS.Timeout;
    private msgCache?: string[];

    private settingsRefreshTask?: NodeJS.Timeout;
    private settingsCache?: ProjectSettingsSchema;

    constructor(
                private readonly url:string,
                private readonly api:BaseAPI,
                private readonly identity:Identity,
                private readonly projectId:string,
                private readonly record: Promise<ProjectEntity>,
    ) {
        setTimeout(async () => {
            this._eventEmitter.emit('connect');
            this._eventEmitter.emit('connectionAccepted', undefined, '');
            this._eventEmitter.emit('joinProjectResponse', '', await this.record);
        }, 100);

        this.msgRefreshTask = setInterval(this.refreshMessages, MessageRefreshInterval);
        this.settingsRefreshTask = setInterval(this.refreshProjectSettings, SettingsRefreshInterval);
    }

    private get vfs(): Thenable<VirtualFileSystem> {
        return vscode.commands.executeCommand('remoteFileSystem.prefetch', vscode.Uri.parse(this.url));
    }

    private async refreshMessages() {
        if (this.msgCache===undefined) {
            this.msgCache = (await this.api.getMessages(this.identity, this.projectId)).messages?.map(m => m.id);
        } else {
            let fetchNum = 2;
            let lastOldMessageId:string|undefined;
            let newMessages:ProjectMessageResponseSchema[]|undefined;
            // fetch messages until the last old message is found
            do {
                newMessages = (await this.api.getMessages(this.identity, this.projectId, fetchNum)).messages;
                const newMessageIds = newMessages?.map(m => m.id);
                lastOldMessageId = newMessageIds?.find(id => this.msgCache?.includes(id));
                if (lastOldMessageId===undefined) {
                    fetchNum += 2;
                    continue;
                } else {
                    this.msgCache = newMessageIds;
                    break;
                }
            } while(true);
            // notify new messages
            const lastOldMessageIndex = newMessages?.findIndex(m => m.id===lastOldMessageId);
            if (lastOldMessageIndex!==undefined && lastOldMessageIndex!==-1) {
                const notifyMessages = newMessages?.slice(lastOldMessageIndex+1, newMessages.length);
                notifyMessages?.reverse().forEach(m => this._eventEmitter.emit('new-chat-message', m));
            }
        }
    }

    private async refreshProjectSettings() {
        const settings = (await this.api.getProjectSettings(this.identity, this.projectId)).settings;
        if (settings) {
            if (settings.compilers!==this.settingsCache?.compilers) {
                this._eventEmitter.emit('compilerUpdated', settings.compilers);
            }
            if (settings.languages!==this.settingsCache?.languages) {
                this._eventEmitter.emit('spellCheckLanguageUpdated', settings.languages);
            }
            this.settingsCache = settings;
        }
    }

    disconnect() {
        this.msgRefreshTask && clearInterval(this.msgRefreshTask);
        this.settingsRefreshTask && clearInterval(this.settingsRefreshTask);
        this._eventEmitter.emit('disconnect');
    }

    emit(event: string, ...parameters: any): void {
        const args = parameters.slice(0, parameters.length - 1);
        const callback: EmitCallbackType = parameters[parameters.length - 1];

        switch (event as keyof EmitEventsSupport) {
            case 'joinProject':
                this.record.then((project) => {
                    callback(undefined, project);
                });
                break;
            case 'joinDoc':
                const rDocId = args[0];
                this.api.getFile(this.identity, this.projectId, rDocId).then(res => {
                    if (res.type==='success') {
                        const docLines = new TextDecoder().decode(res.content).split('\n');
                        //FIXME: version, updates, ranges
                        const version = 0;
                        const updates:any[]=[], ranges:any[]=[];
                        callback(undefined, docLines, version, updates, ranges);
                    } else {
                        callback(new Error('File not found'));
                    }
                });
                break;
            case 'applyOtUpdate':
                const uDocId = args[0];
                break;
            case 'clientTracking.getConnectedUsers':
                //FIXME: get connected users
                const connectedUsers:OnlineUserSchema[] = [];
                callback(undefined, connectedUsers);
                break;
            case 'leaveDoc':
                //FIXME: upload the file
                const wDocId = args[0];
                break;
            case 'clientTracking.updatePosition':
            default:
                callback(undefined, undefined);
                break;
        }
    }

    on<T extends keyof ListenEventsSupport>(event: T, handler: (arg: ListenEventsSupport[T]) => void): void {
        this._eventEmitter.on(event, handler);
    }
}
