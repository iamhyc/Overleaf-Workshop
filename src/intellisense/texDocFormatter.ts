
import * as vscode from 'vscode';
import * as Prettier from "prettier";
import { prettierPluginLatex } from "@unified-latex/unified-latex-prettier";

// https://github.com/siefkenj/latex-parser-playground/blob/master/src/async-worker/parsing-worker.ts#L35-L43
async function printPrettier(source = "", options = {}) {
    return Prettier.format(source, {
        printWidth: 80,
        useTabs: true,
        ...options,
        parser: "latex-parser",
        plugins: [prettierPluginLatex],
    });
}

async function format(source: string) {
    return await printPrettier(source);
}

export class TexDocFormatter implements vscode.DocumentFormattingEditProvider {
    provideDocumentFormattingEdits(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TextEdit[]> {
        // Get the entire document text
        const text = document.getText();

        // Format the LaTeX code here
        return format(text).then(formattedText => {
        // const formattedText = format(text);

        // Create a TextEdit to replace the entire document text with the formatted text
        const edit = new vscode.TextEdit(new vscode.Range(0, 0, document.lineCount, 0), formattedText);
        // Return the TextEdit as an array
        return [edit];
        });
    }

    provideDocumentRangeFormattingEdits(document: vscode.TextDocument, range: vscode.Range, options: vscode.FormattingOptions, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TextEdit[]> {
        // Get the selected text
        const text = document.getText(range);

        // Format the selected LaTeX code here
        return format(text).then(formattedText => {

        // Create a TextEdit to replace the selected text with the formatted text
        const edit = new vscode.TextEdit(range, formattedText);
        // Return the TextEdit as an array
        return [edit];
        });
    }

    get triggers(){
        const latexSelector = ['latex', 'latex-expl3', 'pweave', 'jlweave', 'rsweave'].map( (id) => {
            return {language: id };
         });
        const texDocFormatter = new TexDocFormatter();
        return[
            vscode.languages.registerDocumentFormattingEditProvider(latexSelector, texDocFormatter),
            vscode.languages.registerDocumentRangeFormattingEditProvider(latexSelector, texDocFormatter)
        ];
    }
}

