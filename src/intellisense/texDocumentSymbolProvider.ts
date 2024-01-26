import * as vscode from 'vscode';
import { RemoteFileSystemProvider, VirtualFileSystem, parseUri } from '../core/remoteFileSystemProvider';
import { IntellisenseProvider } from './langIntellisenseProvider';
import { TexFileStruct, TeXElement, TeXElementType, parseTexFileStruct } from './texDocumentParseUtility';

function elementsTypeCast(section: TeXElement): vscode.SymbolKind {
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

class ProjectCache {
    private fileNodeCache: Map<string, TexFileStruct> = new Map<string, TexFileStruct>();

    public getTexFileStruct(filePath: string): TexFileStruct | undefined {
        return this.fileNodeCache.get(filePath);
    }
    
    public updateCache(filePath: string, childNode: TexFileStruct): void {
        this.fileNodeCache.set(filePath, childNode);
    }

    public getBibFileNameArray(rootPath:string): string[] {
        const fileQueue: TexFileStruct[] = this.fileNodeCache.has(rootPath) ? [this.fileNodeCache.get(rootPath)!] : [];

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
        this.projectCaches.get(this.projectPath)?.updateCache(document.fileName, await parseTexFileStruct(documentText));
        const symbols = this.projectCaches.get(this.projectPath)?.getTexFileStruct(document.fileName)?.texElements as TeXElement[];
        return this.elementsToSymbols(symbols);
    }

    async init(rootPath: string, vfs: VirtualFileSystem): Promise<void> {
        const rootDoc = new TextDecoder().decode(await vfs.openFile(vfs.pathToUri(rootPath)));
        const projectCache = this.projectCaches.get(this.projectPath) as ProjectCache;
        projectCache.updateCache(rootPath, await parseTexFileStruct(rootDoc));
        const fileQueue: TexFileStruct[] = [projectCache.getTexFileStruct(rootPath) as TexFileStruct];
        // iteratively traverse file node tree
        while (fileQueue.length > 0) {
            const fileNode = fileQueue.shift() as TexFileStruct;
            const subFiles = fileNode.childrenPaths;
            for (const subFile of subFiles) {
                const subFileUri = vfs.pathToUri(subFile);
                const subFileDoc = new TextDecoder().decode(await vfs.openFile(subFileUri));
                projectCache.updateCache(subFile, await parseTexFileStruct(subFileDoc));
                fileQueue.push(projectCache.getTexFileStruct(subFile) as TexFileStruct);
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

    private elementsToSymbols(sections: TeXElement[]): vscode.DocumentSymbol[] {
        const symbols: vscode.DocumentSymbol[] = [];
        sections.forEach(section => {
            const range = new vscode.Range(section.lineFr, 0, section.lineTo, 65535);
            const symbol = new vscode.DocumentSymbol(
                section.label || 'empty', '',
                elementsTypeCast(section),
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
