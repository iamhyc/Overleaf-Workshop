/* eslint-disable @typescript-eslint/naming-convention */
import { vscode } from "./vscode";

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
}

function _formatMessage() {

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
