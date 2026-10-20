import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright';
import type { Post } from '../../shared/types.js';
import { config } from '../config.js';
import { sql,one } from '../db.js';
import { AppError } from '../errors.js';
import { withBrowser,assertOwnAccount,setBrowserStatus } from './session.js';
import { threadsProfile,threadsUsername,postUrl,matchingPublication,type BrowserPostEvidence } from './evidence.js';

// Read only rendered DOM. No private endpoints, intercepted tokens or undocumented APIs.
export async function readProfilePosts(page:Page):Promise<BrowserPostEvidence[]>{
 return page.evaluate(()=>{
  const result:{url:string;text:string;timestamp:string;images:number}[]=[];
  const readText=(node:Node):string=>{
   if(node.nodeType===3)return node.textContent||'';
   if(node.nodeType!==1)return '';
   const element=node as Element;
   if(/^(BUTTON|SVG|IMG|TIME)$/.test(element.tagName)||element.getAttribute('role')==='button')return '';
   if(element.tagName==='BR')return '\n';
   return Array.from(node.childNodes).map(readText).join('');
  };
  for(const link of document.querySelectorAll<HTMLAnchorElement>('a[href*="/@mimiao.crm/post/"]')){
   const time=link.querySelector('time[datetime]');if(!time)continue;
   let card:HTMLElement|null=link.parentElement;
   for(let depth=0;card&&depth<12;depth++,card=card.parentElement){
    const links=new Set(Array.from(card.querySelectorAll<HTMLAnchorElement>('a[href*="/post/"]')).map(a=>a.pathname));
    if(links.size>1)break;
    // The smallest post container with its actions excludes surrounding feed and quoted posts.
    if(!Array.from(card.querySelectorAll('[role="button"],button')).some(b=>/^(Like|Unlike|Нравится|Не нравится|Подобається|Не подобається)/.test(b.getAttribute('aria-label')||b.textContent||'')))continue;
    const textBlocks=Array.from(card.querySelectorAll<HTMLElement>('[dir="auto"]'))
     .filter(e=>e.getClientRects().length>0&&!e.closest('a,button,[role="button"],time')&&!e.querySelector('time')&&!e.parentElement?.closest('[dir="auto"]'))
     .map(e=>readText(e).trim()).filter(Boolean);
    result.push({url:link.href,text:textBlocks.join('\n'),timestamp:time.getAttribute('datetime')||'',images:Array.from(card.querySelectorAll('img')).filter(i=>!i.alt.includes('profile picture')&&!i.closest('a[href="/@mimiao.crm"]')).length});
    break;
   }
  }
  return result;
 });
}
async function attachments(ids:string[]){
 const files:string[]=[];
 for(const id of ids){
  const media=await one(sql`SELECT storage_name FROM media WHERE id=${id}::uuid`);
  if(!media||path.basename(media.storage_name)!==media.storage_name)throw new AppError(409,'Прикреплённое фото отсутствует');
  const file=path.join(config.mediaDir,media.storage_name);
  if(!(await stat(file).catch(()=>null))?.isFile())throw new AppError(409,'Прикреплённое фото отсутствует на диске');
  files.push(file);
 }
 return files;
}
async function openOwnProfile(page:Page){
 await page.goto(threadsProfile,{waitUntil:'domcontentloaded'});
 await assertOwnAccount(page);
 await page.getByRole('button',{name:/^Edit profile$|^Редактировать профиль$|^Редагувати профіль$/}).waitFor();
 // This established account has posts. Do not mistake a loading feed for an empty baseline.
 await page.locator('a[href*="/@mimiao.crm/post/"] time[datetime]').first().waitFor({timeout:30000});
}
export async function publishInBrowser(post:Post,beforeSend:(baseline:string[],sentAt:string)=>Promise<void>){
 const files=await attachments(post.media_ids);
 return withBrowser(async page=>{
  await openOwnProfile(page);
  const before=await readProfilePosts(page);
  if(!before.some(p=>p.text.trim()))throw new AppError(409,'Не удалось прочитать карточки профиля. Публикация остановлена до проверки интерфейса Threads.');
  // Capture every visible permalink, including cards whose text structure has changed.
  const baseline=(await page.locator('a[href*="/@mimiao.crm/post/"]').evaluateAll(els=>els.map(e=>(e as HTMLAnchorElement).href))).map(postUrl).filter((x):x is string=>!!x);
  if(before.some(p=>p.text.replace(/\s+/gu,' ').trim()===post.text.replace(/\s+/gu,' ').trim()))throw new AppError(409,'Такой текст уже виден в профиле. Проверьте, не опубликован ли пост вручную.');
  await page.getByRole('button',{name:/^New thread$|^Новая ветка$|^Новий допис$/}).click();
  const dialog=page.getByRole('dialog');
  await dialog.waitFor();
  await dialog.getByText(threadsUsername,{exact:true}).waitFor();
  const editor=dialog.getByRole('textbox');
  if(await editor.count()!==1)throw new AppError(409,'В редакторе несколько частей треда. Нужна ручная проверка.');
  await editor.fill(post.text);
  if(files.length){
   await dialog.locator('input[type="file"]').setInputFiles(files);
   // All previews must load before the final click; never degrade to text only.
   await page.waitForFunction(({count})=>{
    const d=document.querySelector('[role="dialog"]');if(!d)return false;
    const images=Array.from(d.querySelectorAll('img')).filter(i=>!i.alt.includes('profile picture'));
    return images.length===count&&images.every(i=>i.complete&&i.naturalWidth>0)&&!d.querySelector('[role="progressbar"]');
   },{count:files.length},{timeout:60000});
  }
  if((await editor.innerText()).replace(/\r\n/g,'\n').trim()!==post.text.replace(/\r\n/g,'\n').trim())throw new AppError(409,'Текст в браузере не совпадает с постом');
  await assertOwnAccount(page);
  const send=dialog.getByRole('button',{name:/^Post$|^Опубликовать$|^Опублікувати$/});
  if(!await send.isEnabled())throw new AppError(409,'Threads пока не разрешает отправку поста');
  const sentAt=new Date().toISOString();
  await beforeSend(baseline,sentAt); // Durable sending state BEFORE the only final click.
  await send.click({timeout:15000});
  await dialog.waitFor({state:'hidden',timeout:60000});
  await openOwnProfile(page);
  const match=matchingPublication(await readProfilePosts(page),post.text,baseline,sentAt,files.length);
  if(!match)throw new AppError(409,'Отправка выполнена, но результат ещё не подтверждён. Повторная отправка заблокирована.');
  return match;
 });
}
export async function reconcileBrowser(post:Post,baseline:string[]|null,sentAt:string|null){
 if(!baseline||!sentAt)return null;
 return withBrowser(async page=>{
  await openOwnProfile(page);
  return matchingPublication(await readProfilePosts(page),post.text,baseline,sentAt,post.media_ids.length);
 });
}
export async function browserPublishError(){
 await setBrowserStatus('attention','Операция остановлена. Проверьте журнал и браузер сервера; повторная отправка неизвестного результата запрещена.');
}
