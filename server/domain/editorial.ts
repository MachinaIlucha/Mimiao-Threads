import type { Settings } from '../../shared/types.js';
export function normalized(text:string) { return text.toLocaleLowerCase('uk').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim(); }
export function similarity(a:string,b:string) {
 const grams=(s:string)=>{const w=normalized(s).split(' ');return new Set(w.length<3?w:w.slice(0,-2).map((_,i)=>w.slice(i,i+3).join(' ')));};
 const x=grams(a),y=grams(b); const union=new Set([...x,...y]); return union.size?[...x].filter(v=>y.has(v)).length/union.size:0;
}
export function checkText(text:string, settings:Pick<Settings,'forbidden'>,history:string[]=[]) {
 const errors:string[]=[];
 if(!text.trim()) errors.push('Текст пустой');
 if([...text].length>500) errors.push('Больше 500 символов');
 if(/[ыэъё]/i.test(text)) errors.push('Проверьте украинский язык');
 if(/(^|\n)\s*#{1,6}\s|\*\*/.test(text)) errors.push('Удалите Markdown-разметку');
 if(settings.forbidden.some(w=>normalized(text).includes(normalized(w))&&w.trim())) errors.push('Запрещённая формулировка');
 if(history.some(old=>similarity(text,old)>=0.6)) errors.push('Слишком похоже на предыдущую публикацию');
 return errors;
}
export function median(values:number[]) { if(!values.length)return null; const n=[...values].sort((a,b)=>a-b); const m=Math.floor(n.length/2); return n.length%2?n[m]:(n[m-1]+n[m])/2; }
export function nullableMetric(data: {name:string;values?:{value:unknown}[];total_value?:{value:unknown}}[], name:string):number|null {
 const m=data.find(x=>x.name===name); const raw=m?.values?.[0]?.value??m?.total_value?.value;
 return typeof raw==='number' && Number.isFinite(raw) && raw>=0 ? raw:null;
}
