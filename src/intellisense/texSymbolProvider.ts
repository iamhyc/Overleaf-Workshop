import * as vscode from 'vscode';
import type * as Ast from '@unified-latex/unified-latex-types';
import * as unifiedLaTeXParse from '@unified-latex/unified-latex-util-parse';
import { ROOT_NAME } from '../consts';
import { RemoteFileSystemProvider, VirtualFileSystem, parseUri } from '../core/remoteFileSystemProvider';
import { FileCache, ProjectCache, TeXElementType, TeXElement } from './texSymbolTreeProvider';
import { IntellisenseProvider } from './langIntellisenseProvider';

// Initialize the parser
let unifiedParser: { parse: (content: string) => Ast.Root } = unifiedLaTeXParse.getParser({ flags: { autodetectExpl3AndAtLetter: true } });

// Env that matches the defaultStructure will be treated as a section with top-down order
const defaultStructure = ["book", "part", "chapter", "section", "subsection", "subsubsection", "paragraph", "subparagraph"];

// Match label command
const defaultCMD = ["label"];

/* 
    * Convert a macro to string
    * 
    * @param macro: the macro to be converted
    * @return: the string representation of the macro
*/
// reference: https://github.com/James-Yu/LaTeX-Workshop/blob/master/src/utils/parser.ts#L3
function macroToStr(macro: Ast.Macro): string {
    if (macro.content === 'texorpdfstring') {
        return (macro.args?.[1].content[0] as Ast.String | undefined)?.content || '';
    }
    return `\\${macro.content}` + (macro.args?.map(arg => `${arg.openMark}${argContentToStr(arg.content)}${arg.closeMark}`).join('') ?? '');
}

/*
    * Convert an environment to string
    * 
    * @param env: the environment to be converted
    * @return: the string representation of the environment
*/
function envToStr(env: Ast.Environment | Ast.VerbatimEnvironment): string {
    return `\\environment{${env.env}}`;
}


/*
    * Convert the content of an argument to string
    * 
    * @param argContent: the content of the argument
    * @param preserveCurlyBrace: whether to preserve the curly brace '{'
    * @return: the string representation of the argument
*/
// reference: https://github.com/James-Yu/LaTeX-Workshop/blob/master/src/utils/parser.ts#L14
function argContentToStr(argContent: Ast.Node[], preserveCurlyBrace: boolean = false): string {
    return argContent.map(node => {
        // Verb
        switch (node.type) {
            case 'string':
                return node.content;
            case 'whitespace':
            case 'parbreak':
            case 'comment':
                return ' ';
            case 'macro':
                return macroToStr(node);
            case 'environment':
            case 'verbatim':
            case 'mathenv':
                return envToStr(node);
            case 'inlinemath':
                return `$${argContentToStr(node.content)}$`;
            case 'displaymath':
                return `\\[${argContentToStr(node.content)}\\]`;
            case 'group':
                return preserveCurlyBrace ? `{${argContentToStr(node.content)}}` : argContentToStr(node.content);
            case 'verb':
                return node.content;
            default:
                return '';
        }
    }).join('');
}


/*
    * Generate a tree-like structure from a LaTeX file
    * 
    * @param document: the LaTeX file
    * @return: the tree-like TeXElement[] structure
*/
// reference: https://github.com/James-Yu/LaTeX-Workshop/blob/master/src/outline/structurelib/latex.ts#L30
export async function genTexElements(documentText: string): Promise<TeXElement[]> {
    const resElement = { children: [] };
    let ast = unifiedParser.parse(documentText);
    for (const node of ast.content) {
        if (['string', 'parbreak', 'whitespace'].includes(node.type)) {
            continue;
        }
        try {
            await parseNode(node, resElement);
        }
        catch (e) {
            console.log(e);
        }
    }
    let struct = resElement.children as TeXElement[];
    struct = hierarchyStructFormat(struct);
    return struct;
}

/*
    * Format the tree-like TeXElement[] structure based on the given order in defaultStructure
    * 
    * @param struct: the flat TeXElement[] structure
    * @return: the formatted TeXElement[] structure
*/
function hierarchyStructFormat(struct: TeXElement[]): TeXElement[] {
    const newStruct: TeXElement[] = [];
    const orderFromDefaultStructure = new Map<string, number>();
    for (const [i, section] of defaultStructure.entries()) {
        orderFromDefaultStructure.set(section, i);
    }
    let prev: TeXElement | undefined;
    for (const section of struct) {
        // Root Node
        if (prev === undefined) {
            newStruct.push(section);
            prev = section;
            continue;
        }
        // Comparing the order of current section and previous section from defaultStructure
        if ((orderFromDefaultStructure.get(section.name) ?? defaultStructure.length) > (orderFromDefaultStructure.get(prev.name) ?? defaultStructure.length)) {
            prev.children.push(section);
        } else {
            newStruct.push(section);
            prev.children = hierarchyStructFormat(prev.children);
            prev = section;
        }
    }
    if (prev !== undefined) {
        prev.children = hierarchyStructFormat(prev.children);
    }
    return newStruct;
}



/*
    * Parse a node and generate a TeXElement, this function travel each node recursively (Here children is referenced by `.content`),
    * if the node is a macro and matches the defaultStructure, it will be treated as a section;
    * if the node is a macro and matches the defaultCMD, it will be treated as a command;
    * if the node is an environment, it will be treated as an environment;
    * 
    * @param node: the node to be parsed
    * @param root: the root TeXElement
*/
// reference: https://github.com/James-Yu/LaTeX-Workshop/blob/master/src/outline/structurelib/latex.ts#L86
async function parseNode(
    node: Ast.Node,
    root: { children: TeXElement[] }
) {
    const attributes = {
        lineFr: (node.position?.start.line ?? 1) - 1,
        lineTo: (node.position?.end.line ?? 1) - 1,
        children: []
    };
    let element: TeXElement | undefined;
    let caption = '';
    switch (node.type) {
        case 'macro':
            let caseType = '';
            if (defaultStructure.includes(node.content) && node.args?.[3].openMark === '{') {
                caseType = 'section';
            } else if (defaultCMD.includes(node.content)) {
                caseType = 'label';
            } else if (node.content === 'input') {
                caseType = 'subFile';
            } else if (node.content === 'bibliography') {
                caseType = 'bibFile';
            }
            let argStr = '';
            switch (caseType) {
                case 'section':
                    element = {
                        type: node.args?.[0]?.content[0]
                            ? TeXElementType.SectionAst
                            : TeXElementType.Section,
                        name: node.content,
                        label: argContentToStr(
                            ((node.args?.[1]?.content?.length ?? 0) > 0
                                ? node.args?.[1]?.content
                                : node.args?.[3]?.content) || []
                        ),
                        ...attributes
                    };
                    break;
                case 'label':
                    argStr = argContentToStr(node.args?.[2]?.content || []);
                    element = {
                        type: TeXElementType.Command,
                        name: node.content,
                        label: `${node.content}` + (argStr ? `: ${argStr}` : ''),
                        ...attributes
                    };
                    break;
                case 'subFile':
                    argStr = argContentToStr(node.args?.[0]?.content || []);
                    element = {
                        type: TeXElementType.SubFile,
                        name: node.content,
                        label: argStr ? `${argStr}` : '',
                        ...attributes
                    };
                    break;
                case 'bibFile':
                    argStr = argContentToStr(node.args?.[0]?.content || []);
                    element = {
                        type: TeXElementType.BibFile,
                        name: node.content,
                        label: argStr ? `${argStr}` : '',
                        ...attributes
                    };
                    break;
                }
            break;
        case 'environment':
            switch (node.env) {
                case 'frame':
                    const frameTitleMacro: Ast.Macro | undefined = node.content.find(
                        sub => sub.type === 'macro' && sub.content === 'frametitle'
                    ) as Ast.Macro | undefined;
                    caption = argContentToStr(node.args?.[3]?.content || []) ||
                        argContentToStr(frameTitleMacro?.args?.[3]?.content || []);
                    element = {
                        type: TeXElementType.Environment,
                        name: node.env,
                        label: `${node.env.charAt(0).toUpperCase()}${node.env.slice(1)}` +
                            (caption ? `: ${caption}` : ''),
                        ...attributes
                    };
                    break;

                case 'figure':
                case 'figure*':
                case 'table':
                case 'table*':
                    const captionMacro: Ast.Macro | undefined = node.content.find(
                        sub => sub.type === 'macro' && sub.content === 'caption'
                    ) as Ast.Macro | undefined;
                    caption = argContentToStr(captionMacro?.args?.[1]?.content || []);
                    if (node.env.endsWith('*')) {
                        node.env = node.env.slice(0, -1);
                    }
                    element = {
                        type: TeXElementType.Environment,
                        name: node.env,
                        label: `${node.env.charAt(0).toUpperCase()}${node.env.slice(1)}` +
                            (caption ? `: ${caption}` : ''),
                        ...attributes
                    };
                    break;

                case 'macro':
                case 'environment':
                default:
                    if (defaultStructure.includes(node.env)) {
                        const caption = (node.content[0] as Ast.Group | undefined)?.content[0] as Ast.String | undefined;
                        element = {
                            type: TeXElementType.Environment,
                            name: node.env,
                            label: `${node.env.charAt(0).toUpperCase()}${node.env.slice(1)}` +
                                (caption ? `: ${caption.content}` : ''),
                            ...attributes
                        };
                    } else {
                        element = {
                            type: TeXElementType.Environment,
                            name: node.env,
                            label: `${node.env.charAt(0).toUpperCase()}${node.env.slice(1)}`,
                            ...attributes
                        };
                    }
                    break;
            }
            break;
        case 'mathenv':
            switch (node.env) {
                case 'string':
                    element = {
                        type: TeXElementType.Environment,
                        name: node.env,
                        label: `${node.env.charAt(0).toUpperCase()}${node.env.slice(1)}`,
                        ...attributes
                    };
                    break;
            }
            break;
    }

    if (element !== undefined) {
        root.children.push(element);
        root = element;
    }

    if ('content' in node && typeof node.content !== 'string') {
        for (const sub of node.content) {
            if (['string', 'parbreak', 'whitespace'].includes(sub.type)) {
                continue;
            }
            await parseNode(sub, root);
        }
    }
}

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

export class DocSymbolProvider extends IntellisenseProvider implements vscode.DocumentSymbolProvider {
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

    public getBibList(){
        return this.projectCaches.get(this.projectPath)?.getBibFilePaths(this.rootPath);
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
            return {scheme: ROOT_NAME, language: id };
        });
        return [
            vscode.languages.registerDocumentSymbolProvider(latexSelector, this),
        ];
    }
}
