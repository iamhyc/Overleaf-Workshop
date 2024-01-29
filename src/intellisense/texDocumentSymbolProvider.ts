import * as vscode from 'vscode';
import { VirtualFileSystem, parseUri } from '../core/remoteFileSystemProvider';
import { IntellisenseProvider } from '.';
import { TeXElement, TeXElementType, genTexElements } from './texDocumentParseUtility';
import { ROOT_NAME } from '../consts';

type TexFileStruct = {
    texElements: TeXElement[],
    childrenPaths: string[],
    bibFilePaths: string[],
};

function elementsTypeCast(section: TeXElement): vscode.SymbolKind {
    switch (section.type) {
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

function elementsToSymbols(sections: TeXElement[]): vscode.DocumentSymbol[] {
    const symbols: vscode.DocumentSymbol[] = [];
    sections.forEach(section => {
        const range = new vscode.Range(section.lineFr, 0, section.lineTo, 65535);
        const symbol = new vscode.DocumentSymbol(
            section.label || 'empty',
            '',
            elementsTypeCast(section),
            range, range);
        symbols.push(symbol);
        if (section.children.length > 0) {
            symbol.children = elementsToSymbols(section.children);
        }
    });
    return symbols;
}

/*
    * Convert the file into the struct by:
    * 1. Construct child, named as Uri.path, from TeXElementType.SubFile
    * 2. Construct bibFile from TeXElementType.BibFile
    * 
    * @param filePath: file path of constructed fileSymbolNode
    * @param fileContent: file content 
*/
async function parseTexFileStruct(fileContent:string): Promise<TexFileStruct>{ 
    const childrenPaths = [];
    const bibFilePaths = [];
    const texSymbols = await genTexElements(fileContent);

    // BFS: Traverse the texElements and build fileSymbol
    const queue: TeXElement[] = [...texSymbols];
    while (queue.length > 0) {
        const symbol = queue.shift();
        switch (symbol?.type) {
            case TeXElementType.BibFile:
                bibFilePaths.push(symbol.label);
                break;
            case TeXElementType.SubFile:
                const subFilePath = symbol.label?.endsWith('.tex') ? symbol.label : `${symbol.label}.tex`;
                childrenPaths.push(subFilePath);
                break;
            default:
                break;
        }
        // append children to queue
        symbol?.children.forEach( child => {
            queue.push(child);
        });
    }

    return {
        texElements: texSymbols,
        childrenPaths: childrenPaths,
        bibFilePaths: bibFilePaths,
    };
}

class ProjectStructRecord {
    private fileRecordMap: Map<string, TexFileStruct> = new Map<string, TexFileStruct>();

    constructor (private readonly vfs: VirtualFileSystem) {}

    get rootPath(): string {
        return this.vfs.getRootDocName();
    }

    getTexFileStruct(filePath: string): TexFileStruct | undefined {
        return this.fileRecordMap.get(filePath);
    }
    
    updateRecord(filePath: string, record: TexFileStruct) {
        this.fileRecordMap.set(filePath, record);
    }

    async refreshRecord(document: vscode.TextDocument) {
        const filePath = document.fileName;
        const fileStruct = await parseTexFileStruct( document.getText() );
        this.fileRecordMap.set(filePath, fileStruct);
    }

    getAllBibFilePaths(rootPath:string): string[] {
        const rootStruct = this.fileRecordMap.get(rootPath);
        if (rootStruct === undefined) { return []; }

        const queue = [rootStruct];
        const bibFilePaths: string[] = [];
        // iteratively traverse file node tree
        while (queue.length > 0) {
            const item = queue.shift()!;
            const paths = item.bibFilePaths.flatMap( name => (name.split(',') ?? []) )
                                           .map( name => (name.endsWith('.bib') ? name : `${name}.bib`) );
            bibFilePaths.push(...paths);
            // append children to queue
            item.childrenPaths.forEach( child => {
                const childItem = this.fileRecordMap.get(child);
                childItem && queue.push(childItem);
            });
        }
        return bibFilePaths;
    }
}

export class TexDocumentSymbolProvider extends IntellisenseProvider implements vscode.DocumentSymbolProvider {
    protected readonly contextPrefix = [];

    private projectRecordMap = new Map<string, ProjectStructRecord>();
    private rootPaths = new Set<string>();

    async provideDocumentSymbols(document: vscode.TextDocument): Promise<vscode.DocumentSymbol[]> {
        const vfs = await this.vfsm.prefetch(document.uri);
        const rootPath = vfs.getRootDocName();
        const {projectName} = parseUri(document.uri);

        // update project record map
        if (rootPath) {
            if (!this.projectRecordMap.has(projectName)) {
                this.projectRecordMap.set(projectName, new ProjectStructRecord(vfs));
            }
            if (!this.rootPaths.has(rootPath)) {
                this.rootPaths.add(rootPath);
                await this.init(projectName, rootPath, vfs);
            }
        }

        // return symbols
        const filePath = document.fileName;
        const symbols = this.projectRecordMap.get(projectName)?.getTexFileStruct(filePath)?.texElements;
        return elementsToSymbols( symbols ?? [] );
    }

    //TODO: to be removed
    async init(projectName: string, rootPath: string, vfs: VirtualFileSystem): Promise<void> {
        const rootDoc = new TextDecoder().decode(await vfs.openFile(vfs.pathToUri(rootPath)));
        const record = this.projectRecordMap.get(projectName) as ProjectStructRecord;
        record.updateRecord(rootPath, await parseTexFileStruct(rootDoc));
        const fileQueue: TexFileStruct[] = [record.getTexFileStruct(rootPath) as TexFileStruct];
        // iteratively traverse file node tree
        while (fileQueue.length > 0) {
            const fileNode = fileQueue.shift() as TexFileStruct;
            const subFiles = fileNode.childrenPaths;
            for (const subFile of subFiles) {
                const subFileUri = vfs.pathToUri(subFile);
                const subFileDoc = new TextDecoder().decode(await vfs.openFile(subFileUri));
                record.updateRecord(subFile, await parseTexFileStruct(subFileDoc));
                fileQueue.push(record.getTexFileStruct(subFile) as TexFileStruct);
            };
        }
    }

    get currentBibPathArray(): string[] {
        // check if supported vfs
        const uri = vscode.window.activeTextEditor?.document.uri;
        if (uri?.scheme !== ROOT_NAME) { return []; }
        // get bib file paths
        const {projectName} = parseUri(uri);
        const record = this.projectRecordMap.get(projectName);
        if (record && record.rootPath) {
            return record.getAllBibFilePaths(record.rootPath);
        }
        // otherwise return empty array
        return [];
    }

    get triggers() {
        const latexSelector = ['latex', 'latex-expl3', 'pweave', 'jlweave', 'rsweave'].map((id) => {
            return {...this.selector, language: id };
        });
        return [
            // register symbol provider
            vscode.languages.registerDocumentSymbolProvider(latexSelector, this),
            // register file change listener
            vscode.workspace.onDidChangeTextDocument(async (e) => {
                const filePath = e.document.fileName;
                const record = this.projectRecordMap.get(filePath);
                record?.refreshRecord(e.document);
            }),
        ];
    }
}
