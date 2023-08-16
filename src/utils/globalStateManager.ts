import * as vscode from 'vscode';
import * as api from '../api/base';

const keyServerStates: string = 'overleaf-servers';

export interface ProjectState {
    _id: string;
    name: string;
    accessLevel: string;
}

export interface ServerState {
    name: string;
    url: string;
    login?: {
        username: string;
        identity: any;
        projects?: ProjectState[]
    };
}

interface ServerStateMap {
    [name: string]: ServerState;
}

export class GlobalStateManager {

    static getServers(context:vscode.ExtensionContext):ServerStateMap {
        return context.globalState.get<ServerStateMap>(keyServerStates, {});
    }

    static addServer(context:vscode.ExtensionContext, name:string, url:string): boolean {
        const servers = context.globalState.get<ServerStateMap>(keyServerStates, {});
        if ( servers[name]===undefined ) {
            servers[name] = {name, url};
            context.globalState.update(keyServerStates, servers);
            return true;
        } else {
            return false;
        }
    }

    static removeServer(context:vscode.ExtensionContext, name:string): boolean {
        const servers = context.globalState.get<ServerStateMap>(keyServerStates, {});
        if ( servers[name]!==undefined ) {
            delete servers[name];
            context.globalState.update(keyServerStates, servers);
            return true;
        } else {
            return false;
        }
    }

    static async loginServer(context:vscode.ExtensionContext, name:string, auth:{[key:string]:string}): Promise<boolean> {
        const servers = context.globalState.get<ServerStateMap>(keyServerStates, {});
        const server  = servers[name];

        if (server.login===undefined) {
            const res = await api.passportLogin(server.url, auth.email, auth.password);
            if (res.type==='success' && res.identity!==undefined) {
                server.login = {
                    username: auth.email,
                    identity: res.identity
                };
                context.globalState.update(keyServerStates, servers);
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
        const servers = context.globalState.get<ServerStateMap>(keyServerStates, {});
        const server  = servers[name];

        if (server.login!==undefined) {
            await api.logout(server.url, server.login.identity);
            delete server.login;
            context.globalState.update(keyServerStates, servers);
            return true;
        } else {
            return false;
        }
    }

}
