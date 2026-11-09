import { z } from 'zod';
import { sql, rows, one, transaction } from '../db.js';
import { AppError } from '../errors.js';
import { settings, event } from './state.js';
import { checkText } from '../domain/editorial.js';
import type { Post } from '../../shared/types.js';
import { occupiedPostTimes } from './draft-times.js';
import { nextDraftTime } from '../domain/draft-time.js';
export const postInput=z.object({evidence_id:z.string().uuid().nullable().optional(),hypothesis:z.enum(['transition','accounting']).nullable().optional(),text:z.string().max(4000),alternative:z.string().max(4000).default(''),category:z.enum(['teaching','life','founder','product']).default('teaching'),scheduled_at:z.string().datetime({offset:true}).nullable().default(null),media_ids:z.array(z.string().uuid()).max(20).default([]),topic:z.string().max(300).default(''),reason:z.string().max(2000).default(''),sources:z.array(z.string().url()).max(20).default([]),expires_at:z.string().datetime({offset:true}).nullable().default(null),status:z.enum(['draft','scheduled','cancelled']).default('draft'),revision:z.number().int().optional()});
export async function savePost(raw:unknown,id?:string) {
 const data=postInput.parse(raw),s=await settings();
 if(new Set(data.media_ids).size!==data.media_ids.length)throw new AppError(400,'Изображения не должны повторяться');
 for(const mediaId of data.media_ids)if(!await one(sql`SELECT id FROM media WHERE id=${mediaId}::uuid`))throw new AppError(400,'Изображение не найдено');
 if(data.status==='scheduled'){
  const history=await rows(sql`SELECT text FROM posts WHERE status IN ('published','scheduled') AND (${id||null}::uuid IS NULL OR id<>${id||null}::uuid) AND created_at>now()-interval '90 days'`);
  const errors=checkText(data.text,s,history.map(p=>p.text));
  if(errors.length)throw new AppError(400,errors.join('. '));
  if(!data.scheduled_at||new Date(data.scheduled_at).getTime()<Date.now())throw new AppError(400,'Выберите время в будущем');
  if(data.expires_at&&new Date(data.expires_at)<=new Date(data.scheduled_at))throw new AppError(400,'Тема устареет до публикации');
 }
 const post=await transaction(async tx=>{
  await tx(sql`SELECT pg_advisory_xact_lock(7319402)`);
  let old:Post|undefined;
  if(id){ old=(await tx<Post>(sql`SELECT * FROM posts WHERE id=${id}::uuid FOR UPDATE`))[0];if(!old)throw new AppError(404,'Пост не найден');
   if(['published','publishing','unknown'].includes(old.status))throw new AppError(409,'Эту публикацию уже нельзя изменить');
   if(data.revision!==old.revision)throw new AppError(409,'Пост изменился. Обновите страницу.','REVISION_CONFLICT');
  }
  if(data.status==='draft'&&!data.scheduled_at)data.scheduled_at=old?.scheduled_at||nextDraftTime(await occupiedPostTimes(tx,id),s.weeklyCount??7,new Date(),s.dailyCount??8);
  const evidenceId=data.evidence_id===undefined?old?.evidence_id||null:data.evidence_id;
  let hypothesis=data.hypothesis===undefined?old?.hypothesis||null:data.hypothesis;
  if(evidenceId){
   const [source]=await tx(sql`SELECT * FROM growth_sources WHERE id=${evidenceId}::uuid FOR SHARE`);
   if(!source)throw new AppError(400,'Источник не найден');
   hypothesis=source.hypothesis;
   if(data.status==='scheduled'&&(!source.confirmed||(source.kind==='customer'&&!source.permission)))throw new AppError(409,'Сначала подтвердите источник и разрешение на клиентскую историю');
  }
  if(data.status==='scheduled'){
   const conflict=await tx(sql`SELECT id FROM posts WHERE status IN ('scheduled','publishing') AND (${id||null}::uuid IS NULL OR id<>${id||null}::uuid) AND abs(extract(epoch FROM scheduled_at-${data.scheduled_at}::timestamptz))<60 LIMIT 1`);
   if(conflict.length)throw new AppError(409,'Это время занято другой публикацией. Выберите время хотя бы на минуту позже.');
  }
  if(old){
   await tx(sql`INSERT INTO revisions(post_id,revision,snapshot,reason) VALUES(${id}::uuid,${old.revision},${JSON.stringify(old)}::jsonb,${data.reason}) ON CONFLICT DO NOTHING`);
   return (await tx<Post>(sql`UPDATE posts SET evidence_id=${evidenceId}::uuid,hypothesis=${hypothesis},text=${data.text},alternative=${data.alternative},category=${data.category},scheduled_at=${data.scheduled_at}::timestamptz,media_ids=${JSON.stringify(data.media_ids)}::jsonb,topic=${data.topic},reason=${data.reason},sources=${JSON.stringify(data.sources)}::jsonb,expires_at=${data.expires_at}::timestamptz,status=${data.status},revision=revision+1,updated_at=now(),error=NULL WHERE id=${id}::uuid RETURNING *`))[0];
  }
  return (await tx<Post>(sql`INSERT INTO posts(text,alternative,category,scheduled_at,media_ids,topic,reason,sources,expires_at,status,evidence_id,hypothesis) VALUES(${data.text},${data.alternative},${data.category},${data.scheduled_at}::timestamptz,${JSON.stringify(data.media_ids)}::jsonb,${data.topic},${data.reason},${JSON.stringify(data.sources)}::jsonb,${data.expires_at}::timestamptz,${data.status},${evidenceId}::uuid,${hypothesis}) RETURNING *`))[0];
 });
 await event('post.saved','success','Публикация сохранена',{postId:post.id,revision:post.revision});return post;
}
