/* eslint-disable @typescript-eslint/naming-convention */
import { BaseAPI, Identity } from "./base";

export interface ProjectLinkedFileProvider {
    provider: 'project_file',
    source_project_id: string,
    source_entity_path: string,
}

export interface UrlLinkedFileProvider {
    provider: 'url',
    url: string,
}

export class ExtendedBaseAPI extends BaseAPI {
    async refreshLinkedFile(identity:Identity, project_id:string, file_id:string) {
        this.setIdentity(identity);
        return await this.request('POST', `project/${project_id}/linked_file/${file_id}/refresh`, {shouldReindexReferences: false}, (res) => {
            const message  = JSON.parse(res!).new_file_id;
            return {message};
        }, {'X-Csrf-Token': identity.csrfToken});
    }

    async createLinkedFile(identity:Identity, project_id:string, parent_folder_id:string, name:string, provider:string, data:any) {
        this.setIdentity(identity);
        return await this.request('POST', `project/${project_id}/linked_file`, {name, parent_folder_id, provider, data}, (res) => {
            const message  = JSON.parse(res!).new_file_id;
            return {message};
        }, {'X-Csrf-Token': identity.csrfToken});
    }
}
