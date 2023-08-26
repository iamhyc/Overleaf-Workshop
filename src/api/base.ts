import * as http from 'http';
import * as https from 'https';
import fetch from 'node-fetch';
import { ProjectPersist } from '../utils/globalStateManager';
import { FolderEntity } from '../provider/remoteFileSystemProvider';

export interface Identity {
    csrfToken: string;
    cookies: string;
}

export interface CompileResponseSchema {
    status: 'success' | 'error';
    compileGroup: string;
    outputFiles: Array<{
        path: string, //output file name
        url: string, // `project/${projectId}/user/${userId}/output/${build}/output/${path}`
        type: string, //output file type (postfix)
        build: string, //build id
    }>;
    stats: {
        "latexmk-errors":number, "pdf-size":number,
        "latex-runs":number, "latex-runs-with-errors":number,
        "latex-runs-0":number, "latex-runs-with-error-0s":number,
    };
    timings: {
        "sync":number, "compile":number, "output":number, "compileE2E":number,
    };
    enableHybridPdfDownload: boolean;
}

export interface ResponseSchema {
    type: 'success' | 'error';
    raw?: ArrayBuffer;
    message?: string;
    identity?: Identity;
    projects?: ProjectPersist[];
    folder?: FolderEntity;
}

export class BaseAPI {
    private url: string;
    private agent: http.Agent | https.Agent;

    constructor(url:string) {
        this.url = url;
        this.agent = new URL(url).protocol==='http:' ? new http.Agent({keepAlive: true}) : new https.Agent({keepAlive: true});
    }

    private async getCsrfToken(): Promise<Identity> {
        const res = await fetch(this.url+'login', {
            method: 'GET', redirect: 'manual', agent: this.agent,
        });
        const body = await res.text();
        const match = body.match(/<input.*name="_csrf".*value="([^"]*)">/);
        if (!match) {
            throw new Error('Failed to get CSRF token.');
        } else {
            const csrfToken = match[1];
            const cookies = res.headers.raw()['set-cookie'][0];
            return { csrfToken, cookies };
        }
    }

    private async getUserId(identity:Identity) {
        const res = await fetch(this.url+'project', {
            method: 'GET', redirect:'manual', agent: this.agent,
            headers: {
                'Connection': 'keep-alive',
                'Cookie': identity.cookies.split(';')[0],
            }
        });

        const body = await res.text();
        const userIDMatch = body.match(/<meta\s+name="ol-user_id"\s+content="([^"]*)">/);
        const csrfTokenMatch = body.match(/<meta\s+name="ol-csrfToken"\s+content="([^"]*)">/);
        if (userIDMatch!==null && csrfTokenMatch!==null) {
            const userId = userIDMatch[1];
            const csrfToken = csrfTokenMatch[1];
            return {userId, csrfToken};
        } else {
            throw new Error('Failed to get UserID.');
        }
    }

    // Reference: "github:overleaf/overleaf/services/web/frontend/js/ide/connection/ConnectionManager.js#L137"
    _initSocketV0(identity:Identity) {
        const url = new URL(this.url).origin;
        return (require('socket.io-client').connect as any)(url, {
            reconnect: false,
            'force new connection': true,
            extraHeaders: {
                'Cookie': identity.cookies.split(';')[0],
            }
        });
    }

    async passportLogin(email:string, password:string): Promise<ResponseSchema> {
        const identity = await this.getCsrfToken();
        const res = await fetch(this.url+'login', {
            method: 'POST', redirect: 'manual', agent: this.agent,
            headers: {
                'Accept': '*/*',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Content-Type': 'application/json',
                'Cookie': identity.cookies.split(';')[0],
                'X-Csrf-Token': identity.csrfToken,
            },
            body: JSON.stringify({ _csrf: identity.csrfToken, email: email, password: password })
        });

        if (res.status===302) {
            const redirect = ((await res.text()).match(/Found. Redirecting to (.*)/) as any)[1];
            if (redirect==='/project') {
                const cookies = res.headers.raw()['set-cookie'][0];
                identity.cookies = cookies;
                const {userId,csrfToken} = await this.getUserId(identity);
                identity.csrfToken = csrfToken;
                return {
                    type: 'success',
                    message: userId,
                    identity: identity
                };
            } else {
                return {
                    type: 'error',
                    message: `Redirecting to /${redirect}`
                };
            }
        }
        else if (res.status===200) {
            return {
                type: 'error',
                message: (await res.json() as any).message.message
            };
        } else if (res.status===401) {
            return {
                type: 'error',
                message: (await res.json() as any).message.text
            };
        } else {
            return {
                type: 'error',
                message: `${res.status}: `+await res.text()
            };
        }
    }

    async logout(identity:Identity): Promise<ResponseSchema> {
        const res = await fetch(this.url+'logout', {
            method: 'POST', redirect: 'manual', agent: this.agent,
            headers: {
                'Connection': 'keep-alive',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': identity.cookies.split(';')[0],
            },
            body: JSON.stringify({ _csrf: identity.csrfToken })
        });

        if (res.status===200) {
            return {
                type: 'success'
            };
        } else {
            return {
                type: 'error',
                message: `${res.status}: `+await res.text()
            };
        }
    }

    async userProjects(identity:Identity): Promise<ResponseSchema> {
        const res = await fetch(this.url+'user/projects', {
            method: 'GET', redirect: 'manual', agent: this.agent,
            headers: {
                'Connection': 'keep-alive',
                'Cookie': identity.cookies.split(';')[0],
            }
        });

        if (res.status===200) {
            return {
                type: 'success',
                projects: (await res.json() as any).projects
            };
        } else {
            return {
                type: 'error',
                message: `${res.status}: `+await res.text()
            };
        }
    }

    private async _sendEditingSessionHeartbeat(identity:Identity, projectId:string, segmentation: any) {
        const res = await fetch(this.url+`editingSession/${projectId}`, {
            method: 'PUT', redirect: 'manual', agent: this.agent,
            headers: {
                'Connection': 'keep-alive',
                'Content-Type': 'application/json',
                'Cookie': identity.cookies.split(';')[0],
                'X-Csrf-Token': identity.csrfToken,
            },
            body: JSON.stringify({segmentation})
        });

        const body = await res.text();
        if (res.status===202 && body==='Accepted') {
            return;
        } else {
            throw new Error(`${res.status}: `+body);
        }
    }

    async getFile(identity:Identity, projectId:string, fileId:string) {
        const res = await fetch(this.url+`project/${projectId}/file/${fileId}`, {
            method: 'GET', redirect: 'manual', agent: this.agent,
            headers: {
                'Connection': 'keep-alive',
                'Cookie': identity.cookies.split(';')[0],
            }
        });

        if (res.status===200) {
            return {
                type: 'success',
                raw: await res.arrayBuffer()
            };
        } else {
            return {
                type: 'error',
                message: `${res.status}: `+await res.text()
            };
        }
    }

    async addFolder(identity:Identity, projectId:string, folderName:string, parentFolderId:string) {
        // await this._sendEditingSessionHeartbeat(identity, projectId, {editorType:'ace'});
        const res = await fetch(this.url+`project/${projectId}/folder`, {
            method: 'POST', redirect: 'manual', agent: this.agent,
            headers: {
                'Connection': 'keep-alive',
                'Content-Type': 'application/json',
                'Cookie': identity.cookies.split(';')[0],
                'X-Csrf-Token': identity.csrfToken,
            },
            body: JSON.stringify({
                name: folderName,
                parent_folder_id: parentFolderId
            })
        });

        if (res.status===200) {
            return {
                type: 'success',
                folder: (await res.json() as any),
            };
        } else {
            return {
                type: 'error',
                message: `${res.status}: `+await res.text()
            };
        }
    }
}
