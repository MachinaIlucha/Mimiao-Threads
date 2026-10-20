export const threadsUsername = 'mimiao.crm';
export const threadsHome = 'https://www.threads.com/';
export const threadsProfile = `${threadsHome}@${threadsUsername}`;
export const normalizeText = (text:string) => text.replace(/\s+/gu,' ').trim();
export interface BrowserPostEvidence { url:string; text:string; timestamp:string; images:number }

export function postUrl(value:string):string|null {
 try {
  const url=new URL(value,threadsHome);
  if(!['www.threads.com','threads.com','www.threads.net','threads.net'].includes(url.hostname)||url.protocol!=='https:'||url.username||url.password||url.port)return null;
  if(!/^\/@mimiao\.crm\/post\/[A-Za-z0-9_-]+\/?$/.test(url.pathname))return null;
  return `${threadsHome}${url.pathname.slice(1).replace(/\/$/,'')}`;
 }catch{return null;}
}
export function matchingPublication(items:BrowserPostEvidence[],text:string,baseline:string[],sentAt:string,mediaCount:number) {
 const start=Date.parse(sentAt);
 if(!Number.isFinite(start))return null;
 const matches=new Map<string,BrowserPostEvidence>();
 for(const item of items){
  const url=postUrl(item.url),time=Date.parse(item.timestamp);
  if(!url||baseline.includes(url)||normalizeText(item.text)!==normalizeText(text))continue;
  // A bounded window prevents an unrelated later manual post resolving this attempt.
  if(!Number.isFinite(time)||time<start-5000||time>start+300000||item.images<mediaCount)continue;
  matches.set(url,{...item,url});
 }
 return matches.size===1?[...matches.values()][0]:null;
}
