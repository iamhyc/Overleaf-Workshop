import * as vscode from 'vscode';
import fetch from 'node-fetch';

interface ResponseSchema {
    type: 'success' | 'error';
    message?: string;
    cookies?: {[key:string]:string};
}

export async function passportLogin(url:string, email:string, password:string, cookies?:any): Promise<ResponseSchema> {
    const res = await fetch(url+'/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:102.0) Gecko/20100101 Firefox/102.0',
            'Cookie': cookies
        },
        body: JSON.stringify({ email: email, password: password })
    });

    if (res.status===200) {
        res.headers.raw()['set-cookie'].map((cookie:string) => {
            const [key, value] = cookie.split(';')[0].split('=');
            cookies[key] = value;
        });
        return {
            type: 'success',
            cookies: cookies
        };
    } else {
        console.log(await res.text())
        return {
            type: 'error',
            message: (await res.json() as any).message
        };
    }
}
