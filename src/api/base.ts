/* eslint-disable @typescript-eslint/naming-convention */
import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import fetch from 'node-fetch';
import { ProjectPersist } from '../utils/globalStateManager';
import { FileEntity, FileType, FolderEntity, MemberEntity, OutputFileEntity } from '../provider/remoteFileSystemProvider';


export interface Identity {
    csrfToken: string;
    cookies: string;
}

export interface NewProjectResponseSchema {
    project_id: string,
    owner_ref: string,
    owner: MemberEntity
}

export interface CompileResponseSchema {
    status: 'success' | 'error';
    compileGroup: string;
    outputFiles: Array<OutputFileEntity>;
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

export interface SyncPdfResponseSchema {
    file: string,
    line: number,
    column: number
}

export interface SyncCodeResponseSchema {
    pdf: Array<{
        page: number,
        h: number,
        v: number,
        width: number,
        height: number,
    }>
}

export interface ResponseSchema {
    type: 'success' | 'error';
    raw?: ArrayBuffer;
    message?: string;
    identity?: Identity;
    projects?: ProjectPersist[];
    entity?: FileEntity;
    compile?: CompileResponseSchema;
    content?: Uint8Array;
    syncPdf?: SyncPdfResponseSchema;
    syncCode?: SyncCodeResponseSchema;
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
        const res = await fetch(this.url+'api/project', {
            method: 'POST', redirect: 'manual', agent: this.agent,
            headers: {
                'Connection': 'keep-alive',
                'Content-Type': 'application/json',
                'Cookie': identity.cookies.split(';')[0],
            },
            body: JSON.stringify({ _csrf: identity.csrfToken })
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

    async newProject(identity:Identity, projectName:string, template:'none'|'example') {
        const res = await fetch(this.url+'project/new', {
            method: 'POST', redirect: 'manual', agent: this.agent,
            headers: {
                'Connection': 'keep-alive',
                'Content-Type': 'application/json',
                'Cookie': identity.cookies.split(';')[0],
            },
            body: JSON.stringify({
                _csrf: identity.csrfToken,
                projectName, template
            })
        });

        if (res.status===200) {
            return {
                type: 'success',
                message: (await res.json() as NewProjectResponseSchema).project_id
            };
        }
        else {
            return {
                type: 'error',
                message: `${res.status}: `+await res.text()
            };
        }
    }

    async renameProject(identity:Identity, projectId:string, newProjectName:string) {
        const res = await fetch(this.url+`project/${projectId}/rename`, {
            method: 'POST', redirect: 'manual', agent: this.agent,
            headers: {
                'Connection': 'keep-alive',
                'Content-Type': 'application/json',
                'Cookie': identity.cookies.split(';')[0],
            },
            body: JSON.stringify({
                _csrf: identity.csrfToken,
                newProjectName
            })
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

    async deleteProject(identity:Identity, projectId:string) {
        const res = await fetch(this.url+`project/${projectId}`, {
            method: 'DELETE', redirect: 'manual', agent: this.agent,
            headers: {
                'Connection': 'keep-alive',
                'Cookie': identity.cookies.split(';')[0],
                'X-Csrf-Token': identity.csrfToken,
            }
        });

        if (res.status===200) {
            return {
                type: 'success',
            };
        } else {
            return {
                type: 'error',
                message: `${res.status}: `+await res.text()
            };
        }
    }

    async archiveProject(identity:Identity, projectId:string) {
        const res = await fetch(this.url+`project/${projectId}/archive`, {
            method: 'POST', redirect: 'manual', agent: this.agent,
            headers: {
                'Connection': 'keep-alive',
                'Content-Type': 'application/json',
                'Cookie': identity.cookies.split(';')[0],
                'X-Csrf-Token': identity.csrfToken,
            }
        });

        if (res.status===200) {
            return {
                type: 'success',
            };
        } else {
            return {
                type: 'error',
                message: `${res.status}: `+await res.text()
            };
        }
    }

    async unarchiveProject(identity:Identity, projectId:string) {
        const res = await fetch(this.url+`project/${projectId}/archive`, {
            method: 'DELETE', redirect: 'manual', agent: this.agent,
            headers: {
                'Connection': 'keep-alive',
                'Content-Type': 'application/json',
                'Cookie': identity.cookies.split(';')[0],
                'X-Csrf-Token': identity.csrfToken,
            }
        });

        if (res.status===200) {
            return {
                type: 'success',
            };
        } else {
            return {
                type: 'error',
                message: `${res.status}: `+await res.text()
            };
        }
    }

    async trashProject(identity:Identity, projectId:string) {
        const res = await fetch(this.url+`project/${projectId}/trash`, {
            method: 'POST', redirect: 'manual', agent: this.agent,
            headers: {
                'Connection': 'keep-alive',
                'Content-Type': 'application/json',
                'Cookie': identity.cookies.split(';')[0],
                'X-Csrf-Token': identity.csrfToken,
            }
        });

        if (res.status===200) {
            return {
                type: 'success',
            };
        } else {
            return {
                type: 'error',
                message: `${res.status}: `+await res.text()
            };
        }
    }

    async untrashProject(identity:Identity, projectId:string) {
        const res = await fetch(this.url+`project/${projectId}/trash`, {
            method: 'DELETE', redirect: 'manual', agent: this.agent,
            headers: {
                'Connection': 'keep-alive',
                'Content-Type': 'application/json',
                'Cookie': identity.cookies.split(';')[0],
                'X-Csrf-Token': identity.csrfToken,
            }
        });

        if (res.status===200) {
            return {
                type: 'success',
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
        let content: Buffer[] = [];
        while(true) {
            const res = await fetch(this.url+`project/${projectId}/file/${fileId}`, {
                method: 'GET', redirect: 'manual', agent: this.agent,
                headers: {
                    'Connection': 'keep-alive',
                    'Cookie': identity.cookies.split(';')[0],
                }
            });
            if (res.status===200) {
                content.push(await res.buffer());
                break;
            }
            else if (res.status===206) {
                content.push(await res.buffer());
            } else {
                break;
            }
        };
        return {
            type: 'success',
            content: new Uint8Array( Buffer.concat(content) )
        };
    }

    async uploadFile(identity:Identity, projectId:string, parentFolderId:string, fileName:string, fileContent:Uint8Array) {
        const fileStream = require('stream').Readable.from(fileContent);
        const formData = new (require('form-data'))();
        const mimeType = require('mime-types').lookup(fileName);
        formData.append('targetFolderId', parentFolderId);
        formData.append('name', fileName);
        formData.append('type', mimeType? mimeType : 'text/plain');
        formData.append('qqfile', fileStream, {filename: fileName});
        const res = await fetch(this.url+`project/${projectId}/upload?folder_id=${parentFolderId}`, {
            method: 'POST', redirect: 'manual', agent: this.agent,
            headers: {
                'Connection': 'keep-alive',
                'Cookie': identity.cookies.split(';')[0],
                'X-Csrf-Token': identity.csrfToken,
            },
            body: formData
        });


        if (res.status===200) {
            const {success, entity_id, entity_type} = await res.json() as any;
            return {
                type: 'success',
                entity: {_type:entity_type, _id:entity_id, name:fileName}
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
                entity: (await res.json() as FolderEntity),
            };
        } else {
            return {
                type: 'error',
                message: `${res.status}: `+await res.text()
            };
        }
    }

    async deleteEntity(identity:Identity, projectId:string, fileType:FileType, fileId:string) {
        const res = await fetch(this.url+`project/${projectId}/${fileType}/${fileId}`, {
            method: 'DELETE', redirect: 'manual', agent: this.agent,
            headers: {
                'Connection': 'keep-alive',
                'Cookie': identity.cookies.split(';')[0],
                'X-Csrf-Token': identity.csrfToken,
            },
        });

        if (res.status===204) {
            return {
                type: 'success',
            };
        } else {
            return {
                type: 'error',
                message: `${res.status}: `+await res.text()
            };
        }
    }

    async renameEntity(identity:Identity, projectId:string, entityType:string, entityId:string, newName:string) {
        const res = await fetch(this.url+`project/${projectId}/${entityType}/${entityId}/rename`, {
            method: 'POST', redirect: 'manual', agent: this.agent,
            headers: {
                'Connection': 'keep-alive',
                'Content-Type': 'application/json',
                'Cookie': identity.cookies.split(';')[0],
                'X-Csrf-Token': identity.csrfToken,
            },
            body: JSON.stringify({name:newName})
        });

        if (res.status===204) {
            return {
                type: 'success',
            };
        } else {
            return {
                type: 'error',
                message: `${res.status}: `+await res.text()
            };
        }
    }

    async moveEntity(identity:Identity, projectId:string, entityType:string, entityId:string, newParentFolderId:string) {
        const res = await fetch(this.url+`project/${projectId}/${entityType}/${entityId}/move`, {
            method: 'POST', redirect: 'manual', agent: this.agent,
            headers: {
                'Connection': 'keep-alive',
                'Content-Type': 'application/json',
                'Cookie': identity.cookies.split(';')[0],
                'X-Csrf-Token': identity.csrfToken,
            },
            body: JSON.stringify({folder_id:newParentFolderId})
        });
        if (res.status===204) {
            return {
                type: 'success',
            };
        }
        else {
            return {
                type: 'error',
                message: `${res.status}: `+await res.text()
            };
        }
    }

    async compile(identity:Identity, projectId:string) {
        const res = await fetch(this.url+`project/${projectId}/compile?auto_compile=true`, {
            method: 'POST', redirect: 'manual', agent: this.agent,
            headers: {
                'Connection': 'keep-alive',
                'Content-Type': 'application/json',
                'Cookie': identity.cookies.split(';')[0],
                'X-Csrf-Token': identity.csrfToken,
            },
            body: JSON.stringify({
                check: "silent",
                draft: false,
                incrementalCompilesEnabled: true,
                rootDoc_id: null,
                stopOnFirstError: false
            })
        });

        if (res.status===200) {
            return {
                type: 'success',
                compile: await res.json() as CompileResponseSchema
            };
        } else {
            return {
                type: 'error',
                message: `${res.status}: `+await res.text()
            };
        }
    }

    async getFileFromClsi(identity:Identity, url:string, compileGroup:string) {
        let content: Buffer[] = [];
        url = url.replace(/^\/+/g, '');
        while(true) {
            const res = await fetch(this.url+url, {
                method: 'GET', redirect: 'manual', agent: this.agent,
                headers: {
                    'Connection': 'keep-alive',
                    'Cookie': identity.cookies.split(';')[0],
                }
            });
            if (res.status===200) {
                content.push(await res.buffer());
                break;
            }
            else if (res.status===206) {
                content.push(await res.buffer());
            } else {
                break;
            }
        };
        return {
            type: 'success',
            content: new Uint8Array( Buffer.concat(content) )
        };
    }

    async proxySyncPdf(identity:Identity, projectId:string, page:number, h:number, v:number) {
        const res = await fetch(this.url+`project/${projectId}/sync/pdf?page=${page}&h=${h.toFixed(2)}&v=${v.toFixed(2)}`, {
            method: 'GET', redirect: 'manual', agent: this.agent,
            headers: {
                'Connection': 'keep-alive',
                'Content-Type': 'application/json',
                'Cookie': identity.cookies.split(';')[0],
                'X-Csrf-Token': identity.csrfToken,
            }
        });

        if (res.status===200) {
            return {
                type: 'success',
                syncPdf: (await res.json() as any).code[0] as SyncPdfResponseSchema
            };
        } else {
            return {
                type: 'error',
                message: `${res.status}: `+await res.text()
            };
        }
    }

    async proxySyncCode(identity:Identity, projectId:string, file:string, line:number, column:number) {
        const res = await fetch(this.url+`project/${projectId}/sync/code?file=${file}&line=${line}&column=${column}`, {
            method: 'GET', redirect: 'manual', agent: this.agent,
            headers: {
                'Connection': 'keep-alive',
                'Cookie': identity.cookies.split(';')[0],
            }
        });

        if (res.status===200) {
            return {
                type: 'success',
                syncCode: (await res.json() as any).pdf as SyncCodeResponseSchema
            };
        } else {
            return {
                type: 'error',
                message: `${res.status}: `+await res.text()
            };
        }
    }
}
