import { z } from 'zod';
import { sql,rows,one } from '../db.js';
import { threads,paged,connection } from '../providers/threads.js';
import { generate } from '../providers/deepseek.js';
import { settings,heartbeat,event } from './state.js';
import { AppError,safeMessage } from '../errors.js';
import { config } from '../config.js';
import { checkText } from '../domain/editorial.js';
export async function collectReplies(){
 const c=await connection();if(!c)return;
 const posts=await rows(sql`SELECT id,provider_id FROM posts WHERE status='published' AND root_id IS NULL AND published_at>now()-interval '14 days' LIMIT 150`);
 for(const p of posts){try{const replies=await paged(`${p.provider_id}/replies`,{fields:'id,text,username,timestamp,permalink',reverse:'false'},5);
  for(const r of replies)if(r.id&&r.username!==c.username)await rows(sql`INSERT INTO replies(post_id,provider_id,username,text,source_url,created_at) VALUES(${p.id}::uuid,${r.id},${r.username||''},${r.text||''},${r.permalink||null},${r.timestamp}) ON CONFLICT(provider_id) DO NOTHING`);
 }catch{await event('replies','warning','Не удалось получить ответы',{postId:p.id});}}
 if(config.deepseekKey){const pending=await rows(sql`SELECT id FROM replies WHERE state='new' AND draft='' AND created_at>now()-interval '7 days' ORDER BY created_at DESC LIMIT 10`);for(const r of pending){try{await draftReply(r.id);}catch{await event('replies.draft','warning','Не удалось подготовить черновик ответа',{replyId:r.id});}}}
 await heartbeat('replies');
}
export async function draftReply(id:string){
 const reply=await one(sql`SELECT * FROM replies WHERE id=${id}::uuid`);if(!reply)throw new AppError(404,'Ответ не найден');
 const s=await settings();const output=await generate('reply','Напиши короткий ответ на украинском без рекламы, с учётом голоса и фактов. Верни JSON {draft, classification: question|experience|discussion|spam|other, meaningful:boolean}. Не придумывай личный опыт.',{reply,voice:s.voice,knowledge:s.knowledge},z.object({draft:z.string().max(500),classification:z.enum(['question','experience','discussion','spam','other']),meaningful:z.boolean()}));
 await rows(sql`UPDATE replies SET draft=${output.draft},classification=CASE WHEN manual THEN classification ELSE ${output.classification} END,meaningful=CASE WHEN manual THEN meaningful ELSE ${output.meaningful} END WHERE id=${id}::uuid AND state NOT IN ('sending','sent','unknown')`);return output;
}
export async function sendReply(id:string){
 if(!config.livePublishing)throw new AppError(409,'На сервере отключена отправка LIVE_PUBLISHING');
 const s=await settings();if(s.paused)throw new AppError(409,'Снимите общую паузу перед отправкой');
 const r=await one(sql`UPDATE replies SET state='sending',sending_at=now() WHERE id=${id}::uuid AND state IN ('new','draft') AND length(draft)>0 RETURNING *`);if(!r)throw new AppError(409,'Ответ уже отправлен, отправляется или требует проверки');
 try{const errors=checkText(r.draft,s,[]);if(errors.length)throw new AppError(400,errors.join('. '));
  const container=await threads('me/threads',{media_type:'TEXT',text:r.draft,reply_to_id:r.provider_id},'POST');
  if(!container.id)throw new AppError(502,'Нет идентификатора контейнера');
  let ready=false;for(let i=0;i<8;i++){const state=await threads(container.id,{fields:'status'});if(state.status==='FINISHED'){ready=true;break;}if(['ERROR','EXPIRED'].includes(state.status))break;await new Promise(r=>setTimeout(r,2000));}
  if(!ready)throw new AppError(502,'Контейнер ответа не готов. Проверьте состояние вручную.');
  if((await settings()).paused)throw new AppError(409,'Отправка приостановлена');
  const published=await threads('me/threads_publish',{creation_id:container.id},'POST');if(!published.id)throw new AppError(502,'Результат отправки неизвестен');
  await rows(sql`UPDATE replies SET state='sent',sent_id=${published.id} WHERE id=${id}::uuid`);await event('reply.sent','success','Ответ опубликован',{replyId:id});return{ok:true};
 }catch(error){await rows(sql`UPDATE replies SET state='unknown',error=${safeMessage(error)} WHERE id=${id}::uuid`);throw error;}
}
