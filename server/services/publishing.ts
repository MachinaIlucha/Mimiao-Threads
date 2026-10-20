import { stat } from 'node:fs/promises';
import path from 'node:path';
import { pool, sql, rows, one, transaction } from '../db.js';
import { config } from '../config.js';
import { mediaSignature } from '../security.js';
import { ProviderError, AppError, safeMessage } from '../errors.js';
import { threads, paged, mediaFields, connection } from '../providers/threads.js';
import { settings, event } from './state.js';
import { dueDecision } from '../domain/schedule.js';
import { checkText } from '../domain/editorial.js';
import type { Post } from '../../shared/types.js';
import { publishInBrowser,reconcileBrowser,browserPublishError } from '../browser/publisher.js';
import type { BrowserPostEvidence } from '../browser/evidence.js';
export function mediaUrl(id:string) { const expires=Math.floor(Date.now()/1000)+86400;return `${config.publicUrl}/media/${id}?expires=${expires}&signature=${mediaSignature(id,expires)}`; }
async function createContainer(post:Post) {
 if(post.media_ids.length&&!config.publicUrl.startsWith('https://'))throw new AppError(409,'Для публикации фото нужен публичный HTTPS-адрес студии');
 const children:string[]=[];
 for(const id of post.media_ids){
  const media=await one(sql`SELECT * FROM media WHERE id=${id}::uuid`);if(!media)throw new AppError(409,'Прикреплённое фото отсутствует');
  await stat(path.join(config.mediaDir,media.storage_name));
  const created=await threads('me/threads',{media_type:'IMAGE',image_url:mediaUrl(id),alt_text:media.alt,...(post.media_ids.length>1?{is_carousel_item:'true'}:{text:post.text})},'POST');
  if(!created.id)throw new AppError(502,'Meta не вернула контейнер изображения');children.push(created.id);
 }
 if(children.length===1)return children[0];
 const created=await threads('me/threads',children.length?{media_type:'CAROUSEL',children:children.join(','),text:post.text}:{media_type:'TEXT',text:post.text},'POST');
 if(!created.id)throw new AppError(502,'Meta не вернула контейнер');return String(created.id);
}
async function published(postId:string,attemptId:string,providerId:string) {
 let permalink:string|null=null,timestamp:string|null=null;try{const actual=await threads(providerId,{fields:'permalink,timestamp'});permalink=actual.permalink||null;timestamp=actual.timestamp&&Number.isFinite(Date.parse(actual.timestamp))?actual.timestamp:null;}catch{}
 await transaction(async tx=>{
  await tx(sql`UPDATE posts SET status='published',provider_id=${providerId},permalink=${permalink},published_at=COALESCE(${timestamp}::timestamptz,published_at,now()),updated_at=now(),error=NULL WHERE id=${postId}::uuid`);
  await tx(sql`UPDATE publish_attempts SET phase='published',provider_id=${providerId},updated_at=now() WHERE id=${attemptId}::uuid`);
 });await event('publish','success','Пост опубликован',{postId,providerId});
}
async function browserPublished(postId:string,attemptId:string,result:BrowserPostEvidence){
 await transaction(async tx=>{
  await tx(sql`UPDATE posts SET status='published',publication_method='browser',permalink=${result.url},published_at=${result.timestamp}::timestamptz,updated_at=now(),error=NULL WHERE id=${postId}::uuid`);
  await tx(sql`UPDATE publish_attempts SET phase='published',updated_at=now() WHERE id=${attemptId}::uuid`);
 });await event('publish','success','Пост опубликован через браузер',{postId,permalink:result.url});
}
export async function reconcile() {
 await rows(sql`UPDATE posts SET status='unknown',error='Worker остановился во время отправки. Выполняется сверка.' WHERE status='publishing' AND updated_at<now()-interval '10 minutes'`);
 const unknown=await rows<Post>(sql`SELECT * FROM posts WHERE status='unknown' LIMIT 10`);
 for(const post of unknown){
  const attempt=await one(sql`SELECT * FROM publish_attempts WHERE post_id=${post.id}::uuid ORDER BY started_at DESC LIMIT 1`);if(!attempt)continue;
  if(attempt.transport==='browser'){
   if(config.publishingMode==='browser'){
    const result=await reconcileBrowser(post,attempt.browser_baseline,attempt.sending_at);
    if(result)await browserPublished(post.id,attempt.id,result);
   }
   continue;
  }
  // Only read provider state. Never resend an ambiguous publish request.
  if(!attempt.container_id)continue;
  const state=await threads(attempt.container_id,{fields:'status'});
  if(state.status!=='PUBLISHED')continue;
  const candidates=await paged('me/threads',{fields:mediaFields,since:String(Math.floor(new Date(attempt.started_at).getTime()/1000)-60),limit:'100'},2);
  const matches=candidates.filter(p=>p.text===post.text&&!p.is_reply);
  if(matches.length===1)await published(post.id,attempt.id,matches[0].id);
 }
}
export async function publishDue() {
 if(!config.livePublishing || (await settings()).paused || (config.publishingMode==='api'&&!await connection()))return;
 const lock=await pool.connect();
 try {
  if(!(await lock.query('SELECT pg_try_advisory_lock(7319403) AS acquired')).rows[0].acquired)return;
  // One unresolved delivery stops the queue; the unknown post may already be public.
  if(await one(sql`SELECT id FROM posts WHERE status IN ('unknown','publishing') LIMIT 1`))return;
  const post=await one<Post>(sql`SELECT * FROM posts WHERE status='scheduled' AND scheduled_at<=now() ORDER BY scheduled_at LIMIT 1`);if(!post)return;
  const previous=await one(sql`SELECT published_at FROM posts WHERE status='published' AND root_id IS NULL ORDER BY published_at DESC LIMIT 1`);
  const decision=dueDecision(post.scheduled_at!,new Date(),previous?.published_at||null);
  if(decision==='missed'){await rows(sql`UPDATE posts SET status='missed',error='Опоздание больше 30 минут. Пост не опубликован пачкой после простоя.' WHERE id=${post.id}::uuid AND status='scheduled'`);await event('publish','warning','Пропущено время публикации',{postId:post.id});return;}
  if(decision==='wait')return;
  const s=await settings();if(s.paused)return;
  const errors=checkText(post.text,s);
  if(post.expires_at&&new Date(post.expires_at)<new Date())errors.push('Тема устарела');
  if(errors.length){await rows(sql`UPDATE posts SET status='blocked',error=${errors.join('. ')} WHERE id=${post.id}::uuid AND status='scheduled'`);return;}
  const claimed=await transaction(async tx=>{
   const p=await tx(sql`UPDATE posts SET status='publishing',publication_method=${config.publishingMode},updated_at=now() WHERE id=${post.id}::uuid AND revision=${post.revision} AND status='scheduled' RETURNING id`);
   if(!p.length)return null;
   return (await tx(sql`INSERT INTO publish_attempts(post_id,revision,phase,transport) VALUES(${post.id}::uuid,${post.revision},'creating',${config.publishingMode}) RETURNING id`))[0].id as string;
  });if(!claimed)return;
  let sendStarted=false;
  try {
   if(config.publishingMode==='browser'){
    const result=await publishInBrowser(post,async(baseline,sentAt)=>{
     if(!config.livePublishing||(await settings()).paused)throw new AppError(409,'Очередь приостановлена до отправки');
     await rows(sql`UPDATE publish_attempts SET browser_baseline=${JSON.stringify(baseline)}::jsonb,sending_at=${sentAt}::timestamptz,phase='sending',updated_at=now() WHERE id=${claimed}::uuid`);
     sendStarted=true;
    });
    await browserPublished(post.id,claimed,result);
    return;
   }
   const container=await createContainer(post);
   await rows(sql`UPDATE publish_attempts SET container_id=${container},phase='ready',updated_at=now() WHERE id=${claimed}::uuid`);
   await rows(sql`UPDATE posts SET container_id=${container} WHERE id=${post.id}::uuid`);
   let ready=false;
   for(let i=0;i<8;i++){const state=await threads(container,{fields:'status'});if(state.status==='FINISHED'){ready=true;break;}if(['ERROR','EXPIRED'].includes(state.status))throw new AppError(502,'Meta отклонила контейнер');await new Promise(r=>setTimeout(r,2000));}
   if(!ready)throw new AppError(502,'Контейнер не готов; публикация остановлена');
   if((await settings()).paused)throw new AppError(409,'Очередь приостановлена до отправки');
   await rows(sql`UPDATE publish_attempts SET phase='sending',updated_at=now() WHERE id=${claimed}::uuid`);
   sendStarted=true;
   const result=await threads('me/threads_publish',{creation_id:container},'POST');
   if(!result.id)throw new ProviderError(200,'threads.publish',true);
   await published(post.id,claimed,String(result.id));
  } catch(error) {
   const uncertain=sendStarted && !(error instanceof ProviderError&&!error.uncertain&&error.status>=400&&error.status<500);
   const message=safeMessage(error);
   await rows(sql`UPDATE posts SET status=${uncertain?'unknown':'blocked'},error=${message},updated_at=now() WHERE id=${post.id}::uuid`);
   await rows(sql`UPDATE publish_attempts SET phase=${uncertain?'unknown':'failed'},error=${message},updated_at=now() WHERE id=${claimed}::uuid`);
   await event('publish',uncertain?'unknown':'error',message,{postId:post.id});
   if(config.publishingMode==='browser'){
    await browserPublishError();
    await rows(sql`UPDATE settings SET value=jsonb_set(value,'{paused}','true') WHERE id=1`);
    await event('browser','warning','Очередь автоматически приостановлена после ошибки браузера. Проверьте результат перед продолжением.');
   }
  }
 } finally {await lock.query('SELECT pg_advisory_unlock(7319403)');lock.release();}
}
