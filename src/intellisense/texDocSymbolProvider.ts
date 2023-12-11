import * as vscode from 'vscode';
import type * as Ast from '@unified-latex/unified-latex-types';
import * as unifiedLaTeXParse from '@unified-latex/unified-latex-util-parse';

const defaultStructure = ["book", "part", "chapter", "section", "subsection", "subsubsection", "paragraph", "subparagraph"];

const defaultCMD = ["label"];

enum TeXElementType { Environment, Command, Section, SectionAst, SubFile, BibItem, BibField };

type TeXElement = {
    readonly type: TeXElementType,
    readonly name: string,
    label: string,
    readonly lineFr: number,
    lineTo: number,
    readonly filePath: string,
    children: TeXElement[],
    parent?: TeXElement,
    appendix?: boolean
};

type UnifiedParser = { parse: (content: string) => Ast.Root };

type FileStructureCache = {
    [filePath: string]: TeXElement[]
};

let unifiedParser: UnifiedParser = unifiedLaTeXParse.getParser({ flags: { autodetectExpl3AndAtLetter: true } });

export class DocSymbolProvider implements vscode.DocumentSymbolProvider {

    async provideDocumentSymbols(document: vscode.TextDocument): Promise<vscode.DocumentSymbol[]> {
        const sections = await construct(document);
        return this.sectionToSymbols(sections);
    }

    private sectionToKind(section: TeXElement): vscode.SymbolKind {
        if (section.type === TeXElementType.Section || section.type === TeXElementType.SectionAst) {
            return vscode.SymbolKind.Struct;
        }
        if (section.type === TeXElementType.Environment) {
            return vscode.SymbolKind.Package;
        }
        if (section.type === TeXElementType.Command) {
            return vscode.SymbolKind.Number;
        }
        if (section.type === TeXElementType.SubFile) {
            return vscode.SymbolKind.File;
        }
        if (section.type === TeXElementType.BibItem) {
            return vscode.SymbolKind.Class;
        }
        if (section.type === TeXElementType.BibField) {
            return vscode.SymbolKind.Constant;
        }
        return vscode.SymbolKind.String;
    }

    private sectionToSymbols(sections: TeXElement[]): vscode.DocumentSymbol[] {
        const symbols: vscode.DocumentSymbol[] = [];

        sections.forEach(section => {
            const range = new vscode.Range(section.lineFr, 0, section.lineTo, 65535);
            const symbol = new vscode.DocumentSymbol(
                section.label || 'empty', '',
                this.sectionToKind(section),
                range, range);
            symbols.push(symbol);
            if (section.children.length > 0) {
                symbol.children = this.sectionToSymbols(section.children);
            }
        });
        return symbols;
    }

    get triggers(){
        const latexSelector = ['latex', 'latex-expl3', 'pweave', 'jlweave', 'rsweave'].map( (id) => {
            return {language: id };
         });
        return [
            vscode.languages.registerDocumentSymbolProvider(latexSelector, new DocSymbolProvider())
        ];
    }
}

// reference: https://github.com/James-Yu/LaTeX-Workshop/blob/master/src/utils/parser.ts#L3
function macroToStr(macro: Ast.Macro): string {
    if (macro.content === 'texorpdfstring') {
        return (macro.args?.[1].content[0] as Ast.String | undefined)?.content || '';
    }
    return `\\${macro.content}` + (macro.args?.map(arg => `${arg.openMark}${argContentToStr(arg.content)}${arg.closeMark}`).join('') ?? '');
}

function envToStr(env: Ast.Environment | Ast.VerbatimEnvironment): string {
    return `\\environment{${env.env}}`;
}

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

// reference: https://github.com/James-Yu/LaTeX-Workshop/blob/master/src/outline/structurelib/latex.ts#L30
export async function construct(document: vscode.TextDocument): Promise<TeXElement[]> {
    const filePath = document.fileName;
    if (filePath === undefined) {
        return [];
    }
    const structs: FileStructureCache = {};
    await constructFile(filePath, structs, document.getText());
    // In rare cases, the following struct may be undefined. Typically in tests
    // where roots are changed rapidly.
    let struct =  structs[filePath];
    struct = hierachyStructFormat(struct);
    return struct;
}

// Create Tree-like structure from flat TexElement[]
function hierachyStructFormat(struct: TeXElement[]): TeXElement[] {
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
            prev.children = hierachyStructFormat(prev.children);
            prev = section;
        }
    }
    if (prev !== undefined) {
        prev.children = hierachyStructFormat(prev.children);
    }
    return newStruct;
}


// reference: https://github.com/James-Yu/LaTeX-Workshop/blob/master/src/outline/structurelib/latex.ts#L55
async function constructFile(filePath: string, structs: FileStructureCache, fileContent:string): Promise<void> {
    if (structs[filePath] !== undefined) {
        return;
    }
    // Get a list of rnw child chunks

    // Parse each base-level node. If the node has contents, that function
    // will be called recursively.
    const rootElement = { children: [] };
    structs[filePath] = rootElement.children;
    let ast = await unifiedParser.parse(fileContent);
    
    let inAppendix = false;
    for (const node of ast.content) {
        if (['string', 'parbreak', 'whitespace'].includes(node.type)) {
            continue;
        }
        // Appendix is a one-way journey. Once in it, always in it.
        try {
            if (await parseNode(node, rootElement, filePath, structs, inAppendix)) {
                inAppendix = true;
            }
        }
        catch (e) {
            console.log(e);
        }
    }
}

// reference: https://github.com/James-Yu/LaTeX-Workshop/blob/master/src/outline/structurelib/latex.ts#L86
async function parseNode(
        node: Ast.Node,
        root: { children: TeXElement[] },
        filePath: string,
        structs: FileStructureCache,
        inAppendix: boolean): Promise<boolean> {
    const attributes = {
        lineFr: (node.position?.start.line ?? 1) - 1,
        lineTo: (node.position?.end.line ?? 1) - 1,
        filePath, children: []
    };
    let element: TeXElement | undefined;
    if (node.type === 'macro'&& defaultStructure.includes(node.content) && node.args?.[3].openMark === '{') {
        // To use a macro as an outline item, the macro must have an explicit
        // mandatory argument e.g. \section{} instead of \section. This is to
        // ignore cases like \titleformat{\section} when \titleformat is not
        // globbing arguments in unified-latex.
        element = {
            type: node.args?.[0]?.content[0] ? TeXElementType.SectionAst : TeXElementType.Section,
            name: node.content,
            label: argContentToStr(((node.args?.[1]?.content?.length ?? 0) > 0 ? node.args?.[1]?.content : node.args?.[3]?.content) || []),
            appendix: inAppendix,
            ...attributes
        };
    } else if (node.type === 'macro' && defaultCMD.includes(node.content)) {
        const argStr = argContentToStr(node.args?.[1]?.content || []);
        element = {
            type: TeXElementType.Command,
            name: node.content,
            label: `#${node.content}` + (argStr ? `: ${argStr}` : ''),
            ...attributes
        };
    }else if (node.type === 'macro' && node.content === 'appendix') {
        inAppendix = true;
    }else if ((node.type === 'environment') && node.env === 'frame') {
        const frameTitleMacro: Ast.Macro | undefined = node.content.find(sub => sub.type === 'macro' && sub.content === 'frametitle') as Ast.Macro | undefined;
        const caption = argContentToStr(node.args?.[3]?.content || []) || argContentToStr(frameTitleMacro?.args?.[3]?.content || []);
        element = {
            type: TeXElementType.Environment,
            name: node.env,
            label: `${node.env.charAt(0).toUpperCase()}${node.env.slice(1)}`  + (caption ? `: ${caption}` : '') ,
            ...attributes
        };
    } else if ((node.type === 'environment') && (
                (node.env === 'figure' || node.env === 'figure*')  ||
                (node.env === 'table' || node.env === 'table*'))) {
        const captionMacro: Ast.Macro | undefined = node.content.find(sub => sub.type === 'macro' && sub.content === 'caption') as Ast.Macro | undefined;
        const caption = argContentToStr(captionMacro?.args?.[1]?.content || []);
        if (node.env.endsWith('*')) {
            node.env = node.env.slice(0, -1);
        }
        element = {
            type: TeXElementType.Environment,
            name: node.env,
            label: `${node.env.charAt(0).toUpperCase()}${node.env.slice(1)}` + (caption ? `: ${caption}` : ''),
            ...attributes
        };
    } else if ((node.type === 'environment') && (node.env === 'macro' || node.env === 'environment')) {
        // DocTeX: \begin{macro}{<macro>}
        const caption = (node.content[0] as Ast.Group | undefined)?.content[0] as Ast.String | undefined;
        element = {
            type: TeXElementType.Environment,
            name: node.env,
            label: `${node.env.charAt(0).toUpperCase()}${node.env.slice(1)}` + (caption ? `: ${caption}` : ''),
            ...attributes
        };
    } else if (node.type === 'environment' || node.type === 'mathenv') {
        element = {
            type: TeXElementType.Environment,
            name: node.env,
            label: `${node.env.charAt(0).toUpperCase()}${node.env.slice(1)}`,
            ...attributes
        };
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
            inAppendix = await parseNode(sub, root, filePath, structs, inAppendix);
        }
    }
    return inAppendix;
}

