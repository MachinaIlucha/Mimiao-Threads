import { config } from '../config.js';
import { sql, one, rows } from '../db.js';
import { decrypt, encrypt } from '../security.js';
import { AppError } from '../errors.js';
import { requestJson } from './http.js';
export const mediaFields='id,text,media_type,permalink,timestamp,username,is_reply,has_replies';
export async function connection() { return one(sql`SELECT * FROM connections WHERE id=1`); }
export async function threads<T=any>(endpoint:string,params:Record<string,string>={},method='GET',tokenOverride?:string):Promise<T> {
 const c=tokenOverride?null:await connection();
 if(!tokenOverride&&!c)throw new AppError(409,'Подключите Threads в настройках','THREADS_DISCONNECTED');
 const token=tokenOverride||decrypt(c!.token);
 const url=new URL(`https://graph.threads.net/${config.apiVersion}/${endpoint.replace(/^\//,'')}`);
 const init:RequestInit={method,headers:{Authorization:`Bearer ${token}`}};
 if(method==='GET')Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v));
 else {init.body=new URLSearchParams(params);init.headers={...init.headers,'Content-Type':'application/x-www-form-urlencoded'};}
 return requestJson<T>(url.toString(),init,`threads.${endpoint.split('/').pop()}`,method==='GET');
}
export async function paged(endpoint:string,params:Record<string,string>={},maxPages=5) {
 const all:any[]=[]; let after:string|undefined;
 for(let i=0;i<maxPages;i++) { const result=await threads(endpoint,{...params,...(after?{after}:{})}); all.push(...(result.data||[]));after=result.paging?.cursors?.after; if(!result.paging?.next||!after)break; }
 return all;
}
export async function refreshToken() {
 const c=await connection(); if(!c)return;
 if(new Date(c.expires_at).getTime()-Date.now()>30*86400_000)return;
 const result=await requestJson<any>('https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token',{headers:{Authorization:`Bearer ${decrypt(c.token)}`}},'threads.refresh');
 if(!result.access_token||!result.expires_in)throw new AppError(502,'Не удалось подтвердить обновление токена');
 await rows(sql`UPDATE connections SET token=${encrypt(result.access_token)},expires_at=${new Date(Date.now()+result.expires_in*1000).toISOString()} WHERE id=1`);
}
