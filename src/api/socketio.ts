/* eslint-disable @typescript-eslint/naming-convention */
import { Identity, BaseAPI, ProjectMessageResponseSchema } from './base';
import { FileEntity, DocumentEntity, FileRefEntity, FileType, FolderEntity, ProjectEntity } from '../provider/remoteFileSystemProvider';
import { OnlineUserSchema, UpdateUserSchema } from '../collaboration/clientManager';

export interface UpdateSchema {
    doc: string, //doc id
    op?: {
        p: number, //position
        i?: string, //insert
        d?: string, //delete
        u?: boolean, //isUndo
    }[],
    v: number, //doc version number
    lastV?: number, //last version number
    hash?: string, //(not needed if lastV is provided)
    meta?: {
        source: string, //socketio client id
        ts: number, //unix timestamp
        user_id: string,
    }
}

export interface EventsHandler {
    onFileCreated?: (parentFolderId:string, type:FileType, entity:FileEntity) => void,
    onFileRenamed?: (entityId:string, newName:string) => void,
    onFileRemoved?: (entityId:string) => void,
    onFileMoved?: (entityId:string, newParentFolderId:string) => void,
    onFileChanged?: (update:UpdateSchema) => void,
    //
    onDisconnected?: () => void,
    onConnectionAccepted?: (publicId:string) => void,
    onClientUpdated?: (user:UpdateUserSchema) => void,
    onClientDisconnected?: (id:string) => void,
    //
    onReceivedMessage?: (message:ProjectMessageResponseSchema) => void,
}

export class SocketIOAPI {
    private _handlers: Array<EventsHandler> = [];

    private url: string;
    private socket?: any;
    private emit: any;

    constructor(url:string, api:BaseAPI, identity:Identity) {
        this.url = url;
        this.socket = api._initSocketV0(identity);
        (this.socket.emit)[require('util').promisify.custom] = (event:string, ...args:any[]) => {
            return new Promise((resolve, reject) => {
                this.socket.emit(event, ...args, (err:any, ...data:any[]) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(data);
                    }
                });
            });
        };
        this.emit = require('util').promisify(this.socket.emit).bind(this.socket);
        this.connect();
    }

    private connect() {
        this.socket.on('connect', () => {
            console.log('SocketIOAPI: connected');
        });
        this.socket.on('connect_failed', () => {
            console.log('SocketIOAPI: connect_failed');
        });
        this.socket.on('forceDisconnect', (message:string, delay=10) => {
            console.log('SocketIOAPI: forceDisconnect', message);
        });
        this.socket.on('connectionRejected', (err:any) => {
            throw new Error(err);
        });
        this.socket.on('error', (err:any) => {
            throw new Error(err);
        });
    }

    get handlers() {
        return this._handlers;
    }

    resumeEventHandlers(handlers: Array<EventsHandler>) {
        this._handlers = [];
        handlers.forEach((handler) => {
            this.updateEventHandlers(handler);
        });
    }

    updateEventHandlers(handlers: EventsHandler) {
        this._handlers.push(handlers);
        Object.values(handlers).forEach((handler) => {
            switch (handler) {
                case handlers.onFileCreated:
                    this.socket.on('reciveNewDoc', (parentFolderId:string, doc:DocumentEntity) => {
                        handler(parentFolderId, 'doc', doc);
                    });
                    this.socket.on('reciveNewFile', (parentFolderId:string, file:FileRefEntity) => {
                        handler(parentFolderId, 'file', file);
                    });
                    this.socket.on('reciveNewFolder', (parentFolderId:string, folder:FolderEntity) => {
                        handler(parentFolderId, 'folder', folder);
                    });
                    break;
                case handlers.onFileRenamed:
                    this.socket.on('reciveEntityRename', (entityId:string, newName:string) => {
                        handler(entityId, newName);
                    });
                    break;
                case handlers.onFileRemoved:
                    this.socket.on('removeEntity', (entityId:string) => {
                        handler(entityId);
                    });
                    break;
                case handlers.onFileMoved:
                    this.socket.on('reciveEntityMove', (entityId:string, folderId:string) => {
                        handler(entityId, folderId);
                    });
                    break;
                case handlers.onFileChanged:
                    this.socket.on('otUpdateApplied', (update: UpdateSchema) => {
                        handler(update);
                    });
                    break;
                case handlers.onDisconnected:
                    this.socket.on('disconnect', () => {
                        handler();
                    });
                    break;
                case handlers.onConnectionAccepted:
                    this.socket.on('connectionAccepted', (_:any, publicId:any) => {
                        handler(publicId);
                    });
                    break;
                case handlers.onClientUpdated:
                    this.socket.on('clientTracking.clientUpdated', (user:UpdateUserSchema) => {
                        handler(user);
                    });
                    break;
                case handlers.onClientDisconnected:
                    this.socket.on('clientTracking.clientDisconnected', (id:string) => {
                        handler(id);
                    });
                    break;
                case handlers.onReceivedMessage:
                    this.socket.on('new-chat-message', (message:ProjectMessageResponseSchema) => {
                        handler(message);
                    });
                default:
                    break;
            }
        });
    }

    /**
     * Reference: services/web/frontend/js/ide/connection/ConnectionManager.js#L427
     * @param {string} projectId - The project id.
     * @returns {Promise}
     */
    async joinProject(project_id:string): Promise<ProjectEntity> {
        return this.emit('joinProject', {project_id})
                .then((returns:[ProjectEntity, string, number]) => {
                    const [project, permissionsLevel, protocolVersion] = returns;
                    return project;
                });
    }

    /**
     * Reference: services/web/frontend/js/ide/editor/Document.js#L500
     * @param {string} docId - The document id.
     * @returns {Promise}
     */
    async joinDoc(docId:string) {
        return this.emit('joinDoc', docId, { encodeRanges: true })
            .then((returns: [Array<string>, number, Array<any>, any]) => {
                const [docLinesAscii, version, updates, ranges] = returns;
                const docLines = docLinesAscii.map((line) => Buffer.from(line, 'ascii').toString('utf-8') );
                return {docLines, version, updates, ranges};
            });
    }

    /**
     * Reference: services/web/frontend/js/ide/editor/Document.js#L591
     * @param {string} docId - The document id.
     * @returns {Promise}
     */
    async leaveDoc(docId:string) {
        return this.emit('leaveDoc', docId)
            .then(() => {
                return;
            });
    }

    /**
     * Reference: services/web/frontend/js/ide/editor/ShareJsDocs.js#L78
     * @param {string} docId - The document id.
     * @param {any} update - The changes.
     * @returns {Promise}
     */
    async applyOtUpdate(docId:string, update:UpdateSchema) {
        return this.emit('applyOtUpdate', docId, update)
            .then(() => {
                return;
            });
    }

    /**
     * Reference: services/web/frontend/js/ide/online-users/OnlineUserManager.js#L42
     * @returns {Promise}
     */
    async getConnectedUsers(): Promise<OnlineUserSchema[]> {
        return this.emit('clientTracking.getConnectedUsers')
            .then((returns:[OnlineUserSchema[]]) => {
                const [connectedUsers] = returns;
                return connectedUsers;
            });
    }

    /**
     * Reference: services/web/frontend/js/ide/online-users/OnlineUserManager.js#L150
     * @param {string} docId - The document id.
     * @returns {Promise}
     */
    async updatePosition(doc_id:string, row:number, column:number) {
        return this.emit('clientTracking.updatePosition', {row, column, doc_id})
            .then(() => {
                return;
            });
    }
}
