import * as vscode from 'vscode';
import { ROOT_NAME } from '../consts';
import { RemoteFileSystemProvider } from '../core/remoteFileSystemProvider';

export function fuzzyFilter<T extends object>(list: T[], target: string, keys?: (keyof T)[]) {
    const fuzzysearch = require('fuzzysearch');
    // if list is string[]
    if (typeof list[0] === 'string') {
        return list.filter(item => fuzzysearch(target, item));
    } else {
        const _keys = keys ?? Object.keys(list[0]) as (keyof T)[];
        return list.filter(item => _keys.some(key => fuzzysearch(target, item[key])));
    }
}

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
