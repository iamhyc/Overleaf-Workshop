/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import { SocketIOAPI, UpdateSchema } from '../api/socketio';
import { OUTPUT_FOLDER_NAME, ROOT_NAME } from '../consts';
import { GlobalStateManager } from '../utils/globalStateManager';
import { BaseAPI } from '../api/base';
import { assert } from 'console';
import * as Diff from 'diff';
import { ClientManager } from '../collaboration/clientManager';

const __OUTPUTS_ID = `${ROOT_NAME}-outputs`;

export type FileType = 'doc' | 'file' | 'folder' | 'outputs';
export type FolderKey = 'docs' | 'fileRefs' | 'folders' | 'outputs';
const FolderKeys: {[_type:string]: FolderKey} = {
    'folder': 'folders',
    'doc': 'docs',
    'file': 'fileRefs',
    'outputs': 'outputs',
};

export interface FileEntity {
    _id: string,
    name: string,
    _type?: string,
    readonly?: boolean,
}

export interface DocumentEntity extends FileEntity {
    version?: number,
    mtime?: number,
    lastVersion?: number,
    cache?: string,
}

export interface FileRefEntity extends FileEntity {
    linkedFileData: any,
    created: string,
}

export interface OutputFileEntity extends FileEntity {
    path: string, //output file name
    url: string, // `project/${projectId}/user/${userId}/output/${build}/output/${path}`
    type: string, //output file type (postfix)
    build: string, //build id
}

export interface FolderEntity extends FileEntity {
    docs: Array<DocumentEntity>,
    fileRefs: Array<FileRefEntity>,
    folders: Array<FolderEntity>,
    outputs?: Array<OutputFileEntity>,
}

export interface MemberEntity {
    _id: string,
    first_name: string,
    last_name?: string,
    email: string,
    privileges?: string,
    signUpDate?: string,
}

export interface ProjectEntity {
    _id: string,
    name: string,
    rootDoc_id: string,
    rootFolder: Array<FolderEntity>,
    publicAccessLevel: string, //"tokenBased"
    compiler: string, //"pdflatex"
    spellCheckLanguage: string, //"en"
    deletedDocs: Array<{
        _id: string,
        name: string,
        deletedAt: string,
    }>,
    members: Array<MemberEntity>,
    invites: Array<MemberEntity>,
    owner: MemberEntity,
    features: {[key:string]:any},
}

export class File implements vscode.FileStat {
    type: vscode.FileType;
    name: string;
    ctime: number;
    mtime: number;
    size: number;
    permissions?: vscode.FilePermission;
    constructor(name: string, type: vscode.FileType, ctime?: number, permissions?:vscode.FilePermission) {
        this.type = type;
        this.name = name;
        this.ctime = ctime || Date.now();
        this.mtime = Date.now();
        this.size = 0;
        this.permissions = permissions;
    }
}

export function parseUri(uri: vscode.Uri) {
    const query:any = uri.query.split('&').reduce((acc, v) => {
        const [key,value] = v.split('=');
        return {...acc, [key]:value};
    }, {});
    const [userId, projectId] = [query.user, query.project];
    const _pathParts = uri.path.split('/');
    const projectName = _pathParts[1];
    const pathParts = _pathParts.splice(2);
    const identifier = `${userId}/${projectId}/${projectName}`;
    return {userId, projectId, projectName, identifier, pathParts};
}

export class VirtualFileSystem {
    private root?: ProjectEntity;
    private context: vscode.ExtensionContext;
    private api: BaseAPI;
    private socket: SocketIOAPI;
    private origin: vscode.Uri;
    private serverName: string;
    private publicId?: string;
    private userId: string;
    private projectId: string;
    private isDirty: boolean = true;
    private initializing?: Promise<ProjectEntity>;
    private notify: (events:vscode.FileChangeEvent[])=>void;

    constructor(context: vscode.ExtensionContext, uri: vscode.Uri, notify: (events:vscode.FileChangeEvent[])=>void) {
        const {userId,projectId,projectName} = parseUri(uri);
        this.origin = uri.with({path: '/'+projectName});
        this.serverName = uri.authority;
        this.userId = userId;
        this.projectId = projectId;
        //
        this.context = context;
        this.notify = notify;
        //
        const res = GlobalStateManager.initSocketIOAPI(context, uri.authority);
        if (res) {
            this.api = res.api;
            this.socket = res.socket;
        } else {
            throw new Error(`Cannot init SocketIOAPI for ${uri.authority}`);
        }
    }

    async init() : Promise<ProjectEntity> {
        if (this.root) {
            return Promise.resolve(this.root);
        }

        if (!this.initializing) {
            this.remoteWatch();
            this.initializing = this.socket.joinProject(this.projectId).then((project) => {
                this.root = project;
                new ClientManager(this, this.publicId||'', this.socket).triggers;
                this.notify([
                    {type:vscode.FileChangeType.Created, uri:this.origin},
                ]);
                vscode.commands.executeCommand('compileManager.compile');
                return project;
            });
        }
        return this.initializing;
    }

    async _resolveUri(uri: vscode.Uri) {
        // resolve path
        const [parentFolder, fileName] = await (async () => {
            const {pathParts} = parseUri(uri);
            const root = await this.init();

            let currentFolder = root.rootFolder[0];
            for (let i = 0; i < pathParts.length-1; i++) {
                const folderName = pathParts[i];
                const folder = currentFolder.folders.find((folder) => folder.name === folderName);
                if (folder) {
                    currentFolder = folder;
                } else {
                    throw vscode.FileSystemError.FileNotFound(uri);
                }
            }
            const fileName = pathParts[pathParts.length-1];
            return [currentFolder, fileName];
        })();
        // resolve file
        const [fileEntity, fileType] = (() => {
            for (const _type of Object.keys(FolderKeys)) {
                let entity = parentFolder[ FolderKeys[_type] ]?.find((entity) => entity.name === fileName);
                if (!fileName && _type==='folder') { entity = parentFolder; }
                if (entity) {
                    return [entity, _type as FileType];
                }
            }
            return [];
        })();
        return {parentFolder, fileName, fileEntity, fileType};
    }

    _resolveById(entityId: string, root?: FolderEntity, path?:string):{
        parentFolder: FolderEntity, fileEntity: FileEntity, fileType:FileType, path:string
    } | undefined {
        if (!this.root) {
            throw vscode.FileSystemError.FileNotFound();
        }
        root = root || this.root.rootFolder[0];
        path = path || '/';

        if (root._id === entityId) {
            return {parentFolder: root, fileType: 'folder', fileEntity: root, path};
        } else {
            // search files in root
            for (const _type of Object.keys(FolderKeys)) {
                const key = FolderKeys[_type];
                if (key==='folders') { continue; }
                const entity = root[key]?.find((entity) => entity._id === entityId);
                if (entity) {
                    return {parentFolder: root, fileType: _type as FileType, fileEntity: entity, path:path+entity.name};
                }
            }
            // recursive search
            for (const folder of root.folders) {
                const res = this._resolveById(entityId, folder, path+folder.name+'/');
                if (res) { return res; }
            }
        }
        return undefined;
    }

    private insertEntity(parentFolder: FolderEntity, fileType:FileType, entity: FileEntity) {
        const key = FolderKeys[fileType];
        parentFolder[key]?.push(entity as any);
    }

    private removeEntity(parentFolder: FolderEntity, fileType:FileType, entity: FileEntity) {
        const key = FolderKeys[fileType];
        const index = parentFolder[key]?.findIndex((e) => e._id === entity._id);
        if (index!==undefined && index>=0) {
            parentFolder[key]?.splice(index, 1);
            return true;
        } else {
            return false;
        }
    }

    private removeEntityById(parentFolder: FolderEntity, fileType:FileType, entityId: string, recursive?:boolean) {
        const key = FolderKeys[fileType];
        const index = parentFolder[key]?.findIndex((e) => e._id === entityId);
        if (index!==undefined && index>=0) {
            parentFolder[key]?.splice(index, 1);
            return true;
        } else {
            return false;
        }
    }

    private remoteWatch() {
        this.socket.updateEventHandlers({
            onConnectionAccepted: (publicId:string) => {
                this.publicId = publicId;
            },
            onFileCreated: (parentFolderId:string, type:FileType, entity:FileEntity) => {
                const res = this._resolveById(parentFolderId);
                if (res) {
                    const {fileEntity} = res;
                    this.insertEntity(fileEntity as FolderEntity, type, entity);
                    this.notify([
                        {type: vscode.FileChangeType.Created, uri: this.pathToUri(res.path)}
                    ]);
                }
            },
            onFileRenamed: (entityId:string, newName:string) => {
                const res = this._resolveById(entityId);
                if (res) {
                    const {fileEntity} = res;
                    const oldName = fileEntity.name;
                    fileEntity.name = newName;
                    this.notify([
                        {type: vscode.FileChangeType.Deleted, uri: this.pathToUri(res.path)},
                        {type: vscode.FileChangeType.Created, uri: this.pathToUri(res.path.replace(oldName, newName))}
                    ]);
                }
            },
            onFileRemoved: (entityId:string) => {
                const res = this._resolveById(entityId);
                if (res) {
                    const {parentFolder, fileType, fileEntity} = res;
                    this.removeEntity(parentFolder, fileType, fileEntity);
                    this.notify([
                        {type: vscode.FileChangeType.Deleted, uri: this.pathToUri(res.path)}
                    ]);
                }
            },
            onFileMoved: (entityId:string, folderId:string) => {
                const oldPath = this._resolveById(entityId);
                const newPath = this._resolveById(folderId);
                if (oldPath && newPath) {
                    const newParentFolder = newPath.fileEntity as FolderEntity;
                    this.insertEntity(newParentFolder, oldPath.fileType, oldPath.fileEntity);
                    this.removeEntity(oldPath.parentFolder, oldPath.fileType, oldPath.fileEntity);
                    this.notify([
                        {type: vscode.FileChangeType.Deleted, uri: this.pathToUri(oldPath.path)},
                        {type: vscode.FileChangeType.Created, uri: this.pathToUri(newPath.path, oldPath.fileEntity.name)}
                    ]);
                }
            },
            onFileChanged: (update:UpdateSchema) => {
                const res = this._resolveById(update.doc);
                if (res===undefined) { return; }

                const doc = res.fileEntity as DocumentEntity;
                if (update.v===doc.version) {
                    doc.version += 1;
                    if (update.op && doc.cache) {
                        let content = doc.cache;
                        update.op.forEach((op) => {
                            if (op.i) {
                                content = content.slice(0, op.p) + op.i + content.slice(op.p);
                            } else if (op.d) {
                                content = content.slice(0, op.p) + content.slice(op.p+op.d.length);
                            }
                        });
                        doc.cache = content;
                        this.isDirty = true;
                        this.notify([
                            {type: vscode.FileChangeType.Changed, uri: this.pathToUri(res.path)}
                        ]);
                    }
                } else {
                    //FIXME: cope with out-of-order or contradictory
                    // throw new Error(`${doc.name}: ${doc._id}@${doc.version} inconsistent with ${update.v}`);
                }
            }
        });
    }

    pathToUri(...path: string[]): vscode.Uri {
        return vscode.Uri.joinPath(this.origin, ...path);
    }

    async resolve(uri: vscode.Uri): Promise<File> {
        const {fileName, fileEntity, fileType} = await this._resolveUri(uri);
        const readonly = fileEntity?.readonly ? vscode.FilePermission.Readonly : undefined;
        switch (fileType) {
            case undefined:
                throw vscode.FileSystemError.FileNotFound(uri);
            case 'folder':
                return new File(fileName, vscode.FileType.Directory, undefined, readonly);
            default:
                return new File(fileName, vscode.FileType.File, undefined, readonly);
        }
    }

    async list(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        const {fileEntity} = await this._resolveUri(uri);
        const folder = fileEntity as FolderEntity;
        let results:[string, vscode.FileType][] = [];
        if (folder) {
            Object.values(FolderKeys).forEach((key) => {
                const _type = key==='folders'? vscode.FileType.Directory : vscode.FileType.File;
                folder[key]?.forEach((entity) => {
                    results.push([entity.name, _type]);
                });
            });
        }
        return results;
    }

    async openFile(uri: vscode.Uri): Promise<Uint8Array> {
        const {fileType, fileEntity} = await this._resolveUri(uri);
        if (!fileEntity) {
            throw vscode.FileSystemError.FileNotFound();
        }

        if (fileType==='doc') {
            const doc = fileEntity as DocumentEntity;
            if (doc.cache) {
                const content = doc.cache;
                return new TextEncoder().encode(content);
            } else {
                const res = await this.socket.joinDoc(fileEntity._id);
                const content = res.docLines.join('\n');
                doc.version = res.version;
                doc.cache = content;
                return new TextEncoder().encode(content);
            }
        } else if (fileType==='outputs') {
            return GlobalStateManager.authenticate(this.context, this.serverName)
            .then((identity) => {
                return this.api.getFileFromClsi(identity, (fileEntity as OutputFileEntity).url, 'standard')
                .then((res) => {
                    if (res.type==='success') {
                        return res.content;
                    } else {
                        return new Uint8Array(0);
                    }
                });
            });
        } else {
            return await GlobalStateManager.getProjectFile(this.context, this.api, this.serverName, this.projectId, fileEntity._id);
        }
    }

    async createFile(uri: vscode.Uri, content:Uint8Array, overwrite?:boolean) {
        const {parentFolder, fileName, fileEntity} = await this._resolveUri(uri);
        if (fileEntity && !overwrite) {
            throw vscode.FileSystemError.FileExists(uri);
        }
        const res = await GlobalStateManager.uploadProjectFile(this.context, this.api, this.serverName, this.projectId, parentFolder._id, fileName, content);
        if (res) {
            this.insertEntity(parentFolder, res._type, res);
        }
    }

    async writeFile(uri: vscode.Uri, content:Uint8Array, create:boolean, overwrite:boolean) {
        const {fileType, fileEntity} = await this._resolveUri(uri);

        // if non-exists --> create it
        if (!fileType && create) {
            return this.createFile(uri, content, true);
        }

        // if exists but not doc --> create new
        if (fileType && fileType!=='doc' && create) {
            return this.createFile(uri, content, overwrite);
        }

        // if exists and is doc --> update
        if (fileType && fileType==='doc' && fileEntity) {
            const doc = fileEntity as DocumentEntity;
            const _content = new TextDecoder().decode(content);
            if (doc.version===undefined || doc.cache===undefined) {
                return;
            }

            const update = {
                doc: doc._id,
                lastV: doc.lastVersion,
                v: doc.version,
                // Reference: services/web/frontend/js/vendor/libs/sharejs.js#L1288
                hash: (()=>{
                    if (!doc.mtime || Date.now()-doc.mtime>5000) {
                        doc.mtime = Date.now();
                        return require('crypto').createHash('sha1').update(
                            "blob " + _content.length + "\x00" + _content
                        ).digest('hex');
                    }
                })() as string,
                op: (()=>{
                    let currentPos = 0;
                    return Diff.diffChars(doc.cache, _content)
                                .map((part) => {
                                    if (part.count) {
                                        const incCount = part.removed? 0 : part.count;
                                        currentPos += incCount;
                                        if (part.added || part.removed) {
                                            return {
                                                p: currentPos - incCount,
                                                i: part.added ?  part.value  : undefined,
                                                d: part.removed ?  part.value : undefined,
                                            };
                                        }
                                    }
                                })
                                .filter(x => x) as any;
                })(),
            };
            if (update.op && update.op.length) {
                this.isDirty = true;
            }
            await this.socket.applyOtUpdate(doc._id, update);
            doc.cache = _content;
            doc.lastVersion = doc.version;
        }
    }

    async mkdir(uri: vscode.Uri) {
        const {parentFolder, fileName} = await this._resolveUri(uri);
        const res = await GlobalStateManager.addProjectFolder(this.context, this.api, this.serverName, this.projectId, fileName, parentFolder._id);
        if (res) {
            this.insertEntity(parentFolder, 'folder', res);
        }
    }

    async remove(uri: vscode.Uri, recursive: boolean) {
        const {parentFolder, fileType, fileEntity} = await this._resolveUri(uri);
        if (fileType && fileEntity) {
            const res = await GlobalStateManager.deleteProjectEntity(this.context, this.api, this.serverName, this.projectId, fileType, fileEntity._id);
            if (res) {
                this.removeEntityById(parentFolder, fileType, fileEntity._id, recursive);
            }
        }
    }

    async rename(oldUri: vscode.Uri, newUri: vscode.Uri, force: boolean) {
        const oldPath = await this._resolveUri(oldUri);
        const newPath = await this._resolveUri(newUri);

        if (oldPath.fileType && oldPath.fileEntity && oldPath.fileEntity) {
            // delete existence firstly
            if (newPath.fileType && newPath.fileEntity) {
                if (!force) { return; }
                await this.remove(newUri, true);
                this.removeEntity(newPath.parentFolder, newPath.fileType, newPath.fileEntity);
            }
            // rename or move
            const res = (oldPath.parentFolder===newPath.parentFolder) ? (
                        // rename   
                        await GlobalStateManager.renameProjectEntity(this.context, this.api, this.serverName, this.projectId, oldPath.fileType, oldPath.fileEntity._id, newPath.fileName) ) : (
                        // move
                        await GlobalStateManager.moveProjectEntity(this.context, this.api, this.serverName, this.projectId, oldPath.fileType, oldPath.fileEntity._id, newPath.parentFolder._id) );
            if (res) {
                const newEntity = Object.assign(oldPath.fileEntity);
                newEntity.name = newPath.fileName;
                this.insertEntity(newPath.parentFolder, oldPath.fileType, newEntity);
                this.removeEntity(oldPath.parentFolder, oldPath.fileType, oldPath.fileEntity);
            }
        }
    }

    async compile() {
        if (this.root && this.isDirty) {
            this.isDirty = false;
            let needCacheClearFirst = false;
            try{
                const temp = await this.resolve(this.pathToUri(OUTPUT_FOLDER_NAME, "output.log"));
            }
            catch (e){
                needCacheClearFirst = true;
            }
            return GlobalStateManager.compileProjectEntity(this.context, this.api, this.serverName, this.projectId, needCacheClearFirst)
            .then((res) => {
                if (res) {
                    this.updateOutputs(res.outputFiles);
                    return true;
                } else {
                    return false;
                }
            });
        }
        return Promise.resolve(undefined);
    }

    async updateOutputs(outputs: Array<OutputFileEntity>) {
        if (this.root) {
            const rootFolder = this.root.rootFolder[0];
            if (this.removeEntityById(rootFolder, 'folder', __OUTPUTS_ID)) {
                this.notify([
                    {type:vscode.FileChangeType.Deleted, uri:this.pathToUri(OUTPUT_FOLDER_NAME)}
                ]);
            }

            this.insertEntity(rootFolder, 'folder', {
                _id: __OUTPUTS_ID,
                name: OUTPUT_FOLDER_NAME,
                readonly: true,
                docs: [], fileRefs: [], folders:[],
                outputs: outputs.map((file) => {
                    file._id = __OUTPUTS_ID;
                    file.name=file.path;
                    file.readonly=true;
                    return file;
                })
            } as FolderEntity);
            this.notify([
                {type:vscode.FileChangeType.Created, uri:this.pathToUri(OUTPUT_FOLDER_NAME)},
                ...(outputs.map((file) => {
                    return {type:vscode.FileChangeType.Changed, uri:this.pathToUri(OUTPUT_FOLDER_NAME, file.path)};
                }))
            ]);
        }
    }

    async syncCode(filePath: string, line:number, column:number) {
        return GlobalStateManager.syncCode(this.context, this.api, this.serverName, this.projectId, filePath, line, column);
    }

    async syncPdf(page:number, h:number, v:number) {
        return GlobalStateManager.syncPdf(this.context, this.api, this.serverName, this.projectId, page, h, v);
    }

    async spellCheck(uri: vscode.Uri, words: string[]) {
        const {fileType} = await this._resolveUri(uri);
        if (fileType==='doc' || fileType==='file') {
            const identity = await GlobalStateManager.authenticate(this.context, this.serverName);
            const res = await this.api.proxyRequestToSpellingApi(identity, this.userId, words);
            if (res.type==='success') {
                return res.misspellings;
            }
        }
    }

    async spellLearn(uri: vscode.Uri, word: string) {
        const identity = await GlobalStateManager.authenticate(this.context, this.serverName);
        const res = await this.api.spellingControllerLearn(identity, this.userId, word);
        if (res.type==='success') {
            return true;
        } else {
            return false;
        }
    }

    async getDictionary() {
        const identity = await GlobalStateManager.authenticate(this.context, this.serverName);
        const res = await this.api.getUserDictionary(identity, this.projectId);
        if (res.type==='success') {
            return res.dictionary;
        } else {
            return undefined;
        }
    }

    async metadata() {
        const identity = await GlobalStateManager.authenticate(this.context, this.serverName);
        const res = await this.api.getMetadata(identity, this.projectId);
        if (res.type==='success') {
            return res.meta?.projectMeta;
        } else {
            return undefined;
        }
    }
}

export class RemoteFileSystemProvider implements vscode.FileSystemProvider {
    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

    private vfss: {[key:string]:VirtualFileSystem};

    constructor(private context: vscode.ExtensionContext) {
        this.context = context;
        this.vfss = {};
    }

    private getVFS(uri: vscode.Uri): Promise<VirtualFileSystem> {
        const vfs = this.vfss[ uri.query ];
        if (vfs) {
            return Promise.resolve(vfs);
        } else {
            const vfs = new VirtualFileSystem(this.context, uri, this.notify.bind(this));
            this.vfss[ uri.query ] = vfs;
            return Promise.resolve(vfs);
        }
    }

    prefetch(uri: vscode.Uri): Promise<VirtualFileSystem> {
        return this.getVFS(uri).then((vfs) => {return vfs;});
    }

    notify(events :vscode.FileChangeEvent[]) {
        this._emitter.fire(events);
    }

    stat(uri: vscode.Uri): Thenable<vscode.FileStat> {
        return this.getVFS(uri).then( vfs => vfs.resolve(uri) );
    }

    watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
        return new vscode.Disposable(() => {});
    }

    readDirectory(uri: vscode.Uri): Thenable<[string, vscode.FileType][]> {
        return this.getVFS(uri).then( vfs => vfs.list(uri) );
    }

    createDirectory(uri: vscode.Uri): Thenable<void> {
        return this.getVFS(uri).then( vfs => vfs.mkdir(uri) );
    }

    readFile(uri: vscode.Uri): Thenable<Uint8Array> {
        return this.getVFS(uri).then( vfs => vfs.openFile(uri) );
    }

    writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): Thenable<void> {
        return this.getVFS(uri).then( vfs => vfs.writeFile(uri, content, options.create, options.overwrite) );
    }

    delete(uri: vscode.Uri, options: { recursive: boolean; }): Thenable<void> {
        return this.getVFS(uri).then( vfs => vfs.remove(uri, options.recursive) );
    }

    rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): Thenable<void> {
        assert( oldUri.authority===newUri.authority, 'Cannot rename across servers' );
        return this.getVFS(oldUri).then( vfs => vfs.rename(oldUri, newUri, options.overwrite) );
    }
}
