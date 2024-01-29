import * as vscode from 'vscode';
import { ROOT_NAME } from '../consts';
import { RemoteFileSystemProvider } from '../core/remoteFileSystemProvider';

export abstract class IntellisenseProvider {
    protected selector = {scheme:ROOT_NAME};
    protected abstract readonly contextPrefix: string[][];

    constructor(protected readonly vfsm: RemoteFileSystemProvider) {}
    abstract get triggers(): vscode.Disposable[];

    protected get contextRegex() {
        const prefix = this.contextPrefix
                        .map(group => `\\\\(${group.join('|')})`)
                        .join('|');
        const postfix = String.raw`(\[[^\]]*\])*\{([^\}\$]*)\}?`;
        return new RegExp(`(?:${prefix})` + postfix);
    }
}

export { LangIntellisenseProvider } from './langIntellisenseProvider';
