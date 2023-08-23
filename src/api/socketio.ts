import { Identity, BaseAPI } from './base';
import { ProjectEntity } from '../provider/remoteFileSystemProvider';

export interface UpdateSchema {
    doc: string, //doc id
    op: Array<{
        p: number, //position
        d?: string, //delete
        u: boolean, //update version or not
        i?: string, //insert
    }>
    v: number, //doc version number
    lastV?: number, //last version number
    hash?: string, //(not needed if lastV is provided)
}

export interface OnlineUserSchema {
    last_updated_at: string, //unix timestamp
    user_id: string,
    first_name: string,
    last_name?: string,
    email: string,
    cursorData: {
        row:number, column:number, doc_id:string,
    },
    connected: boolean,
    client_id: string,
    client_age: number,
}

export class SocketIOAPI {
    private url: string;
    private socket?: any;

    constructor(url:string, api:BaseAPI, identity:Identity) {
        this.url = url;
        this.socket = api._initSocketV0(identity);
        this.connect();
    }

    private emit = require('util').promisify(this.socket.emit);

    private connect() {
        this.socket.on('connect', () => {
            console.log('SocketIOAPI: connected');
        });
        this.socket.on('connect_failed', () => {
            console.log('SocketIOAPI: connect_failed');
        });
        this.socket.on('disconnect', () => {
            console.log('SocketIOAPI: disconnected');
        });
        this.socket.on('forceDisconnect', (message:string, dealy=10) => {
            console.log('SocketIOAPI: forceDisconnect', message);
        });
        this.socket.on('connectionAccepted', (_:any, publicId:any) => {
            console.log('SocketIOAPI: connectionAccepted', publicId);
        });
        this.socket.on('connectionRejected', (err:any) => {
            throw new Error(err);
        });
        this.socket.on('error', (err:any) => {
            throw new Error(err);
        });
    }

    /**
     * Reference: services/web/frontend/js/ide/connection/ConnectionManager.js#L427
     * @param {string} projectId - The project id.
     * @returns {Promise}
     */
    async joinProject(projectId:string) {
        return this.emit('joinProject', {project_id: projectId})
                .then((err:any, project:ProjectEntity, permissionsLevel:string, protocolVersion:number) => {
                    if (err) {
                        throw new Error(err.message);
                    }
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
            .then((error:any, docLines:Array<string>, version:number, updates:Array<any>, ranges:any) => {
                if (error) {
                    throw new Error(error.message);
                }
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
            .then((error:any) => {
                if (error) {
                    throw new Error(error.message);
                }
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
            .then((error:any) => {
                if (error) {
                    throw new Error(error.message);
                }
            });
    }

    /**
     * Reference: services/web/frontend/js/ide/online-uesrs/OnlineUserManager.js#L42
     * @returns {Promise}
     */
    async getConnectedUsers() {
        return this.emit('getConnectedUsers')
            .then((error:any, connectedUsers:Array<OnlineUserSchema>) => {
                if (error) {
                    throw new Error(error.message);
                }
                return connectedUsers;
            });
    }
    
    /**
     * Reference: services/web/frontend/js/ide/online-uesrs/OnlineUserManager.js#L150
     * @param {string} docId - The document id.
     * @returns {Promise}
     */
    async updatePosition(docId:string, row:number, column:number) {
        return this.emit('clientTracking.updatePosition', row, column, docId)
            .then((error:any) => {return error});
    }
}
