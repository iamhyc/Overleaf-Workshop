import * as vscode from 'vscode';
import { RemoteFileSystemProvider, VirtualFileSystem, parseUri } from '../core/remoteFileSystemProvider';
import { IntellisenseProvider } from './langIntellisenseProvider';
import { genTexElements } from './texDocumentParseUtility';

/*
    * Convert the file into the cache by:
    * 1. Construct child, named as Uri.path, from TeXElementType.SubFile
    * 2. Construct bibFile from TeXElementType.BibFile
    * 
    * @param filePath: file path of constructed fileSymbolNode
    * @param fileContent: file content 
*/
async function texToCache(filePath:string, fileContent:string): Promise<FileCache>{ 
    const childrenPaths = [];
    const bibFilePaths = [];
    const texSymbols = await genTexElements(fileContent);
    // Traverse the texElements and build fileSymbol
    const queue: TeXElement[] = [...texSymbols];
    while (queue.length > 0) {
        const symbol = queue.shift() as TeXElement;
        switch (symbol.type) {
            case TeXElementType.BibFile:
                bibFilePaths.push(symbol.label);
                break;
            case TeXElementType.SubFile:
                const subFilePath = symbol.label?.endsWith('.tex') ? symbol.label : `${symbol.label}.tex`;
                childrenPaths.push(subFilePath);
                break;
        }
        symbol.children.forEach( child => {
            queue.push(child);
        });
    }
    const fileCache = {
        filePath : filePath,
        fileContent: fileContent,
        texElements: texSymbols,
        childrenPaths: childrenPaths,
        bibFilePaths: bibFilePaths,
    };
    return fileCache;
}

export class TexDocumentSymbolProvider extends IntellisenseProvider implements vscode.DocumentSymbolProvider {
    protected readonly contextPrefix = [];
    private projectCaches = new Map<string, ProjectCache>();
    private rootPaths = new Set<string>();
    private projectPath = '';
    private rootPath = '';
    
    constructor(protected readonly vfsm: RemoteFileSystemProvider) {
        super(vfsm);
    }

    async provideDocumentSymbols(document: vscode.TextDocument): Promise<vscode.DocumentSymbol[]> {
        const vfs = await this.vfsm.prefetch(document.uri);
        const rootPath = vfs.getRootDocName();
        const projectName = parseUri(document.uri).projectName;
        this.projectPath = projectName;
        this.rootPath = rootPath;
        if (rootPath !== undefined ) {
            if (!this.projectCaches.has(projectName)){
                this.projectCaches.set(projectName, new ProjectCache());
            }
            if (!this.rootPaths.has(rootPath)){
                this.rootPaths.add(rootPath);
                await this.init(rootPath, vfs);
            }
        }
        const documentText = document.getText();
        this.projectCaches.get(this.projectPath)?.updateCache(await texToCache(document.fileName, documentText));
        const symbols = this.projectCaches.get(this.projectPath)?.getFileCache(document.fileName)?.texElements as TeXElement[];
        return this.elementsToSymbols(symbols);
    }

    async init(rootPath: string, vfs: VirtualFileSystem): Promise<void> {
        const rootDoc = new TextDecoder().decode(await vfs.openFile(vfs.pathToUri(rootPath)));
        const projectCache = this.projectCaches.get(this.projectPath) as ProjectCache;
        projectCache.updateCache(await texToCache(rootPath, rootDoc));
        const fileQueue: FileCache[] = [projectCache.getFileCache(rootPath) as FileCache];
        // iteratively traverse file node tree
        while (fileQueue.length > 0) {
            const fileNode = fileQueue.shift() as FileCache;
            const subFiles = fileNode.childrenPaths;
            for (const subFile of subFiles) {
                const subFileUri = vfs.pathToUri(subFile);
                const subFileDoc = new TextDecoder().decode(await vfs.openFile(subFileUri));
                projectCache.updateCache(await texToCache(subFile, subFileDoc));
                fileQueue.push(projectCache.getFileCache(subFile) as FileCache);
            };
        }
    }

    get currentBibPathArray(): string[] {
        const bibFileNames = this.projectCaches.get(this.projectPath)?.getBibFileNameArray(this.rootPath) || [];
        const bibFilePathArray = bibFileNames.flatMap(
            name => (name?.split(',') ?? [])
        ).map(
            name => (name?.endsWith('.bib') ? name : `${name}.bib`)
        );
        return bibFilePathArray;
    }

    private elementsTypeCast(section: TeXElement): vscode.SymbolKind {
        switch (section.type){
            case TeXElementType.Section:
            case TeXElementType.SectionAst:
                return vscode.SymbolKind.Struct;
            case TeXElementType.Environment:
                return vscode.SymbolKind.Package;
            case TeXElementType.Command:
                return vscode.SymbolKind.Number;
            case TeXElementType.SubFile:
                return vscode.SymbolKind.File;
            case TeXElementType.BibItem:
                return vscode.SymbolKind.Class;
            case TeXElementType.BibField:
                return vscode.SymbolKind.Constant;
            default:
                return vscode.SymbolKind.String;
        }
    }

    private elementsToSymbols(sections: TeXElement[]): vscode.DocumentSymbol[] {
        const symbols: vscode.DocumentSymbol[] = [];
        sections.forEach(section => {
            const range = new vscode.Range(section.lineFr, 0, section.lineTo, 65535);
            const symbol = new vscode.DocumentSymbol(
                section.label || 'empty', '',
                this.elementsTypeCast(section),
                range, range);
            symbols.push(symbol);
            if (section.children.length > 0) {
                symbol.children = this.elementsToSymbols(section.children);
            }
        });
        return symbols;
    }

    get triggers(){
        const latexSelector = ['latex', 'latex-expl3', 'pweave', 'jlweave', 'rsweave'].map((id) => {
            return {...this.selector, language: id };
        });
        return [
            vscode.languages.registerDocumentSymbolProvider(latexSelector, this),
        ];
    }
}

// ======================================================================================= //
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

    public getBibFileNameArray(rootPath:string): string[] {
        const fileQueue: FileCache[] = this.fileNodeCache.has(rootPath) ? [this.fileNodeCache.get(rootPath)!] : [];

        const bibFilePaths: string[] = [];
        // iteratively traverse file node tree
        while (fileQueue.length > 0) {
            const fileNode = fileQueue.shift();
            if (fileNode===undefined) { break; }

            if (fileNode.bibFilePaths.length > 0) {
                bibFilePaths.push(...fileNode.bibFilePaths);
            }
            fileNode.childrenPaths.forEach( child => {
                if (this.fileNodeCache.has(child)){
                    fileQueue.push( this.fileNodeCache.get(child)! );
                };
            });
        }
        return bibFilePaths;
    }
}
// ======================================================================================= //
