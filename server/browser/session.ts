import { mkdir,chmod } from 'node:fs/promises';
import { chromium,type BrowserContext,type Page } from 'playwright';
import { config } from '../config.js';
import { sql,one,rows } from '../db.js';
import { AppError } from '../errors.js';
import { threadsHome,threadsUsername } from './evidence.js';

let context:BrowserContext|undefined,page:Page|undefined,busy=false;
export async function browserStatus(){
 const status=await one(sql`SELECT state,message,checked_at FROM browser_status WHERE id=1`);
 const worker=await one(sql`SELECT at FROM heartbeats WHERE name='worker'`);
 const online=!!worker&&Date.now()-Date.parse(worker.at)<120000;
 return {...status,state:online?(status?.state||'starting'):'offline',online};
}
export async function setBrowserStatus(state:string,message:string){
 await rows(sql`INSERT INTO browser_status(id,state,message) VALUES(1,${state},${message}) ON CONFLICT(id) DO UPDATE SET state=EXCLUDED.state,message=EXCLUDED.message,checked_at=now()`);
}
export async function browserPage(){
 if(!context){
  await mkdir(config.browserProfileDir,{recursive:true,mode:0o700});
  await chmod(config.browserProfileDir,0o700);
  context=await chromium.launchPersistentContext(config.browserProfileDir,{
   headless:config.browserHeadless,locale:'en-US',viewport:{width:1280,height:900},
   acceptDownloads:false,timeout:45000
  });
  context.on('close',()=>{context=undefined;page=undefined;});
 }
 if(!page||page.isClosed()){
  page=context.pages()[0]||await context.newPage();
  page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(45000);
  await page.goto(threadsHome,{waitUntil:'domcontentloaded'});
 }
 return page;
}
export async function withBrowser<T>(task:(page:Page)=>Promise<T>):Promise<T>{
 if(busy)throw new AppError(409,'Браузер занят другой операцией');
 busy=true;try{return await task(await browserPage());}finally{busy=false;}
}
export async function assertOwnAccount(p:Page){
 const profile=p.getByRole('link',{name:/^Profile(?: Profile)?$|^Профиль(?: Профиль)?$|^Профіль(?: Профіль)?$/}).first();
 const href=await profile.getAttribute('href',{timeout:12000}).catch(()=>null);
 if(href!==`/@${threadsUsername}`&&href!==`https://www.threads.com/@${threadsUsername}`){
  await setBrowserStatus('login_required','Откройте браузер сервера и войдите в @mimiao.crm. Проверки Meta выполняются вручную.');
  throw new AppError(409,'Нет подтверждённой сессии @mimiao.crm. Нужен вход в браузере сервера.','BROWSER_LOGIN_REQUIRED');
 }
 await setBrowserStatus('ready','Вход в @mimiao.crm подтверждён. Публикации подчиняются расписанию и общей паузе.');
}
export async function checkBrowser(){
 if(config.publishingMode!=='browser'||busy)return;
 try{await withBrowser(assertOwnAccount);}
 catch(error){
  if(!(error instanceof AppError))await setBrowserStatus('error','Не удалось проверить браузер. Проверьте окно входа и журнал worker.');
 }
}
export async function closeBrowser(){await context?.close();}
