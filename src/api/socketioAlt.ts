/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as DiffMatchPatch from 'diff-match-patch';
import { EventEmitter } from 'events';
import { BaseAPI, Identity, ProjectMessageResponseSchema, ProjectSettingsSchema } from './base';
import { FileEntity, DocumentEntity, FileRefEntity, FileType, FolderEntity, ProjectEntity, VirtualFileSystem } from '../core/remoteFileSystemProvider';
import { OnlineUserSchema, UpdateSchema, UpdateUserSchema } from './socketio';

const VFSRefreshInterval = 10*1000;//ms
const MessageRefreshInterval = 3*1000;//ms
const SettingsRefreshInterval = 12*1000;//ms
const DisconnectionTimeout = 3*60*1000;//ms

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

    // (periodically) via FileTree diff
    //'reciveNewDoc': {parentFolderId:string, doc:DocumentEntity},
    'reciveNewFile': {parentFolderId:string, file:FileEntity},
    //'reciveNewFolder': {parentFolderId:string, folder:FolderEntity},
    'reciveEntityRename': {entityId:string, newName:string},
    'reciveEntityMove': {entityId:string, folderId:string},
    'removeEntity': {entityId:string},
    //'otUpdateApplied': {update:UpdateSchema},
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

    private vfsRefreshTask?: NodeJS.Timeout;
    private vfsLocalVersion?: number;
    private localChangesPath: {parentFolderId:string,filename:string,path:string}[] = [];
    private connectedUsers: UpdateUserSchema[] = [];

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

        this.vfsRefreshTask = setInterval(this.refreshVFS, VFSRefreshInterval);
        this.msgRefreshTask = setInterval(this.refreshMessages, MessageRefreshInterval);
        this.settingsRefreshTask = setInterval(this.refreshProjectSettings, SettingsRefreshInterval);
    }

    private get randomEntityId(): string {
        return [...Array(24)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
    }

    private get vfs(): Thenable<VirtualFileSystem> {
        return vscode.commands.executeCommand('remoteFileSystem.prefetch', vscode.Uri.parse(this.url));
    }

    private async refreshVFS() {
        const vfs = await this.vfs;
        const latestVersion = await vfs.getCurrentVersion();
        if (this.vfsLocalVersion===undefined) { this.vfsLocalVersion = latestVersion; }
        if (latestVersion===this.vfsLocalVersion) { return; }

        const activeUsers = [];
        const diffs = (await vfs.getFileTreeDiff(this.vfsLocalVersion, latestVersion))?.diff;
        for (const diff of diffs || []) {
            let entityId:string|undefined;
            try {
                const vfsUri = vfs.pathToUri(diff.pathname);
                const {fileType, fileId} = await vfs._resolveUri(vfsUri);
                entityId = fileId;
            } catch (error) {
                console.error(error);
            }
            // handle vfs update
            switch (diff.operation) {
                case 'added':
                    if (entityId!==undefined) { break; }
                    const pathParts = diff.pathname.split('/');
                    const [parentFolderId, name] = [
                        pathParts.slice(0, pathParts.length-1).join('/'),
                        pathParts[pathParts.length-1] ];
                    this._eventEmitter.emit('reciveNewFile', parentFolderId, {
                        id: this.randomEntityId,
                        name,
                        type: 'file',
                    });
                    break;
                case 'removed':
                    if (entityId===undefined) { break; }
                    this._eventEmitter.emit('removeEntity', entityId);
                    break;
                case 'renamed':
                    if (entityId===undefined) { break; }
                    const oldPathParts = diff.pathname.split('/');
                    const [oldParentPath, oldName] = [
                        oldPathParts.slice(0, oldPathParts.length-1).join('/'),
                        oldPathParts[oldPathParts.length-1] ];
                    const newPathParts = diff.newPathname!.split('/');
                    const [newParentPath, newName] = [
                        newPathParts.slice(0, newPathParts.length-1).join('/'),
                        newPathParts[newPathParts.length-1] ];
                    // notify rename or move
                    if (oldParentPath!==newParentPath) {
                        const newParentFolderId = (await vfs._resolveUri(vfs.pathToUri(newParentPath))).fileId;
                        this._eventEmitter.emit('reciveEntityMove', entityId, newParentFolderId);
                    } else {
                        this._eventEmitter.emit('reciveEntityRename', entityId, newName);
                    }
                    break;
                case 'edited':
                    if (entityId===undefined) { break; }
                    const pathname = diff.pathname;
                    // save doc if dirty
                    const _uri = vfs.pathToUri(pathname);
                    const _doc = vscode.workspace.textDocuments.find(doc => doc.uri.toString()===_uri.toString());
                    if (_doc && _doc.isDirty) { await _doc.save(); }
                    // generate patch and apply locally
                    const dmp = new DiffMatchPatch();
                    const localContent = new TextDecoder().decode( await vfs.openFile(_uri) );
                    const baseRemoteContent = (await vfs.getFileDiff(pathname, this.vfsLocalVersion, this.vfsLocalVersion))?.diff[0].u;
                    const latestRemoteContent = (await vfs.getFileDiff(pathname, latestVersion, latestVersion))?.diff[0].u;
                    if (baseRemoteContent && latestRemoteContent) {
                        const patch = dmp.patch_make(baseRemoteContent, latestRemoteContent);
                        const [localContentPatched, _] = dmp.patch_apply(patch, localContent);
                        await vfs.writeFile(_uri, Buffer.from(localContentPatched), false, true);
                    }
                    // fetch active users
                    const remoteDiffs = (await vfs.getFileDiff(pathname, this.vfsLocalVersion, latestVersion))?.diff;
                    for (const diff of remoteDiffs || []) {
                        const end_ts = diff.meta?.end_ts || Date.now();
                        for (const user of diff.meta?.users || []) {
                            const index = this.connectedUsers.findIndex(u => u.id===user.id);
                            if (index===-1) {
                                const userUpdate = {
                                    id:this.randomEntityId, user_id:user.id,email:user.email,
                                    name:`${user.first_name} ${user.last_name||''}`,
                                    doc_id:'', row:-1, column:-1,
                                    last_updated_at: end_ts,
                                };
                                this.connectedUsers.push(userUpdate);
                                activeUsers.push( userUpdate);
                            } else {
                                this.connectedUsers[index].last_updated_at = end_ts;
                                activeUsers.push( this.connectedUsers[index] );
                            }
                        }
                    }
                    break;
                default:
                    break;
            }
        }
        // notify user update/disconnected
        activeUsers.forEach(user => {
            this._eventEmitter.emit('clientTracking.clientUpdated', user);
        });
        this.connectedUsers = this.connectedUsers.filter(user => {
            const isDisconnected = Date.now() - (user.last_updated_at||Date.now()) > DisconnectionTimeout;
            if (isDisconnected) {
                this._eventEmitter.emit('clientTracking.clientDisconnected', user.id);
            }
            return !isDisconnected;
        });
        // update local version
        this.vfsLocalVersion = latestVersion;
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

    async uploadToVFS() {
        const vfs = await this.vfs;
        // sync remote changes
        await this.refreshVFS();
        // upload local changes
        for (const {parentFolderId,filename,path} of this.localChangesPath) {
            try {
                const fileContent = await vfs.openFile( vfs.pathToUri(path) );
                const fileEntity = (await this.api.uploadFile(this.identity, this.projectId, parentFolderId, filename, fileContent)).entity!;
                // update local entityId
                if (fileEntity._type==='doc') {
                    this._eventEmitter.emit('reciveNewDoc', parentFolderId, fileEntity);
                } else if (fileEntity._type==='file') {
                    this._eventEmitter.emit('reciveNewFile', parentFolderId, fileEntity);
                }
            } catch (error) {}
        }
        this.localChangesPath = [];
        // update local version
        this.vfsLocalVersion = await vfs.getCurrentVersion();
    }

    disconnect() {
        this.vfsRefreshTask && clearInterval(this.vfsRefreshTask);
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
                const update = args[1] as UpdateSchema;
                if (update.op?.length) {
                    this.vfs.then(async (vfs) => {
                        const {parentFolder, path} = (await vfs)._resolveById(uDocId)!;
                        const parentFolderId = parentFolder._id;
                        const filename = path.slice(path.lastIndexOf('/')+1);
                        this.localChangesPath.push({parentFolderId, filename, path});
                        callback(undefined, undefined);
                    });
                } else {
                    callback(undefined, undefined);
                }
                break;
            case 'leaveDoc':
                const wDocId = args[0];
                this.vfs.then(async (vfs) => {
                    await this.uploadToVFS();
                    callback(undefined, undefined);
                });
                break;
            case 'clientTracking.getConnectedUsers':
                    callback(undefined, []);
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
