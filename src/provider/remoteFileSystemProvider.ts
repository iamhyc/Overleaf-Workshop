import * as vscode from 'vscode';
import { SocketIOAPI } from '../api/socketio';
import { GlobalStateManager } from '../utils/globalStateManager';

// Reference: https://github.com/microsoft/vscode-extension-samples/blob/main/fsprovider-sample/src/fileSystemProvider.ts
// Reference: https://code.visualstudio.com/api/references/vscode-api#FileSystemProvider

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
    _type: "doc" | "fileRef";
    ctime: number;
    mtime: number;
    size: number;
    constructor(name: string, _type:any, ctime?: number) {
        this.type = vscode.FileType.File;
        this.name = name;
        this._type = _type;
        this.ctime = ctime || Date.now();
        this.mtime = Date.now();
        this.size = 0;
    }
}

class VirtualFileSystem {
    private root?: ProjectEntity;
    private socket: SocketIOAPI;

    constructor(context: vscode.ExtensionContext, uri: vscode.Uri) {
        const {userId,projectId,path} = this.parseUri(uri);
        const socket = GlobalStateManager.initSocketIOAPI(context, uri.authority);
        if (socket) {
            this.socket = socket;
            this.socket.joinProject(projectId).then((project:ProjectEntity) => {
                this.root = project;
            });
        } else {
            throw new Error(`[RemoteFileSystemProvider] Cannot init SocketIOAPI for ${uri.authority}`);
        }
    }

    private parseUri(uri: vscode.Uri) {
        const matches = uri.path.match(/\/user\/(\w*)\/project\/(\w*)\/?(.*)/);
        if (matches) {
            const [_, userId, projectId, path] = matches;
            return {userId, projectId, path};
        } else {
            throw new Error(`[RemoteFileSystemProvider] Invalid URI: ${uri.authority}`);
        }
    }

    public resolve(uri: vscode.Uri): File {
        const {userId,projectId,path} = this.parseUri(uri);
        if (this.root) {
            return new File('', '', 0); //TODO: resolve file/folder
        } else {
            throw new Error(`[RemoteFileSystemProvider] Cannot resolve URI: ${uri.authority}`);
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

    private getVFS(uri: vscode.Uri): VirtualFileSystem {
        const key = uri.authority + uri.path;
        const vfs = this.vfss[key];
        if (vfs) {
            return vfs;
        } else {
            const vfs = new VirtualFileSystem(this.context, uri);
            this.vfss[key] = vfs;
            return vfs;
        }
    }

    stat(uri: vscode.Uri): vscode.FileStat {
        const entity = this.getVFS(uri).resolve(uri);
        throw vscode.FileSystemError.FileNotFound(uri);
    }

    watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
        return new vscode.Disposable(() => {});
    }

    readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
        return [];
    }

    createDirectory(uri: vscode.Uri): Thenable<void> {
        return Promise.resolve();
    }

    readFile(uri: vscode.Uri): Thenable<Uint8Array> {
        return Promise.resolve(new Uint8Array);
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
