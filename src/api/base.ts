import * as vscode from 'vscode';
import fetch from 'node-fetch';

interface ResponseSchema {
    type: 'success' | 'error';
    message?: string;
    identity?: {
        csrfToken: string;
        sharelatex_sid: string;
    }
}

async function getCsrfToken(url:string): Promise<[string,string]> {
    const res = await fetch(url+'/login', {
        method: 'GET'
    });
    const body = await res.text();
    const match = body.match(/<input.*name="_csrf".*value="([\w\d-]*)">/);
    if (!match) {
        throw new Error('Failed to get CSRF token.');
    } else {
        const cookies = res.headers.raw()['set-cookie'];
        const sharelatex_sid = cookies.find((cookie:string) => cookie.startsWith('sharelatex.sid')) as string;
        return [ match[1],sharelatex_sid ];
    }
}

export async function passportLogin(url:string, email:string, password:string): Promise<ResponseSchema> {
    const [csrfToken,sharelatex_sid] = await getCsrfToken(url);
    const res = await fetch(url+'/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Cookie': sharelatex_sid,
            'X-Csrf-Token': csrfToken
        },
        body: JSON.stringify({ _csrf: csrfToken, email: email, password: password })
    });

    if (res.status===200) {
        return {
            type: 'success',
            identity: {
                csrfToken: csrfToken,
                sharelatex_sid: sharelatex_sid,
            }
        };
    } else if (res.status===401) {
        return {
            type: 'error',
            message: (await res.json() as any).message
        };
    } else {
        return {
            type: 'error',
            message: `${res.status}: `+await res.text()
        };
    }
}

export async function logout(url:string, identity:{[key:string]:string}): Promise<ResponseSchema> {
    const res = await fetch(url+'/logout', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': identity.sharelatex_sid,
        },
        body: JSON.stringify({ _csrf: identity.csrfToken })
    });

    if (res.status===200) {
        return {
            type: 'success'
        };
    } else {
        return {
            type: 'error',
            message: `${res.status}: `+await res.text()
        };
    }
}
