import { vscode } from "./vscode";

function _formatMessage() {

}

export function sendMessage(content: string) {
    vscode.postMessage({
        type: 'send-message',
        content
    });
}
