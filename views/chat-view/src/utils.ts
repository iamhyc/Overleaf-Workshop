/* eslint-disable @typescript-eslint/naming-convention */
import { vscode } from "./vscode";
import { type Ref } from "vue";

export interface Message {
    id: string,
    content: string,
    timestamp: number,
    user_id: string,
    user: {
        id: string,
        first_name: string,
        last_name?: string,
        email: string,
    },
    clientId: string,
    replyTo?: {messageId:string, username:string, userId:string},
    replies?: Message[],
}

export function elapsedTime(timestamp:number, now=Date.now()) {
    const msPerMinute = 60 * 1000;
    const msPerHour = msPerMinute * 60;
    const msPerDay = msPerHour * 24;
    const msPerMonth = msPerDay * 30;
    const msPerYear = msPerDay * 365;

    const elapsed = Math.max(now - timestamp, 0);

    if (elapsed < msPerMinute) {
        const elapsedSeconds = Math.round(elapsed/1000);
        return elapsedSeconds===0 ? 'now' : elapsedSeconds + 's';
    } else if (elapsed < msPerHour) {
        const elapsedMinutes = Math.round(elapsed/msPerMinute);
        return elapsedMinutes===1 ? '1 min' : elapsedMinutes + ' mins';
    } else if (elapsed < msPerDay ) {
        const elapsedHours = Math.round(elapsed/msPerHour );
        return elapsedHours===1 ? '1 hour' : elapsedHours + ' hours';
    } else if (elapsed < msPerMonth) {
        const elapsedDays = Math.round(elapsed/msPerDay);
        return elapsedDays===1 ? '1 day' : elapsedDays + ' days';
    } else if (elapsed < msPerYear) {
        const elapsedMonths = Math.round(elapsed/msPerMonth);
        return elapsedMonths===1 ? '1 month' : elapsedMonths + ' months';
    } else {
        const elapsedYears = Math.round(elapsed/msPerYear );
        return elapsedYears===1 ? '1 year' : elapsedYears + ' years';
    }
}

export function getMessages() {
    vscode.postMessage({
        type: 'get-messages',
    });
}

export function sendMessage(content: string, context?:string) {
    content = content.trim();
    if (context) {
        content = `${context}\n\n${content}`;
    }

    vscode.postMessage({
        type: 'send-message',
        content
    });
}

export function showLineRef(path:string, L1:number, C1:number, L2:number, C2:number) {
    vscode.postMessage({
        type: 'show-line-ref',
        content: {path, L1, C1, L2, C2},
    });
}

export function getReplyContext(message: Message) {
    const slidingTextLength = 20;
    const username = `${message.user.first_name} ${message.user.last_name||''}`;
    let slidingText = message.content.split('\n').join(' ').slice(0, slidingTextLength);
    slidingText += message.content.length>=slidingTextLength ? '...' : '';

    return [
        `> reply-to-${message.id} [@${username}](${message.user.id})`,
        `> ${slidingText}`
    ].join('\n');
}

export class MessageTree {
    private replyRegex = /^>\s*reply-to-(\w+)\s*\[@(.+)\]\((\w+)\)\s*$/;
    private rootMap: Record<string, string> = {};
    userId: string = '';

    constructor(private messages: Ref<Message[]>) {}

    update(messages: Message[]) {
        messages.forEach(message => {
            this.pushMessage(message);
        });
    }

    pushMessage(message: Message) {
        const _lines = message.content.trim().split('\n');
        const _firstLine = _lines[0];
        const match = _firstLine.match(this.replyRegex);

        if (match) {
            // update message
            const [_, messageId, username, userId] = match;
            message.content = _lines.slice(1).join('\n');
            message.replyTo = {messageId, username, userId};
            // insert into root's replies
            const rootId = this.rootMap[messageId];
            const rootMessage = this.messages.value.find(m => m.id===rootId);
            rootMessage?.replies && rootMessage.replies.push(message);
            // update rootMap
            this.rootMap[message.id] = rootId;
        } else {
            // update message
            message.replies = [];
            // insert as root
            this.messages.value.push(message);
            // update rootMap
            this.rootMap[message.id] = message.id;
        }
    }
}
