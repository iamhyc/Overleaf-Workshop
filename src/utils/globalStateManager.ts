import * as vscode from 'vscode';
import { Identity, ResponseSchema, BaseAPI } from '../api/base';
import { SocketIOAPI } from '../api/socketio';

const keyServerPersists: string = 'overleaf-servers';

export interface ProjectPersist {
    _userId: string;
    _id: string;
    name: string;
    accessLevel: string;
}

export interface ServerPersist {
    name: string;
    url: string;
    login?: {
        userId: string;
        username: string;
        identity: Identity;
        projects?: ProjectPersist[]
    };
}

interface ServerPersistMap {
    [name: string]: ServerPersist,
}

export class GlobalStateManager {

    static getServers(context:vscode.ExtensionContext) {
        const persists = context.globalState.get<ServerPersistMap>(keyServerPersists, {});
        return Object.values(persists).map(persist => { return {
            server: persist,
            api: new BaseAPI(persist.url),
        }});
    }

    static addServer(context:vscode.ExtensionContext, name:string, url:string): boolean {
        const persists = context.globalState.get<ServerPersistMap>(keyServerPersists, {});
        if ( persists[name]===undefined ) {
            persists[name] = { name, url };
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

    static async loginServer(context:vscode.ExtensionContext, api:BaseAPI, name:string, auth:{[key:string]:string}): Promise<boolean> {
        const persists = context.globalState.get<ServerPersistMap>(keyServerPersists, {});
        const server   = persists[name];

        if (server.login===undefined) {
            const res = await api.passportLogin(auth.email, auth.password);
            if (res.type==='success' && res.identity!==undefined && res.message!==undefined) {
                server.login = {
                    userId: res.message,
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

    static async logoutServer(context:vscode.ExtensionContext, api:BaseAPI, name:string): Promise<boolean> {
        const persists = context.globalState.get<ServerPersistMap>(keyServerPersists, {});
        const server   = persists[name];

        if (server.login!==undefined) {
            await api.logout(server.login.identity);
            delete server.login;
            context.globalState.update(keyServerPersists, persists);
            return true;
        } else {
            return false;
        }
    }

    static async fetchServerProjects(context:vscode.ExtensionContext, api:BaseAPI, name:string): Promise<ProjectPersist[]> {
        const persists = context.globalState.get<ServerPersistMap>(keyServerPersists, {});
        const server   = persists[name];

        if (server.login!==undefined) {
            const res = await api.userProjects(server.login.identity);
            if (res.type==='success' && res.projects!==undefined) {
                Object.values(res.projects).forEach(project => {
                    project._userId = (server.login as any).userId
                });
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

    static initSocketIOAPI(context:vscode.ExtensionContext, name:string) {
        const persists = context.globalState.get<ServerPersistMap>(keyServerPersists, {});
        const server   = persists[name];

        if (server.login!==undefined) {
            const api = new BaseAPI(server.url);
            return new SocketIOAPI(server.url, api, server.login.identity);
        }
    }

}
