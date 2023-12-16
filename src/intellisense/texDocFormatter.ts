
import * as vscode from 'vscode';
import * as Prettier from "prettier";
import { prettierPluginLatex } from "@unified-latex/unified-latex-prettier";
import { ROOT_NAME } from '../consts';


/*
    * @param {string} source - The LaTeX source code to be formatted.
    * @param {object} options - The options for Prettier. 
    *       printWidth (word) denote the number of space per line.
    *       useTabs (boolean) denote whether to use tabs or spaces .
    * @returns {Promise<string>} - The formatted LaTeX source code.
*/
// https://github.com/siefkenj/latex-parser-playground/blob/master/src/async-worker/parsing-worker.ts#L35-L43
async function format(source = "", options: vscode.FormattingOptions ) {
    return Prettier.format(source, {
        tabWidth: options.tabSize,
        useTabs: !options?.insertSpaces,
        parser: "latex-parser",
        plugins: [prettierPluginLatex],
    });
}

export class TexDocFormatter implements vscode.DocumentFormattingEditProvider {
    provideDocumentFormattingEdits(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TextEdit[]> {
        // Get the entire document text
        const text = document.getText();

        // Format the LaTeX code here
        return format(text, options).then(formattedText => {
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
        return format(text, options).then(formattedText => {

        // Create a TextEdit to replace the selected text with the formatted text
        const edit = new vscode.TextEdit(range, formattedText);
        // Return the TextEdit as an array
        return [edit];
        });
    }

    get triggers(){
        const latexSelector = ['latex', 'latex-expl3', 'pweave', 'jlweave', 'rsweave'].map( (id) => {
            return {scheme: ROOT_NAME, language: id };
         });
        return[
            vscode.languages.registerDocumentFormattingEditProvider(latexSelector, this),
            vscode.languages.registerDocumentRangeFormattingEditProvider(latexSelector, this),
        ];
    }
}

