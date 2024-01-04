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
}
