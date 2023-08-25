import * as vscode from 'vscode';
import { SocketIOAPI } from '../api/socketio';
import { GlobalStateManager } from '../utils/globalStateManager';
import { BaseAPI } from '../api/base';

export interface DocumentEntity {
    _id: string,
    name: string,
}

export interface FileRefEntity {
    _id: string,
    name: string,
    linkedFileData: any,
    created: string,
}

export interface FolderEntity {
    _id: string,
    name: string,
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
    publicAccesLevel: string, //"tokenBased"
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

    private path_resolve(uri: vscode.Uri): [FolderEntity, string] {
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
    }

    resolve(uri: vscode.Uri): File {
        const [parent, fileName] = this.path_resolve(uri);
        // resolve as folder
        let folder = parent.folders.find((folder) => folder.name === fileName);
        if (fileName==='') { folder = parent; }
        if (folder) {
            return new File(folder.name, vscode.FileType.Directory);
        }
        // resolve as doc
        const doc = parent.docs.find((doc) => doc.name === fileName);
        if (doc) {
            return new File(doc.name, vscode.FileType.File, 'doc');
        }
        // resolve as fileRef
        const fileRef = parent.fileRefs.find((fileRef) => fileRef.name === fileName);
        if (fileRef) {
            return new File(fileRef.name, vscode.FileType.File, 'fileRef', Date.parse(fileRef.created));
        }
        throw vscode.FileSystemError.FileNotFound(uri);
    }

    listFolder(uri: vscode.Uri): [string, vscode.FileType][] {
        const [parent, fileName] = this.path_resolve(uri);
        let results:[string, vscode.FileType][] = [];
        let folder = parent.folders.find((folder) => folder.name === fileName);
        if (fileName==='') { folder = parent; }
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
        const [parent, fileName] = this.path_resolve(uri);
        const doc = parent.docs.find((doc) => doc.name === fileName);
        // resolve as doc
        if (doc) {
            const res = await this.socket.joinDoc(doc._id);
            const content = res.docLines.join('\n');
            return new TextEncoder().encode(content);
        }
        // resolve as fileRef
        const fileRef = parent.fileRefs.find((fileRef) => fileRef.name === fileName);
        if (fileRef) {
            const server_name = uri.authority;
            const res = await GlobalStateManager.getProjectFile(this.context, this.api, server_name, this.projectId, fileRef._id);
            return new Uint8Array(res);
        }
        throw vscode.FileSystemError.FileNotFound();
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
        return Promise.resolve();
    }

    readFile(uri: vscode.Uri): Thenable<Uint8Array> {
        return this.getVFS(uri).then( vfs => vfs.openFile(uri) );
    }

    writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): Thenable<void> {
        return Promise.resolve();
    }

    delete(uri: vscode.Uri, options: { recursive: boolean; }): Thenable<void> {
        return Promise.resolve();
    }

    rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): Thenable<void> {
        return Promise.resolve();
    }

}
