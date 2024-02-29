import * as vscode from 'vscode';
import { DocumentEntity, VirtualFileSystem, generateTrackId } from '../core/remoteFileSystemProvider';
import { SocketIOAPI, UpdateSchema } from '../api/socketio';
import { CommentThreadSchema, DocumentRangesSchema, DocumentReviewChangeSchema } from '../api/extendedBase';
import { ROOT_NAME } from '../consts';

type ReviewDecorationType = 'openComment' | 'resolvedComment' | 'insertChange' | 'deleteChange';
type EditOp = {p:number, i?:string, d?:string, u?:boolean};
type EditRange = {start:number, end:number};
type EditChange = {id?:string, op:EditOp, rng:EditRange, offset:number};

const reviewDecorationOptions: {[type in ReviewDecorationType]: vscode.DecorationRenderOptions} = {
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
        light: {gutterIconPath: 'resources/icons/light/gutter-edit.svg'},
        dark: {gutterIconPath: 'resources/icons/dark/gutter-edit.svg'},
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

class EditManager {
    constructor(
        private readonly changes: DocumentReviewChangeSchema[],
        private readonly update: UpdateSchema,
        private readonly metadata: any,
    ) {}

    /**
     * Reference: https://github.com/overleaf/overleaf/tree/main/libraries/ranges-tracker
     * 
     * Insert Range Direction: (p)|------>|(end)
     * Delete Range Direction: (start)|<------|(p)
     */
    generateRefreshes() {
        let refreshes:{id:string, type?:ReviewDecorationType}[] = [];
        //
        for (const [offset,editOp] of this.update.op!.entries()) {
            const tcIndex = offset.toString().padStart(6,'0');
            const tcId = (this.update.meta?.tc) ? (this.update.meta.tc+tcIndex) : undefined;
            const edit: EditChange = {
                id: tcId,
                op: editOp,
                //NOTE: edit has no insert range
                rng: { start: editOp.p - (editOp.d?.length || 0), end: editOp.p },
                offset: 0,
            };
            // update existing changes and decorations
            for (let index=0; index<this.changes.length;) {
                const change = this.changes[index];
                const text: EditChange = {
                    id: change.id,
                    op: change.op,
                    //NOTE: text has no delete range
                    rng: { start: change.op.p, end: change.op.p + (change.op.i?.length || 0) },
                    offset: 0,
                };
                const {nextIndex, items} = (() => {
                    // Case 1: insert + insert
                    if      (text.op.i !== undefined && edit.op.i !== undefined) {
                        return this.applyInsertRangeWithInsertChange(index, text, edit);
                    }
                    // Case 2: insert + delete
                    else if (text.op.i !== undefined && edit.op.d !== undefined) {
                        return this.applyInsertRangeWithDeleteChange(index, text, edit);
                    }
                    // Case 3: delete + insert
                    else if (text.op.d !== undefined && edit.op.i !== undefined) {
                        return this.applyDeleteRangeWithInsertChange(index, text, edit);
                    }
                    // Case 4: delete + delete
                    else if (text.op.d !== undefined && edit.op.d !== undefined) {
                        return this.applyDeleteRangeWithDeleteChange(index, text, edit);
                    }
                })()!;
                // update `index` for next iteration
                index = nextIndex;
                refreshes.push( ...items );
                this.changes.sort((a,b) => a.op.p - b.op.p); // sort in ascending order
            }
            // if `edit.id` still exists, create new change
            if (edit.id) {
                this.changes.push({
                    id: edit.id,
                    op: edit.op,
                    metadata: this.metadata,
                });
                refreshes = [{id:edit.id, type:editOp.i ? 'insertChange' : 'deleteChange'}];
            }
        }
        return refreshes;
    }

    /**
     * Case 1: insert + insert
     *   ┌────────┐
     *   │ Insert │
     *   └────────┘
     * ▲     ▲
     * │     │
     * (1a)  (1b,1c)
     */
    applyInsertRangeWithInsertChange(index:number, text: EditChange, edit: EditChange) {
        let items:{id:string, type?:ReviewDecorationType}[] = [];
        const editOffset = edit.rng.start - text.rng.start;
        // Case 1a: insert position `<start` w/ `tc` OR `<=start` w/o `tc` --> [update position only]
        if ((edit.id && edit.rng.end<text.rng.start) || (edit.id===undefined && edit.rng.end<=text.rng.start)) {
            text.op.p += edit.op.i!.length;
            items.push({id:text.id!, type:'insertChange'});
        }
        // Case 1b: insert within [start,end] with `tc` --> [update change]
        else if (text.rng.start<=edit.rng.start && edit.rng.start<=text.rng.end && edit.id) {
            text.op.i = text.op.i!.slice(0, editOffset) + edit.op.i + text.op.i!.slice(editOffset);
            edit.id = undefined; // consume `edit.id`
            items.push({id:text.id!, type:'insertChange'});
        }
        // Case 1c: insert within (start,end) without `tc` --> [clip change and create new change]
        else if (text.rng.start<edit.rng.start && edit.rng.start<text.rng.end && edit.id===undefined) {
            const [beforeText, afterText] = [text.op.i!.slice(0, editOffset), text.op.i!.slice(editOffset)];
            // clip the original change
            text.op.i = beforeText;
            text.rng.end = text.rng.start + beforeText.length;
            items.push({id:text.id!, type:'insertChange'});
            // create new change
            const newId = generateTrackId();
            this.changes.push({
                id: newId,
                op: { p: text.rng.end + edit.op.i!.length, i: afterText },
                metadata: this.metadata,
            });
            items.push({id:newId, type:'insertChange'});
        }
        return {nextIndex:index+1, items};
    }

    /**
     * Case 2: insert + delete
     *      ┌────────┐  ┌────────┐
     *      │ Insert │  │ Insert │
     *      └────────┘  └────────┘
     * ┌────┐
     * │(2a)│
     * └────┘
     * ┌────────────────────┐
     * │(2b)                │
     * └────────────────────┘
     */
    applyInsertRangeWithDeleteChange(index:number, text: EditChange, edit: EditChange) {
        let items:{id:string, type?:ReviewDecorationType}[] = [];
        const nextChange = this.changes.at(index+1);
        // Case 2a: delete.end <= insert.start --> [update position only]
        if (edit.rng.end<=text.rng.start) {
            text.op.p -= edit.offset;
            items.push({id:text.id!, type:'insertChange'});
        }
        // Case 2b: edit.rng collides with text.rng --> [update/remove/merge range]
        else if (text.rng.start<edit.rng.end) {
            const beforeRange = edit.rng.start<text.rng.start? {start:edit.rng.start,end:text.rng.start} : undefined;
            const afterRange = edit.rng.end>text.rng.end? {start:text.rng.end,end:edit.rng.end} : undefined;
            const middleRange = {start:Math.max(edit.rng.start,text.rng.start),end:Math.min(edit.rng.end,text.rng.end)};
            let middleDeleted = false;
            // remove change if middleRange===text.rng, else update change
            if (middleRange.start===text.rng.start && middleRange.end===text.rng.end) {
                this.changes.splice(index, 1);
                index -= 1;
                middleDeleted = true;
                items.push({id:text.id!});
            } else {
                text.op.p -= beforeRange? (beforeRange.end-beforeRange.start) : 0;
                text.op.i = text.op.i!.slice(0, middleRange.start-text.rng.start) + text.op.i!.slice(middleRange.end-text.rng.start);
                text.rng = {start: text.op.p, end: text.op.p + text.op.i!.length};
                items.push({id:text.id!, type:'insertChange'});
            }
            // create new change for `beforeRange`
            if (beforeRange && edit.id) {
                this.changes.push({
                    id: edit.id,
                    op: { p: beforeRange.start, d: edit.op.d!.slice(0, beforeRange.end-beforeRange.start) },
                    metadata: this.metadata,
                });
                items.push({id:edit.id, type:'deleteChange'});
            }
            // merge with next insert change if `afterRange` collides with it
            if (afterRange && nextChange && nextChange.op.i) {
                const nextText = { id: nextChange.id, op: nextChange.op, rng: { start: nextChange.op.p, end: nextChange.op.p + nextChange.op.i.length } };
                if (nextText.rng.start<=afterRange.start && !middleDeleted) {
                    text.op.i += nextText.op.i!;
                    text.rng.end += nextText.op.i!.length;
                    this.changes.splice(index+1, 1);
                    items.push({id:nextText.id!});
                    index -= 1;
                }
            }
            // obtain the remaining edit for next iteration, else consume `edit.id`
            if (afterRange) {
                edit.offset = edit.offset || (edit.rng.end-edit.rng.start);
                edit.rng = afterRange;
                edit.op.p = text.rng.end;
                edit.op.d = edit.op.d!.slice(afterRange.start-edit.rng.start);
            } else {
                edit.id = undefined;
            }
        }
        return {nextIndex:index+1, items};
    }

    /**
     * Case 3: delete + insert
     *    Delete
     *       │
     *   ▲   ▲
     *   │   │
     * (3a) (3b)
     */
    applyDeleteRangeWithInsertChange(index:number, text: EditChange, edit: EditChange) {
        let items:{id:string, type?:ReviewDecorationType}[] = [];
        // Case 3a: insert before delete position --> [update position only]
        if (edit.rng.start<text.rng.start) {
            text.op.p += edit.op.i!.length;
            items.push({id:text.id!, type:'deleteChange'});
        }
        // Case 3b: text.op.d===edit.op.i with `edit.op.u` --> [remove range]
        else if (text.rng.start===edit.rng.start && text.op.d===edit.op.i && edit.op.u) {
            this.changes.splice(index, 1);
            index -= 1;
            items.push({id:text.id!});
        }
        return {nextIndex:index+1, items};
    }

    /**
     * Case 4: delete + delete
     *     Delete  Delete
     *        │       |
     * ┌────┐
     * │(4a)│
     * └────┘
     *     ┌──────────┐
     *     │   (4b)   │
     *     └──────────┘
     */
    applyDeleteRangeWithDeleteChange(index:number, text: EditChange, edit: EditChange) {
        let items:{id:string, type?:ReviewDecorationType}[] = [];
        // Case 4a: editRng.end at delete position with `tc` --> [update range]
        if (edit.rng.end===text.rng.start && edit.id) {

        }
        // Case 4b: textRng within editRng --> [remove range]
        else if (edit.rng.start<=text.rng.start && edit.rng.end>=text.rng.end) {

        }
        // Case 4c:
        else if (text.rng.start<edit.rng.end) {

        }
        return {nextIndex:index+1, items};
    }
}

export class ReviewPanelProvider implements vscode.CodeLensProvider {
    private readonly reviewDecorations: {[id:string]: vscode.TextEditorDecorationType} = {};
    private reviewRecords: {[docId:string]: DocumentRangesSchema} = {};
    private reviewThreads: {[threadId:string]: CommentThreadSchema} = {};

    constructor(
        private readonly vfs: VirtualFileSystem,
        readonly context: vscode.ExtensionContext,
        private readonly socket: SocketIOAPI,
    ) {
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
                    this.setReviewDecorations(undefined, thread.doc_id!, [{id:threadId, type:'resolvedComment'}]);
                }
            },
            onCommentThreadReopen: (threadId) => {
                const thread = this.reviewThreads[threadId];
                if (thread) {
                    thread.resolved = false;
                    thread.resolved_by_user = undefined;
                    thread.resolved_at = undefined;
                    this.setReviewDecorations(undefined, thread.doc_id!, [{id:threadId, type:'openComment'}]);
                }
            },
            onCommentThreadDeleted: (threadId) => {
                const thread = this.reviewThreads[threadId];
                if (thread) {
                    delete this.reviewThreads[threadId];
                    this.setReviewDecorations(undefined, thread.doc_id!, [{id:threadId}]);
                }
            },
            onCommentThreadMessageCreated: (threadId, message) => {
                const thread = this.reviewThreads[threadId];
                if (thread) {
                    // case 1: `otUpdateApplied` arrives first
                    thread.messages.push(message);
                    this.setReviewDecorations(undefined, thread.doc_id!, [{id:threadId, type:'openComment'}]);
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
                        this.setReviewDecorations(undefined, thread.doc_id!, [{id:threadId, type:'openComment'}]);
                    }
                }
            },
            onCommentThreadMessageEdited: (threadId, messageId, message) => {
                const thread = this.reviewThreads[threadId];
                if (thread) {
                    const index = thread.messages.findIndex((m) => m.id === messageId);
                    if (index !== -1) {
                        thread.messages[index].content = message;
                        this.setReviewDecorations(undefined, thread.doc_id!, [{id:threadId, type:'openComment'}]);
                    }
                }
            },
            onAcceptTrackChanges: (docId, tcIds) => {
                if (this.reviewRecords[docId].changes) {
                    this.reviewRecords[docId].changes = this.reviewRecords[docId].changes!.filter((c) => !tcIds.includes(c.id));
                    this.setReviewDecorations(undefined, docId, tcIds.map(id => {return {id};}));
                }
            },
            //
            onFileChanged: (update) => {
                if (update.op===undefined) { return; }
                const ts = new Date(update.meta?.ts || new Date()).toISOString();
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
                            user_id: userId, ts,
                        }
                    });
                    // update review threads with `doc_id`
                    const thread = this.reviewThreads[t];
                    if (thread) {
                        // case 2: `new-comment` arrives first
                        if (thread.doc_id === undefined) {
                            thread.doc_id = docId;
                            this.setReviewDecorations(undefined, docId, [{id:t, type:'openComment'}]);
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
                else {
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
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    const metadata = { user_id: userId, ts };
                    const refreshes = new EditManager(changes, update, metadata).generateRefreshes();
                    // debounce refresh review decorations
                    setTimeout(() => {
                        this.setReviewDecorations(undefined, docId, refreshes);
                    }, 100);
                }
            },
        });
    }

    private setTextEditorDecoration(type: ReviewDecorationType, editor: vscode.TextEditor, range: vscode.DecorationOptions, contentText?: string): vscode.TextEditorDecorationType {
        const decorationOption = {
            ...reviewDecorationOptions[type],
            light: {gutterIconPath: this.context.asAbsolutePath(reviewDecorationOptions[type].light!.gutterIconPath as string)},
            dark: {gutterIconPath: this.context.asAbsolutePath(reviewDecorationOptions[type].dark!.gutterIconPath as string)},
        };

        // set `after` attachment
        let after;
        switch (type) {
            case 'openComment':
            case 'resolvedComment':
            case 'insertChange':
                break;
            case 'deleteChange':
                after = {
                    contentText: contentText,
                    textDecoration: 'line-through',
                    margin: '0 0 0 1em',
                    color: new vscode.ThemeColor('diffEditor.removedTextBackground'),
                };
                break;
        }

        const decoration = vscode.window.createTextEditorDecorationType({
            ...decorationOption,
            after,
        });
        editor.setDecorations(decoration, [range]);
        return decoration;
    }

    private async setReviewDecorations(editor: vscode.TextEditor | undefined, docId: string, updates: {id: string, type?: ReviewDecorationType}[]) {
        // find associated editor
        if (!editor) {
            editor = vscode.window.visibleTextEditors.filter(async editor => {
                const {fileType, fileId} = await this.vfs._resolveUri(editor.document.uri)!;
                return fileType === 'doc' && fileId === docId;
            }).pop()!;
        }
        if (editor.document.isDirty) { return; } // skip dirty document

        // add new decoration
        for (const update of updates) {
            // remove obsolete decoration
            const obsoleteDecoration = this.reviewDecorations[update.id];
            if (obsoleteDecoration) {
                obsoleteDecoration.dispose();
                delete this.reviewDecorations[update.id];
            }
            // add new decoration
            switch (update.type) {
                case 'openComment':
                case 'resolvedComment':
                    const comment = this.reviewRecords[docId]?.comments?.find((c) => c.id === update.id);
                    if (comment) {
                        const thread = comment.thread!;
                        const range = offsetToRange(editor.document, comment.op.p, comment.op.c);
                        const hoverMessage = genThreadMarkdownString(this.vfs._userId, comment.op.t, thread);
                        const newCommentDecoration = this.setTextEditorDecoration(update.type, editor, {range,hoverMessage});
                        this.reviewDecorations[update.id] = newCommentDecoration;
                    }
                    break;
                case 'insertChange':
                case 'deleteChange':
                    const change = this.reviewRecords[docId]?.changes?.find((c) => c.id === update.id);
                    if (change) {
                        const range = offsetToRange(editor.document, change.op.p, change.op.i || change.op.d!);
                        const newChangeDecoration = this.setTextEditorDecoration(update.type, editor, {range}, change.op.d);
                        this.reviewDecorations[update.id] = newChangeDecoration;
                        //TODO: provide action via code lens for `range`
                    }
                    break;
                default:
                    break;
            }
        }
    }

    private async refreshReviewDecorations() {
        const editor = vscode.window.activeTextEditor!;
        const {fileType, fileId} = await this.vfs._resolveUri(editor.document.uri)!;
        if (fileType !== 'doc' || fileId === undefined) { return; }

        // create new decorations for comments
        for (const comment of this.reviewRecords[fileId]?.comments || []) {
            const thread = comment.thread!;
            if (thread.resolved) {
                this.setReviewDecorations(editor, fileId, [{id:comment.op.t, type:'resolvedComment'}]);
            } else {
                this.setReviewDecorations(editor, fileId, [{id:comment.op.t, type:'openComment'}]);
            }
        }

        // create new decorations for changes
        for (const change of this.reviewRecords[fileId]?.changes || []) {
            const type = change.op.i ? 'insertChange' : 'deleteChange';
            this.setReviewDecorations(editor, fileId, [{id:change.id, type}]);
        }
    }

    provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens[]> {
        return [];
    }

    get triggers() {
        return [
            // register exposed commands
            vscode.commands.registerCommand(`${ROOT_NAME}.collaboration.addComment`, async () => {
                const activeTextEditor = vscode.window.activeTextEditor!;
                const doc = (await this.vfs._resolveUri(activeTextEditor.document.uri)).fileEntity as DocumentEntity;
                const quotedRange = activeTextEditor.selection;
                const quotedOffset = activeTextEditor.document.offsetAt(quotedRange.start);
                const quotedText = activeTextEditor.document.getText(quotedRange);
                let slideText = quotedText.replace(/\n/g, ' ').replace(/\s+/g, ' ');
                slideText = slideText.length<=30? slideText : slideText.replace(/^(.{15}).*(.{15})$/, '$1...$2');
                //
                vscode.window.showInputBox({
                    title: vscode.l10n.t('Reply to comment'),
                    prompt: `Quoted text: "${slideText}"`,
                    placeHolder: vscode.l10n.t('Add your comment here'),
                }).then(async (content) => {
                    if (content) {
                        await this.vfs.createCommentThread(doc._id, generateTrackId(), quotedOffset, quotedText, content);
                    }
                });
            }),
            vscode.commands.registerCommand(`${ROOT_NAME}.collaboration.toggleTrackChanges`, async () => {
                this.vfs.trackChangesState = !this.vfs.trackChangesState;
            }),
            // register internal commands
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
            // register event handlers
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                editor && this.refreshReviewDecorations();
            }),
            vscode.workspace.onDidSaveTextDocument((document) => {
                this.refreshReviewDecorations();
            }),
        ];
    }
}
