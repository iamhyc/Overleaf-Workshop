import * as vscode from 'vscode';
import type * as Ast from '@unified-latex/unified-latex-types';
import * as unifiedLaTeXParse from '@unified-latex/unified-latex-util-parse';
import { ROOT_NAME, BIB_ENTRY} from '../consts';
import { RemoteFileSystemProvider } from '../core/remoteFileSystemProvider';

// Initialize the parser
let unifiedParser: { parse: (content: string) => Ast.Root } = unifiedLaTeXParse.getParser({ flags: { autodetectExpl3AndAtLetter: true } });

// Env that matches the defaultStructure will be treated as a section with top-down order
const defaultStructure = ["book", "part", "chapter", "section", "subsection", "subsubsection", "paragraph", "subparagraph"];

// Match label command
const defaultCMD = ["label"];

// eslint-disable-next-line @typescript-eslint/naming-convention
enum TeXElementType { Environment, Command, Section, SectionAst, SubFile, BibItem, BibField, BibFile};

type TeXElement = {
    readonly type: TeXElementType,
    readonly name: string,
    label: string,
    readonly lineFr: number,
    lineTo: number,
    children: TeXElement[],
    parent?: TeXElement,
    appendix?: boolean
};

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
export async function genTexElements(filePath:string, documentText: string, symbolsCache: Map<string, TeXElement[]>): Promise<TeXElement[]> {
    const resElement = { children: [] };
    const fileElements = { subFile: [], bibFiles: [] };
    let ast = unifiedParser.parse(documentText);
    for (const node of ast.content) {
        if (['string', 'parbreak', 'whitespace'].includes(node.type)) {
            continue;
        }
        try {
            await parseNode(node, resElement , fileElements);
        }
        catch (e) {
            console.log(e);
        }
    }
    let struct = resElement.children as TeXElement[];
    struct = hierarchyStructFormat(struct);
    symbolsCache.set(filePath, struct);
    symbolsCache.set(BIB_ENTRY, fileElements.bibFiles); 
    return fileElements.subFile as TeXElement[];
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
    root: { children: TeXElement[] },
    fileElements : { subFile: TeXElement[], bibFiles: TeXElement[] },
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
        switch (element.type) {
            case TeXElementType.BibFile:
                fileElements.bibFiles.push(element);
                break;
            case TeXElementType.SubFile:
                fileElements.subFile.push(element);
            default:
                root.children.push(element);
                root = element;
                break;
        }
    }

    if ('content' in node && typeof node.content !== 'string') {
        for (const sub of node.content) {
            if (['string', 'parbreak', 'whitespace'].includes(sub.type)) {
                continue;
            }
            await parseNode(sub, root, fileElements);
        }
    }
}

export class DocSymbolProvider implements vscode.DocumentSymbolProvider {
    private _projectCache: Map<string, Map<string, TeXElement[]>> = new Map();

    constructor(protected readonly vfsm: RemoteFileSystemProvider) {
     }

    async init(rootUri: vscode.Uri) {
        const vfs = await this.vfsm.prefetch(rootUri);
        const rootDoc = new TextDecoder().decode(await vfs.openFile(rootUri));
        this._projectCache.set(rootUri.path, new Map());
        const symbolCache = this._projectCache.get(rootUri.path) as Map<string, TeXElement[]>;
        const subFiles = await genTexElements(rootUri.path, rootDoc, symbolCache);
        while (subFiles.length > 0) {
            const subFile = subFiles.pop() as TeXElement;
            const subDocText = new TextDecoder().decode(await vfs.openFile(vfs.pathToUri(subFile.label)));
            if (subDocText) {
                subFiles.push( ... await genTexElements(subFile.label, subDocText, symbolCache));
            }
        }
    }

    async provideDocumentSymbols(document: vscode.TextDocument): Promise<vscode.DocumentSymbol[]> {
        const vfs = await this.vfsm.prefetch(document.uri);
        // const rootDoc = vfs.root?.rootDoc_id;
        const rootDoc = 'main.tex';
        if (rootDoc !== undefined && this._projectCache.has(vfs.pathToUri(rootDoc).path) === false) {
            await this.init(vfs.pathToUri(rootDoc));
        }
        const symbolCache = this._projectCache.get(vfs.pathToUri(rootDoc).path) as Map<string, TeXElement[]>;
        const _ = await genTexElements(document.fileName, document.getText(), symbolCache);
        const symbols = symbolCache.get(document.fileName) as TeXElement[];
        return this.elementsToSymbols(symbols);
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