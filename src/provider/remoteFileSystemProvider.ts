import * as vscode from 'vscode';
import { SocketIOAPI } from '../api/socketio';
import { GlobalStateManager } from '../utils/globalStateManager';
import { BaseAPI } from '../api/base';
import { assert } from 'console';

export interface DocumentEntity {
    _id: string,
    name: string,
}

export interface FileRefEntity extends DocumentEntity {
    // _id: string,
    // name: string,
    linkedFileData: any,
    created: string,
}

export interface FolderEntity extends DocumentEntity {
    // _id: string,
    // name: string,
    docs: Array<DocumentEntity>,
    fileRefs: Array<FileRefEntity>,
    folders: Array<FolderEntity>,
}

export interface MemberEntity {
    _id: string,
    first_name: string,
    last_name?: string,
    email: string,
    privileges: string,
    signUpDate: string,
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
    sub_type?: "doc" | "fileRef";
    ctime: number;
    mtime: number;
    size: number;
    constructor(name: string, type: vscode.FileType, sub_type?: any, ctime?: number) {
        this.type = type;
        this.name = name;
        this.sub_type = sub_type;
        this.ctime = ctime || Date.now();
        this.mtime = Date.now();
        this.size = 0;
    }
}

class VirtualFileSystem {
    private root?: ProjectEntity;
    private context: vscode.ExtensionContext;
    private api: BaseAPI;
    private socket: SocketIOAPI;
    private userId: string;
    private projectId: string;

    constructor(context: vscode.ExtensionContext, uri: vscode.Uri) {
        const {userId,projectId,path} = this.parseUri(uri);
        this.userId = userId;
        this.projectId = projectId;
        this.context = context;
        const res = GlobalStateManager.initSocketIOAPI(context, uri.authority);
        if (res) {
            this.api = res.api;
            this.socket = res.socket;
        } else {
            throw new Error(`Cannot init SocketIOAPI for ${uri.authority}`);
        }
    }

    private parseUri(uri: vscode.Uri) {
        const query:any = uri.query.split('&').reduce((acc, v) => {
            const [key,value] = v.split('=');
            return {...acc, [key]:value};
        }, {});
        const [userId, projectId] = [query.user, query.project];
        const path = uri.path;
        return {userId, projectId, path}
    }

    async joinProject() {
        return this.socket.joinProject(this.projectId).then((project:ProjectEntity) => {
            this.root = project;
        });
    }

    private _resolve(uri: vscode.Uri) {
        // resolve path
        const [parentFolder, fileName] = (() => {
            const path = uri.path;
            if (this.root) {
                let currentFolder = this.root.rootFolder[0];
                const pathParts = path.split('/').slice(1);
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
            }
            throw vscode.FileSystemError.FileNotFound(uri);
        })();
        // resolve file
        const [fileEntity, fileType, fileId] = (() => {
            // resolve as folder
            let folder = parentFolder.folders.find((folder) => folder.name === fileName);
            if (fileName==='') { folder = parentFolder; }
            if (folder) {
                return [folder, 'folder', folder._id];
            }
            // resolve as doc
            const doc = parentFolder.docs.find((doc) => doc.name === fileName);
            if (doc) {
                return [doc, 'doc', doc._id];
            }
            // resolve as fileRef
            const fileRef = parentFolder.fileRefs.find((fileRef) => fileRef.name === fileName);
            if (fileRef) {
                return [fileRef, 'file', fileRef._id];
            }
            return [];
        })();
        return {parentFolder, fileName, fileEntity, fileType, fileId};
    }

    resolve(uri: vscode.Uri): File {
        const {fileName, fileType} = this._resolve(uri);
        if (fileType==='folder') {
            return new File(fileName, vscode.FileType.Directory);
        } else if (fileType==='doc') {
            return new File(fileName, vscode.FileType.File, 'doc');
        } else if (fileType==='file') {
            return new File(fileName, vscode.FileType.File, 'fileRef');
        }
        throw vscode.FileSystemError.FileNotFound(uri);
    }

    listFolder(uri: vscode.Uri): [string, vscode.FileType][] {
        const {fileEntity} = this._resolve(uri);
        const folder = fileEntity as FolderEntity;
        let results:[string, vscode.FileType][] = [];
        if (folder) {
            folder.folders.forEach((folder) => {
                results.push([folder.name, vscode.FileType.Directory]);
            });
            folder.docs.forEach((doc) => {
                results.push([doc.name, vscode.FileType.File]);
            });
            folder.fileRefs.forEach((ref) => {
                results.push([ref.name, vscode.FileType.File]);
            });
        }
        return results;
    }

    async openFile(uri: vscode.Uri): Promise<Uint8Array> {
        const {fileType, fileId} = this._resolve(uri);
        // resolve as doc
        if (fileType=='doc' && fileId) {
            const res = await this.socket.joinDoc(fileId);
            const content = res.docLines.join('\n');
            return new TextEncoder().encode(content);
        } else if (fileType=='file' && fileId) {
            const serverName = uri.authority;
            const res = await GlobalStateManager.getProjectFile(this.context, this.api, serverName, this.projectId, fileId);
            return new Uint8Array(res);
        }
        throw vscode.FileSystemError.FileNotFound();
    }

    async mkdir(uri: vscode.Uri) {
        const {parentFolder, fileName} = this._resolve(uri);
        const serverName = uri.authority;
        const res = await GlobalStateManager.addProjectFolder(this.context, this.api, serverName, this.projectId, fileName, parentFolder._id);
        if (res) {
            parentFolder.folders.push(res);
        }
    }

    async remove(uri: vscode.Uri, recursive: boolean) {
        const {parentFolder, fileType, fileId} = this._resolve(uri);
        const serverName = uri.authority;
        
        if (fileType && fileId) {
            const res = await GlobalStateManager.deleteProjectEntity(this.context, this.api, serverName, this.projectId, fileType, fileId);
            if (res) {
                if (fileType==='folder' && recursive) {
                    parentFolder.folders = parentFolder.folders.filter((folder) => folder._id !== fileId);
                } else if (fileType==='doc') {
                    parentFolder.docs = parentFolder.docs.filter((doc) => doc._id !== fileId);
                } else if (fileType==='file') {
                    parentFolder.fileRefs = parentFolder.fileRefs.filter((fileRef) => fileRef._id !== fileId);
                }
            }
        }
    }

    async rename(oldUri: vscode.Uri, newUri: vscode.Uri, force: boolean) {
        const oldPath = this._resolve(oldUri);
        const newPath = this._resolve(newUri);
        const serverName = oldUri.authority;

        if (oldPath.fileType && oldPath.fileId && oldPath.fileEntity) {
            // delete existence firstly
            if (newPath.fileEntity) {
                if (!force) return;
                const key = newPath.fileType==='folder' ? 'folders' : oldPath.fileType==='doc' ? 'docs' : 'fileRefs';
                await this.remove(newUri, true);
                newPath.parentFolder[key].filter(newPath.fileEntity as any);
            }
            // rename or move
            const res = (oldPath.parentFolder===newPath.parentFolder) ? (
                        // rename   
                        await GlobalStateManager.renameProjectEntity(this.context, this.api, serverName, this.projectId, oldPath.fileType, oldPath.fileId, newPath.fileName) ) : (
                        // move
                        await GlobalStateManager.moveProjectEntity(this.context, this.api, serverName, this.projectId, oldPath.fileType, oldPath.fileId, newPath.parentFolder._id) );
            if (res) {
                const key = oldPath.fileType==='folder' ? 'folders' : oldPath.fileType==='doc' ? 'docs' : 'fileRefs';
                //FIXME: push and filter are not working
                newPath.parentFolder[key].push(oldPath.fileEntity as any);
                oldPath.parentFolder[key].filter(oldPath.fileEntity as any);
            }
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
            const vfs = new VirtualFileSystem(this.context, uri);
            this.vfss[ uri.query ] = vfs;
            return vfs.joinProject().then(() => vfs);
        }
    }

    stat(uri: vscode.Uri): Thenable<vscode.FileStat> {
        return this.getVFS(uri).then( vfs => vfs.resolve(uri) );
    }

    watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
        return new vscode.Disposable(() => {});
    }

    readDirectory(uri: vscode.Uri): Thenable<[string, vscode.FileType][]> {
        return this.getVFS(uri).then( vfs => vfs.listFolder(uri) );
    }

    createDirectory(uri: vscode.Uri): Thenable<void> {
        return this.getVFS(uri).then( vfs => vfs.mkdir(uri) );
    }

    readFile(uri: vscode.Uri): Thenable<Uint8Array> {
        return this.getVFS(uri).then( vfs => vfs.openFile(uri) );
    }

    writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): Thenable<void> {
        return Promise.resolve();
    }

    delete(uri: vscode.Uri, options: { recursive: boolean; }): Thenable<void> {
        return this.getVFS(uri).then( vfs => vfs.remove(uri, options.recursive) );
    }

    rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): Thenable<void> {
        assert( oldUri.authority===newUri.authority, 'Cannot rename across servers' );
        return this.getVFS(oldUri).then( vfs => vfs.rename(oldUri, newUri, options.overwrite) );
    }

}
