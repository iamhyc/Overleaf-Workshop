// Reference: "https://github.com/overleaf/overleaf/blob/main/services/web/frontend/js/ide/log-parser/latex-log-parser.js"
// Constant for log parser
const LOG_WRAP_LIMIT = 79;
const LATEX_WARNING_REGEX = /^LaTeX(?:3| Font)? Warning: (.*)$/;
const HBOX_WARNING_REGEX = /^(Over|Under)full \\(v|h)box/;
const PACKAGE_WARNING_REGEX = /^((?:Package|Class|Module) \b.+\b Warning:.*)$/;
// This is used to parse the line number from common latex warnings
const LINES_REGEX = /lines? ([0-9]+)/;
// This is used to parse the package name from the package warnings
const PACKAGE_REGEX = /^(?:Package|Class|Module) (\b.+\b) Warning/;
const FILE_LINE_ERROR_REGEX = /^([./].*):(\d+): (.*)/;
const STATE = { 
    normal: 0,
    error: 1,
};



export type ErrorSchema = {
    line: number | null;
    file: string;
    level: string;
    message: string;
    content: string;
    raw: string;
};

export class LatexParser {
    
    private state: number;
    private data: ErrorSchema[];
    private fileStack: any[];
    private currentFileList: any[];
    private rootFileList: any[];
    private openParens: number;
    private log: LogText;
    private currentLine: string = '';
    private currentError!: ErrorSchema;
    private currentFilePath: string = '';
    constructor(text: string, options = {}) {
        this.state = STATE.normal;
        this.data = [];
        this.fileStack = [];
        this.currentFileList = this.rootFileList = [];
        this.openParens = 0;
        // TODO: Needed only for beta release; remove when over. 20220530
        this.log = new LogText(text);
    }

    parse() {
        while (true) {
            this.currentLine = this.log.nextLine();
            if (this.log.fileEnd === true) {
                break;
            }
            if (this.state === STATE.normal) {
                if (this.currentLineIsError()) {
                    this.state = STATE.error;
                    this.currentError = {
                        line: null,
                        file: this.currentFilePath,
                        level: 'error',
                        message: this.currentLine.slice(2),
                        content: '',
                        raw: this.currentLine + '\n',
                    };
                } else if (this.currentLineIsFileLineError()) {
                    this.state = STATE.error;
                    this.parseFileLineError();
                } else if (this.currentLineIsRunawayArgument()) {
                    this.parseRunawayArgumentError();
                } else if (this.currentLineIsWarning()) {
                    this.parseSingleWarningLine(LATEX_WARNING_REGEX);
                } else if (this.currentLineIsHboxWarning()) {
                    this.parseHboxLine();
                } else if (this.currentLineIsPackageWarning()) {
                    this.parseMultipleWarningLine();
                } else {
                    this.parseParensForFilenames();
                }
            }
            if (this.state === STATE.error) {
                this.currentError.content += this.log
                    .linesUpToNextMatchingLine(/^l\.[0-9]+/)
                    .join('\n');
                this.currentError.content += '\n';
                this.currentError.content += this.log
                    .linesUpToNextWhitespaceLine()
                    .join('\n');
                this.currentError.content += '\n';
                this.currentError.content += this.log
                    .linesUpToNextWhitespaceLine()
                    .join('\n');
                this.currentError.raw += this.currentError.content;
                const lineNo = this.currentError.raw.match(/l\.([0-9]+)/);
                if (lineNo && this.currentError.line === null) {
                    this.currentError.line = parseInt(lineNo[1], 10);
                }
                this.data.push(this.currentError);
                this.state = STATE.normal;
            }
        }
        return this.postProcess(this.data);
    }

    currentLineIsError() {
        return (
            this.currentLine[0] === '!' &&
            this.currentLine !==
            '!  ==> Fatal error occurred, no output PDF file produced!'
        );
    }

    currentLineIsFileLineError() {
        return FILE_LINE_ERROR_REGEX.test(this.currentLine);
    }

    currentLineIsRunawayArgument() {
        return this.currentLine.match(/^Runaway argument/);
    }

    currentLineIsWarning() {
        return !!this.currentLine.match(LATEX_WARNING_REGEX);
    }

    currentLineIsPackageWarning() {
        return !!this.currentLine.match(PACKAGE_WARNING_REGEX);
    }

    currentLineIsHboxWarning() {
        return !!this.currentLine.match(HBOX_WARNING_REGEX);
    }

    parseFileLineError() {
        const result = this.currentLine.match(FILE_LINE_ERROR_REGEX) || [];
        this.currentError = {
            line: Number(result[2]),
            file: result[1],
            level: 'error',
            message: result[3],
            content: '',
            raw: this.currentLine + '\n',
        };
    }

    parseRunawayArgumentError() {
        this.currentError = {
            line: null,
            file: this.currentFilePath,
            level: 'error',
            message: this.currentLine,
            content: '',
            raw: this.currentLine + '\n',
        };
        this.currentError.content += this.log
            .linesUpToNextWhitespaceLine()
            .join('\n');
        this.currentError.content += '\n';
        this.currentError.content += this.log
            .linesUpToNextWhitespaceLine()
            .join('\n');
        this.currentError.raw += this.currentError.content;
        const lineNo = this.currentError.raw.match(/l\.([0-9]+)/);
        if (lineNo) {
            this.currentError.line = parseInt(lineNo[1], 10);
        }
        return this.data.push(this.currentError);
    }

    parseSingleWarningLine(prefixRegex :RegExp) {
        const warningMatch = this.currentLine.match(prefixRegex);
        if (!warningMatch) {
            return;
        }
        const warning = warningMatch[1];
        const lineMatch = warning.match(LINES_REGEX);
        const line = lineMatch ? parseInt(lineMatch[1], 10) : null;
        this.data.push({
            line,
            file: this.currentFilePath,
            level: 'warning',
            message: warning,
            raw: warning,
            content: 'Warning' // add new content
        });
    }

    parseMultipleWarningLine() {
        // Some package warnings are multiple lines, let's parse the first line
        let warningMatch = this.currentLine.match(PACKAGE_WARNING_REGEX) || [];
        // Something strange happened, return early
        if (warningMatch.length === 0) {
            return;
        }
        const warningLines = [warningMatch[1]];
        let lineMatch = this.currentLine.match(LINES_REGEX);
        let line = lineMatch ? parseInt(lineMatch[1], 10) : null;
        const packageMatch = this.currentLine.match(PACKAGE_REGEX) || [];
        const packageName = packageMatch[1];
        // Regex to get rid of the unnecesary (packagename) prefix in most multi-line warnings
        const prefixRegex = new RegExp(
            '(?:\\(' + packageName + '\\))*[\\s]*(.*)',
            'i'
        );
        // After every warning message there's a blank line, let's use it
        while ((this.currentLine = this.log.nextLine())) {
            lineMatch = this.currentLine.match(LINES_REGEX);
            line = lineMatch ? parseInt(lineMatch[1], 10) : line;
            warningMatch = this.currentLine.match(prefixRegex) || [] ;
            warningLines.push(warningMatch[1]);
        }
        const rawMessage = warningLines.join(' ');
        this.data.push({
            line,
            file: this.currentFilePath,
            level: 'warning',
            message: rawMessage,
            raw: rawMessage,
            content: 'Warning' // add new content
        });
    }

    parseHboxLine() {
        const lineMatch = this.currentLine.match(LINES_REGEX);
        const line = lineMatch ? parseInt(lineMatch[1], 10) : null;
        this.data.push({
            line,
            file: this.currentFilePath,
            level: 'information',
            message: this.currentLine,
            raw: this.currentLine,
            content: 'Hbox Warning' // add new content
        });
    }

    // Check if we're entering or leaving a new file in this line

    parseParensForFilenames() {
        const pos = this.currentLine.search(/\(|\)/);
        if (pos !== -1) {
            const token = this.currentLine[pos];
            this.currentLine = this.currentLine.slice(pos + 1);
            if (token === '(') {
                const filePath = this.consumeFilePath();
                if (filePath) {
                    this.currentFilePath = filePath;
                    const newFile = {
                        path: filePath,
                        files: [],
                    };
                    this.fileStack.push(newFile);
                    this.currentFileList.push(newFile);
                    this.currentFileList = newFile.files;
                } else {
                    this.openParens++;
                }
            } else if (token === ')') {
                if (this.openParens > 0) {
                    this.openParens--;
                } else {
                    if (this.fileStack.length > 1) {
                        this.fileStack.pop();
                        const previousFile = this.fileStack[this.fileStack.length - 1];
                        this.currentFilePath = previousFile.path;
                        this.currentFileList = previousFile.files;
                    }
                }
            }
            // else {
            //		 Something has gone wrong but all we can do now is ignore it :(
            // }
            // Process the rest of the line
            this.parseParensForFilenames();
        }
    }

    consumeFilePath() {
        // Our heuristic for detecting file names are rather crude
        // A file may not contain a ')' in it
        // To be a file path it must have at least one /
        if (!this.currentLine.match(/^\/?([^ )]+\/)+/)) {
            return false;
        }
        let endOfFilePath = this.currentLine.search(/ |\)/);

        // handle the case where there is a space in a filename
        while (endOfFilePath !== -1 && this.currentLine[endOfFilePath] === ' ') {
            const partialPath = this.currentLine.slice(0, endOfFilePath);
            // consider the file matching done if the space is preceded by a file extension (e.g. ".tex")
            if (/\.\w+$/.test(partialPath)) {
                break;
            }
            // advance to next space or ) or end of line
            const remainingPath = this.currentLine.slice(endOfFilePath + 1);
            // consider file matching done if current path is followed by any of "()[]
            if (/^\s*["()[\]]/.test(remainingPath)) {
                break;
            }
            const nextEndOfPath = remainingPath.search(/[ "()[\]]/);
            if (nextEndOfPath === -1) {
                endOfFilePath = -1;
            } else {
                endOfFilePath += nextEndOfPath + 1;
            }
        }
        let path;
        if (endOfFilePath === -1) {
            path = this.currentLine;
            this.currentLine = '';
        } else {
            path = this.currentLine.slice(0, endOfFilePath);
            this.currentLine = this.currentLine.slice(endOfFilePath);
        }
        return path;
    }

    postProcess(data: ErrorSchema[]) {
        const all:ErrorSchema[] = [];
        const hashes = new Set();

        const hashEntry = (entry:ErrorSchema) => entry.raw;
        const errorsByLevel:Record<string, ErrorSchema[]> = {
            error: [],
            warning: [],
            information: [],
        };
        if (data.length === 0 ) {return ;}
        data.forEach(item => {
            const hash = hashEntry(item);
            if (hashes.has(hash)) {
                return;
            }
            errorsByLevel[item.level]?.push(item);
            all.push(item);
            hashes.add(hash);
        });

        return {
            errors: errorsByLevel.error,
            warnings: errorsByLevel.warning,
            information: errorsByLevel.information,
            all,
            files: this.rootFileList,
        };
    }
}

class LogText {
    private text = '';
    private lines: string[] = [];
    private row = 0;
    public fileEnd = false;
    constructor(text: string) {
        this.text = text.replace(/(\r\n)|\r/g, '\n');
        // Join any lines which look like they have wrapped.
        const wrappedLines = this.text.split('\n');
        this.lines = [wrappedLines[0]];

        for (let i = 1; i < wrappedLines.length; i++) {
            // If the previous line is as long as the wrap limit then
            // append this line to it.
            // Some lines end with ... when LaTeX knows it's hit the limit
            // These shouldn't be wrapped.
            const prevLine = wrappedLines[i - 1];
            const currentLine = wrappedLines[i];

            if (prevLine.length === LOG_WRAP_LIMIT && prevLine.slice(-3) !== '...') {
                this.lines[this.lines.length - 1] += currentLine;
            } else {
                this.lines.push(currentLine);
            }
        }
        this.row = 0;
    }
    nextLine() {
        this.row++;
        if (this.row >= this.lines.length) {
            this.fileEnd = true;
            return '';
        } else {
            this.fileEnd = false;
            return this.lines[this.row];
        }
    }

    rewindLine() {
        this.row--;
    }

    linesUpToNextWhitespaceLine() {
        return this.linesUpToNextMatchingLine(/^ *$/);
    }

    linesUpToNextMatchingLine(match: RegExp) {
        const lines = [];

        while (true) {
            const nextLine = this.nextLine();

            if (this.fileEnd === true) {
                break;
            }

            lines.push(nextLine);

            if (nextLine.match(match)) {
                break;
            }
        }
        return lines;
    }
}