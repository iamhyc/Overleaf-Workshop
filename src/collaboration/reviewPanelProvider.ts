import * as vscode from 'vscode';
import { VirtualFileSystem } from '../core/remoteFileSystemProvider';
import { SocketIOAPI } from '../api/socketio';
import { CommentThreadSchema, DocumentRangesSchema } from '../api/extendedBase';

type ReviewDecorationTypes = 'openComment' | 'resolvedComment' | 'insertChange' | 'deleteChange';

const reviewDecorationOptions: {[type in ReviewDecorationTypes]: vscode.DecorationRenderOptions} = {
    openComment: {
        // backgroundColor: 'rgba(243, 177, 17, 0.3)',
        backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
        light: {gutterIconPath: 'resources/icons/light/gutter-comment-unresolved.svg'},
        dark: {gutterIconPath: 'resources/icons/dark/gutter-comment-unresolved.svg'},
    },
    resolvedComment: {
        backgroundColor: new vscode.ThemeColor('editor.hoverHighlightBackground'),
        light: {gutterIconPath: 'resources/icons/light/gutter-pass.svg'},
        dark: {gutterIconPath: 'resources/icons/dark/gutter-pass.svg'},
    },
    insertChange: {
        // color: 'rgba(44, 142, 48, 0.3)',
        backgroundColor: new vscode.ThemeColor('diffEditor.insertedTextBackground'),
        light: {gutterIconPath: 'resources/icons/light/gutter-edit.svg'},
        dark: {gutterIconPath: 'resources/icons/dark/gutter-edit.svg'},
    },
    deleteChange: {
        // color: 'rgba(197, 6, 11, 1.0)',
        backgroundColor: new vscode.ThemeColor('diffEditor.removedTextBackground'),
        light: {gutterIconPath: 'resources/icons/gutter-edit.svg'},
        dark: {gutterIconPath: 'resources/icons/gutter-edit.svg'},
    },
};

function offsetToRange(document: vscode.TextDocument, offset:number, quotedText: string): vscode.Range {
    return new vscode.Range(
        document.positionAt(offset),
        document.positionAt(offset + quotedText.length),
    );
}

function genThreadMarkdownString(userId:string, threadId:string, thread: CommentThreadSchema): vscode.MarkdownString {
    const text = new vscode.MarkdownString();
    text.isTrusted = true;
    text.supportHtml = true;
    text.supportThemeIcons = true;
    // append thread message
    for (const message of thread.messages) {
        const username = `${message.user.first_name} ${message.user.last_name||''}`;
        const date = new Date(message.timestamp).toLocaleString(undefined, {dateStyle:'medium',timeStyle:'medium'});
        text.appendMarkdown(`**[${username}]()**: ${message.content}\n\n`);
        //
        const editCommandUri = vscode.Uri.parse(`command:reviewPanel.editCommentMessage?${encodeURIComponent(JSON.stringify([ {threadId:threadId,messageId:message.id} ]))}`);
        const deleteCommandUri = vscode.Uri.parse(`command:reviewPanel.deleteCommentMessage?${encodeURIComponent(JSON.stringify([ {threadId:threadId,messageId:message.id} ]))}`);
        if (thread.resolved || message.user_id !== userId) {
            text.appendMarkdown(`<h5>${date}</h5>\n\n`);
        } else if (thread.messages.length === 1) {
            text.appendMarkdown(`<h5>${date} • <a href="${editCommandUri}">Edit</a></h5>\n\n`);
        } else if (thread.messages.length > 1) {
            text.appendMarkdown(`<h5>${date} • <a href="${editCommandUri}">Edit</a> • <a href="${deleteCommandUri}">Delete</a></h5>\n\n`);
        }
        text.appendMarkdown(`----\n\n`);
    }
    // append possible resolved message
    if (thread.resolved) {
        const username = `${thread.resolved_by_user?.first_name} ${thread.resolved_by_user?.last_name||''}`;
        const date = new Date(thread.resolved_at!).toLocaleString(undefined, {dateStyle:'medium',timeStyle:'medium'});
        text.appendMarkdown(`**[${username}]()**: \`${vscode.l10n.t('Mark as resolved')}\`.\n\n`);
        text.appendMarkdown(`<h5>${date}</h5>\n\n`);
        text.appendMarkdown(`<hr/>\n\n`);
    }
    // append action buttons
    if (thread.resolved) {
        const reopenCommandUri = vscode.Uri.parse(`command:reviewPanel.reopenComment?${encodeURIComponent(JSON.stringify([ {threadId} ]))}`);
        const deleteCommandUri = vscode.Uri.parse(`command:reviewPanel.deleteComment?${encodeURIComponent(JSON.stringify([ {docId:thread.doc_id,threadId} ]))}`);
        text.appendMarkdown(`<table width="100%"><tr align="center">
                <td><a href="${reopenCommandUri}"><strong>Reopen</strong></a></td>
                <td><a href="${deleteCommandUri}"><strong>Delete</strong></a></td>
            </tr></table>\n\n`);
    } else {
        const resolveCommandUri = vscode.Uri.parse(`command:reviewPanel.resolveComment?${encodeURIComponent(JSON.stringify([ {threadId} ]))}`);
        const replyCommandUri = vscode.Uri.parse(`command:reviewPanel.replyComment?${encodeURIComponent(JSON.stringify([ {threadId} ]))}`);
        text.appendMarkdown(`<table width="100%"><tr align="center">
            <td><a href="${resolveCommandUri}"><strong>Resolve</strong></a></td>
            <td><a href="${replyCommandUri}"><strong>Reply</strong></a></td>
        </tr></table>\n\n`);
    }
    text.appendMarkdown(`<hr/><hr/><hr/>\n\n`);  
    return text;
}

export class ReviewPanelProvider {
    private reviewDecorationTypes: {[type in ReviewDecorationTypes]: vscode.TextEditorDecorationType};
    private reviewRecords: {[docId:string]: DocumentRangesSchema} = {};
    private reviewThreads: {[threadId:string]: CommentThreadSchema} = {};

    constructor(
        private readonly vfs: VirtualFileSystem,
        readonly context: vscode.ExtensionContext,
        private readonly socket: SocketIOAPI,
    ) {
        // create decoration types
        this.reviewDecorationTypes = {
            openComment: vscode.window.createTextEditorDecorationType({
                ...reviewDecorationOptions.openComment,
                light: {gutterIconPath: context.asAbsolutePath(reviewDecorationOptions.openComment.light!.gutterIconPath as string)},
                dark: {gutterIconPath: context.asAbsolutePath(reviewDecorationOptions.openComment.dark!.gutterIconPath as string)},
            }),
            resolvedComment: vscode.window.createTextEditorDecorationType({
                ...reviewDecorationOptions.resolvedComment,
                light: {gutterIconPath: context.asAbsolutePath(reviewDecorationOptions.resolvedComment.light!.gutterIconPath as string)},
                dark: {gutterIconPath: context.asAbsolutePath(reviewDecorationOptions.resolvedComment.dark!.gutterIconPath as string)},
            }),
            insertChange: vscode.window.createTextEditorDecorationType({
                ...reviewDecorationOptions.insertChange,
                light: {gutterIconPath: context.asAbsolutePath(reviewDecorationOptions.insertChange.light!.gutterIconPath as string)},
                dark: {gutterIconPath: context.asAbsolutePath(reviewDecorationOptions.insertChange.dark!.gutterIconPath as string)},
            }),
            deleteChange: vscode.window.createTextEditorDecorationType({
                ...reviewDecorationOptions.deleteChange,
                light: {gutterIconPath: context.asAbsolutePath(reviewDecorationOptions.deleteChange.light!.gutterIconPath as string)},
                dark: {gutterIconPath: context.asAbsolutePath(reviewDecorationOptions.deleteChange.dark!.gutterIconPath as string)},
            }),
        };
        // init review records
        this.vfs.getAllDocumentReviews().then((records) => {
            const {ranges,threads} = records!;
            this.reviewRecords = ranges;
            this.reviewThreads = threads;
            this.refreshReviewDecorations();
            this.registerEventHandlers();
        });
    }

    private registerEventHandlers() {
        this.socket.updateEventHandlers({
            onCommentThreadResolved: (threadId, userInfo) => {
                const thread = this.reviewThreads[threadId];
                if (thread) {
                    thread.resolved = true;
                    thread.resolved_by_user = userInfo;
                    thread.resolved_at = new Date().toISOString();
                    this.refreshReviewDecorations(thread.doc_id);
                }
            },
            onCommentThreadReopen: (threadId) => {
                const thread = this.reviewThreads[threadId];
                if (thread) {
                    thread.resolved = false;
                    thread.resolved_by_user = undefined;
                    thread.resolved_at = undefined;
                    this.refreshReviewDecorations(thread.doc_id);
                }
            },
            onCommentThreadDeleted: (threadId) => {
                const thread = this.reviewThreads[threadId];
                if (thread) {
                    delete this.reviewThreads[threadId];
                    this.refreshReviewDecorations(thread.doc_id);
                }
            },
            onCommentThreadMessageCreated: (threadId, message) => {
                const thread = this.reviewThreads[threadId];
                if (thread) {
                    // case 1: `otUpdateApplied` arrives first
                    thread.messages.push(message);
                    this.refreshReviewDecorations(thread.doc_id);
                } else {
                    // case 2: `new-comment` arrives first
                    this.reviewThreads[threadId] = {
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        doc_id: undefined, // fill in later
                        messages: [message],
                    };
                }
            },
            onCommentThreadMessageDeleted: (threadId, messageId) => {
                const thread = this.reviewThreads[threadId];
                if (thread) {
                    const index = thread.messages.findIndex((m) => m.id === messageId);
                    if (index !== -1) {
                        thread.messages.splice(index, 1);
                        this.refreshReviewDecorations(thread.doc_id);
                    }
                }
            },
            onCommentThreadMessageEdited: (threadId, messageId, message) => {
                const thread = this.reviewThreads[threadId];
                if (thread) {
                    const index = thread.messages.findIndex((m) => m.id === messageId);
                    if (index !== -1) {
                        thread.messages[index].content = message;
                        this.refreshReviewDecorations(thread.doc_id);
                    }
                }
            },
            //
            onFileChanged: (update) => {
                if (update.op===undefined) { return; }
                // update review records' comments
                if (update.op[0].t !== undefined && update.op[0].c !== undefined) {
                    const docId = update.doc;
                    const {p,c,t} = update.op[0];
                    const userId = update.meta?.user_id || '';
                    // create new comment thread if not exists
                    if (this.reviewRecords[docId] === undefined) {
                        this.reviewRecords[docId] = {comments: [], changes: []};
                    }
                    let comments = this.reviewRecords[docId]?.comments;
                    if (comments === undefined) {
                        comments = [];
                        this.reviewRecords[docId].comments = comments;
                    }
                    // update review records' comments
                    comments.push({
                        id: t,
                        op: {p,c,t},
                        metadata: {
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            user_id: userId, ts: new Date().toISOString(),
                        }
                    });
                    // update review threads with `doc_id`
                    const thread = this.reviewThreads[t];
                    if (thread) {
                        // case 2: `new-comment` arrives first
                        if (thread.doc_id === undefined) {
                            thread.doc_id = docId;
                            this.refreshReviewDecorations(docId);
                        }
                    } else {
                        // case 1: `otUpdateApplied` arrives first
                        this.reviewThreads[t] = {
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            doc_id: docId,
                            messages: [],
                        };
                    }
                }
                // update review records' changes
                if (update?.meta?.tc !== undefined) {
                    const docId = update.doc;
                    const userId = update.meta?.user_id || '';
                    // create new changes array if not exists
                    if (this.reviewRecords[docId] === undefined) {
                        this.reviewRecords[docId] = {comments: [], changes: []};
                    }
                    let changes = this.reviewRecords[docId]?.changes;
                    if (changes === undefined) {
                        changes = [];
                        this.reviewRecords[docId].changes = changes;
                    }
                    // update review records' changes
                    for (const op of update.op) {
                        changes.push({
                            id: update.meta.tc,
                            op,
                            metadata: {
                                // eslint-disable-next-line @typescript-eslint/naming-convention
                                user_id: userId, ts: new Date().toISOString(),
                            }
                        });
                    }
                    // debounce refresh review decorations
                    setTimeout(() => {
                        this.refreshReviewDecorations(docId);
                    }, 100);
                }
            },
        });
    }

    private async refreshReviewDecorations(docId?: string) {
        let editors:[vscode.TextEditor, string][] = [];
        for (const editor of vscode.window.visibleTextEditors) {
            const {fileType, fileId} = await this.vfs._resolveUri(editor.document.uri)!;
            if (fileType === 'doc' && (docId === undefined || fileId === docId)) {
                editors.push([editor, fileId!]);
            }
        }

        for (const [editor,docId] of editors) {
            // clear previous decorations
            Object.values(this.reviewDecorationTypes).forEach((decoration) => {
                editor.setDecorations(decoration, []);
            });
            // create new decorations for comments
            const openRanges = [], resolvedRanges = [];
            for (const comment of this.reviewRecords[docId]?.comments || []) {
                const thread = comment.thread!;
                const range = offsetToRange(editor.document, comment.op.p, comment.op.c);
                const hoverMessage = genThreadMarkdownString(this.vfs._userId, comment.op.t, thread);
                if (thread.resolved) {
                    resolvedRanges.push({range, hoverMessage});
                } else {
                    openRanges.push({range, hoverMessage});
                }
            }
            editor.setDecorations(this.reviewDecorationTypes.openComment, openRanges);
            editor.setDecorations(this.reviewDecorationTypes.resolvedComment, resolvedRanges);
            // create new decorations for changes
            const insertRanges = [], deleteRanges = [];
        }
    }

    get triggers() {
        return [
            // register commands
            vscode.commands.registerCommand('reviewPanel.resolveComment', async (args: {threadId:string}) => {
                await this.vfs.resolveCommentThread(args.threadId);
            }),
            vscode.commands.registerCommand('reviewPanel.reopenComment', async (args: {threadId:string}) => {
                await this.vfs.reopenResolvedCommentThread(args.threadId);

            }),
            vscode.commands.registerCommand('reviewPanel.deleteComment', async (args: {docId:string,threadId:string}) => {
                await this.vfs.deleteResolvedCommentThread(args.docId, args.threadId);
            }),
            //
            vscode.commands.registerCommand('reviewPanel.replyComment', async (args: {threadId:string}) => {
                vscode.window.showInputBox({
                    title: vscode.l10n.t('Reply to comment'),
                    prompt: `${this.reviewThreads[args.threadId].messages.at(-1)?.content}`,
                }).then(async (content) => {
                    if (content) {
                        await this.vfs.postCommentThreadMessage(args.threadId, content);
                    }
                });
            }),
            vscode.commands.registerCommand('reviewPanel.editCommentMessage', async (args: {threadId:string,messageId:string}) => {
                const originMessage = this.reviewThreads[args.threadId].messages.find((m) => m.id === args.messageId)?.content;
                vscode.window.showInputBox({
                    title: vscode.l10n.t('Edit your comment'),
                    value: originMessage,
                }).then(async (content) => {
                    if (content && content !== originMessage) {
                        await this.vfs.editCommentThreadMessage(args.threadId, args.messageId, content);
                    }
                });
            }),
            vscode.commands.registerCommand('reviewPanel.deleteCommentMessage', async (args: {threadId:string,messageId:string}) => {
                const res = await vscode.window.showWarningMessage(vscode.l10n.t('Are you sure to delete this comment?'), vscode.l10n.t('Delete'), vscode.l10n.t('Cancel'));
                if (res === vscode.l10n.t('Delete')) {
                    await this.vfs.deleteCommentThreadMessage(args.threadId, args.messageId);
                }
            }),
        ];
    }
}
