import * as vscode from 'vscode';
import { Identity, ResponseSchema, BaseAPI } from '../api/base';

const keyServerPersists: string = 'overleaf-servers';

export interface ProjectPersist {
    _id: string;
    name: string;
    accessLevel: string;
}

export interface ServerPersist {
    name: string;
    url: string;
    login?: {
        username: string;
        identity: Identity;
        projects?: ProjectPersist[]
    };
}

interface ServerPersistMap {
    [name: string]: {
        server: ServerPersist,
        api?: BaseAPI
    };
}

export class GlobalStateManager {

    static getServers(context:vscode.ExtensionContext):ServerPersistMap {
        const persists = context.globalState.get<ServerPersistMap>(keyServerPersists, {});
        Object.values(persists).forEach(persist => {
            persist.api = new BaseAPI(persist.server.url);
        });
        return persists;
    }

    static addServer(context:vscode.ExtensionContext, name:string, url:string): boolean {
        const persists = context.globalState.get<ServerPersistMap>(keyServerPersists, {});
        if ( persists[name]===undefined ) {
            persists[name] = { server: { name, url } };
            context.globalState.update(keyServerPersists, persists);
            return true;
        } else {
            return false;
        }
    }

    static removeServer(context:vscode.ExtensionContext, name:string): boolean {
        const persists = context.globalState.get<ServerPersistMap>(keyServerPersists, {});
        if ( persists[name]!==undefined ) {
            delete persists[name];
            context.globalState.update(keyServerPersists, persists);
            return true;
        } else {
            return false;
        }
    }

    static async loginServer(context:vscode.ExtensionContext, name:string, auth:{[key:string]:string}): Promise<boolean> {
        const persists = context.globalState.get<ServerPersistMap>(keyServerPersists, {});
        const server   = persists[name].server;
        const api      = persists[name].api;

        if (server.login===undefined && api!==undefined) {
            const res = await api.passportLogin(auth.email, auth.password);
            if (res.type==='success' && res.identity!==undefined) {
                server.login = {
                    username: auth.email,
                    identity: res.identity
                };
                context.globalState.update(keyServerPersists, persists);
                return true;
            } else {
                if (res.message!==undefined) {
                    vscode.window.showErrorMessage(res.message);
                }
                return false;
            }
        } else {
            return false;
        }
    }

    static async logoutServer(context:vscode.ExtensionContext, name:string): Promise<boolean> {
        const persists = context.globalState.get<ServerPersistMap>(keyServerPersists, {});
        const server   = persists[name].server;
        const api      = persists[name].api;

        if (server.login!==undefined && api!==undefined) {
            await api.logout(server.login.identity);
            delete server.login;
            context.globalState.update(keyServerPersists, persists);
            return true;
        } else {
            return false;
        }
    }

    static async fetchServerProjects(context:vscode.ExtensionContext, name:string): Promise<ProjectPersist[]> {
        const persists = context.globalState.get<ServerPersistMap>(keyServerPersists, {});
        const server   = persists[name].server;
        const api      = persists[name].api;

        if (server.login!==undefined && api!==undefined) {
            const res = await api.userProjects(server.login.identity);
            if (res.type==='success' && res.projects!==undefined) {
                server.login.projects = res.projects;
                context.globalState.update(keyServerPersists, persists);
                return res.projects;
            } else {
                if (res.message!==undefined) {
                    vscode.window.showErrorMessage(res.message);
                }
                return [];
            }
        } else {
            return [];
        }
    }

}
