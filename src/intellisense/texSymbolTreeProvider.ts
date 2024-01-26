// eslint-disable-next-line @typescript-eslint/naming-convention
export enum TeXElementType { Environment, Command, Section, SectionAst, SubFile, BibItem, BibField, BibFile};

export type TeXElement = {
    readonly type: TeXElementType,
    readonly name: string,
    label: string,
    readonly lineFr: number,
    lineTo: number,
    children: TeXElement[],
    parent?: TeXElement,
    appendix?: boolean,
};

export type FileCache = {
    filePath : string,
    fileContent: string,
    texElements: TeXElement[],
    childrenPaths: string[],
    bibFilePaths: string[],
};

export class ProjectCache {
    private fileNodeCache: Map<string, FileCache> = new Map<string, FileCache>();

    public getFileCache(filePath: string): FileCache | undefined {
        return this.fileNodeCache.get(filePath);
    }
    
    public updateCache(childNode: FileCache): void {
        this.fileNodeCache.set(childNode.filePath, childNode);
    }

    public getBibFilePaths(rootPath:string): string[] {
        const fileQueue: FileCache[] = this.fileNodeCache.has(rootPath) ? [this.fileNodeCache.get(rootPath) as FileCache] : [];
        const bibFilePaths: string[] = [];
        // iteratively traverse file node tree
        while (fileQueue.length > 0) {
            const fileNode = fileQueue.shift() as FileCache;
            if (fileNode.bibFilePaths.length > 0) {
                bibFilePaths.push(...fileNode.bibFilePaths);
            }
            fileNode.childrenPaths.forEach( child => {
                if (this.fileNodeCache.has(child)){
                    fileQueue.push(this.fileNodeCache.get(child) as FileCache);
                };
            });
        }
        return bibFilePaths;
    }
}
