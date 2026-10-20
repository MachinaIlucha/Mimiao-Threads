import type {Page} from 'playwright';
import {config} from '../config.js';
import {AppError} from '../errors.js';

type Step={method:string;args:unknown[]};
// tsx/esbuild preserves nested function names using this otherwise external
// helper. Recreate it inside the page's isolated evaluation scope.
function browserFunction(fn:Function){
 return `(...args)=>{const __name=(value)=>value;return (${fn.toString()})(...args)}`;
}
// The publisher keeps its existing Playwright DOM checks. Only this transport
// crosses into the Python process that owns the manager's persistent context.
function encode(value:unknown):unknown{
 if(value instanceof RegExp)return {regex:value.source,flags:value.flags};
 if(Array.isArray(value))return value.map(encode);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]));
 return value;
}
export async function camoufoxPage():Promise<Page>{
 let currentUrl='about:blank';
 async function call(method:string,args:unknown[]=[],steps:Step[]=[]):Promise<any>{
  let response:Response;
  try{
   response=await fetch(`${config.camoufoxUrl}/studio/command`,{
    method:'POST',headers:{'Content-Type':'application/json','X-Studio-Key':config.camoufoxKey},
    body:JSON.stringify(encode({method,args,steps})),signal:AbortSignal.timeout(95000)
   });
  }catch{
   // Never retry: a failed response may follow a successful Post click.
   throw new AppError(503,'Camoufox недоступен или ответ потерян. Проверьте менеджер профилей.');
  }
  if(!response.ok)throw new AppError(409,'Операция Camoufox остановлена. Проверьте браузер и подключение профиля.');
  const body=await response.json() as {url:string;result:unknown};
  currentUrl=body.url;return body.result;
 }
 function locator(steps:Step[]):any{
  const next=(method:string,args:unknown[])=>locator([...steps,{method,args}]);
  return {
   getByRole:(...args:unknown[])=>next('get_by_role',args),
   getByText:(...args:unknown[])=>next('get_by_text',args),
   locator:(...args:unknown[])=>next('locator',args),
   first:()=>next('first',[]),
   waitFor:(options?:unknown)=>call('wait_for',[options||{}],steps),
   getAttribute:(name:string,options?:unknown)=>call('get_attribute',[name,options||{}],steps),
   count:()=>call('count',[],steps),
   fill:(text:string)=>call('fill',[text],steps),
   innerText:()=>call('inner_text',[],steps),
   isEnabled:()=>call('is_enabled',[],steps),
   click:(options?:unknown)=>call('click',[options||{}],steps),
   setInputFiles:(files:string[])=>call('set_input_files',[files],steps),
   evaluateAll:(fn:Function)=>call('evaluate_all',[browserFunction(fn)],steps)
  };
 }
 await call('ensure');
 return {
  url:()=>currentUrl,
  goto:(url:string,options?:unknown)=>call('goto',[url,options||{}]),
  getByRole:(...args:unknown[])=>locator([{method:'get_by_role',args}]),
  getByText:(...args:unknown[])=>locator([{method:'get_by_text',args}]),
  locator:(...args:unknown[])=>locator([{method:'locator',args}]),
  evaluate:(fn:Function)=>call('evaluate',[browserFunction(fn)]),
  waitForFunction:(fn:Function,arg:unknown,options?:unknown)=>call('wait_for_function',[browserFunction(fn),arg,options||{}])
 } as unknown as Page;
}
