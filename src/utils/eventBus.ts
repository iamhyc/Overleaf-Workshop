import * as vscode from 'vscode';
import {EventEmitter} from 'events';

export type Events = {
    'fileWillOpenEvent': {uri: vscode.Uri},
    'spellCheckLanguageUpdateEvent': {language:string},
};

export class EventBus {
    private static _eventEmitter = new EventEmitter();

    static fire<T extends keyof Events>(eventName: T, arg: Events[T]): void {
        EventBus._eventEmitter.emit(eventName, arg);
    }

    static on<T extends keyof Events>(eventName: T, cb: (arg: Events[T]) => void): vscode.Disposable {
        EventBus._eventEmitter.on(eventName, cb);
        const disposable = {
            dispose: () => { EventBus._eventEmitter.removeListener(eventName, cb); }
        };
        return disposable;
    }
}
