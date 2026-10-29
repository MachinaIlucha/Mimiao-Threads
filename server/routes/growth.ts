import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql,rows,one } from '../db.js';
import { AppError } from '../errors.js';
import { sourceInput,schoolInput,eventInput } from '../../shared/growth.js';
const idOf=(v:unknown)=>z.object({id:z.string().uuid()}).parse(v).id;
export async function growthData(){
 return {sources:await rows(sql`SELECT * FROM growth_sources ORDER BY created_at DESC LIMIT 500`),schools:await rows(sql`SELECT * FROM growth_schools ORDER BY created_at DESC`),events:await rows(sql`SELECT * FROM growth_events ORDER BY happened_at DESC`)};
}
export async function growthRoutes(app:FastifyInstance){
 app.get('/api/growth',growthData);
 app.post('/api/growth/sources/:id/reply',async req=>{
  const p=await one(sql`SELECT * FROM growth_sources WHERE id=${idOf(req.params)}::uuid`);
  if(!p?.url||!p.confirmed)throw new AppError(409,'Нужны проверенный источник и ссылка на обсуждение');
  const url=new URL(p.url);if(!['www.threads.com','threads.com','www.threads.net','threads.net'].includes(url.hostname)||!url.pathname.includes('/post/'))throw new AppError(400,'Нужна ссылка на конкретный пост Threads');
  return one(sql`INSERT INTO replies(provider_id,username,text,source_url,kind,created_at) VALUES(${'manual:'+p.id},${p.author},${p.text},${p.url},'opportunity',now()) ON CONFLICT(provider_id) DO UPDATE SET source_url=EXCLUDED.source_url RETURNING *`);
 });
 app.post('/api/growth/sources',async req=>{const p=sourceInput.parse(req.body);return one(sql`INSERT INTO growth_sources(title,text,url,author,kind,hypothesis,published_at,activity_at,confirmed,permission) VALUES(${p.title},${p.text},${p.url},${p.author},${p.kind},${p.hypothesis},${p.published_at}::timestamptz,${p.activity_at}::timestamptz,${p.confirmed},${p.permission}) RETURNING *`);});
 app.patch('/api/growth/sources/:id',async req=>{const p=z.object({confirmed:z.boolean(),permission:z.boolean()}).parse(req.body);const r=await one(sql`UPDATE growth_sources SET confirmed=${p.confirmed},permission=${p.permission} WHERE id=${idOf(req.params)}::uuid RETURNING *`);if(!r)throw new AppError(404,'Источник не найден');return r;});
 app.post('/api/growth/schools',async req=>{const p=schoolInput.parse(req.body);const r=await one(sql`INSERT INTO growth_schools(key,name,qualified,note) VALUES(${p.key},${p.name},${p.qualified},${p.note}) ON CONFLICT(key) DO NOTHING RETURNING *`);if(!r)throw new AppError(409,'Школа уже есть. Добавьте этап в её карточке.');return r;});
 app.patch('/api/growth/schools/:id',async req=>{const p=z.object({qualified:z.boolean(),note:z.string().max(2000)}).parse(req.body);const r=await one(sql`UPDATE growth_schools SET qualified=${p.qualified},note=${p.note} WHERE id=${idOf(req.params)}::uuid RETURNING *`);if(!r)throw new AppError(404,'Школа не найдена');return r;});
 app.put('/api/growth/schools/:id/event',async req=>{const p=eventInput.parse(req.body),id=idOf(req.params);if(!await one(sql`SELECT id FROM growth_schools WHERE id=${id}::uuid`))throw new AppError(404,'Школа не найдена');return one(sql`INSERT INTO growth_events(school_id,stage,happened_at,attribution,source,content_id,proof) VALUES(${id}::uuid,${p.stage},${p.happened_at},${p.attribution},${p.source},${p.content_id},${p.proof}) ON CONFLICT(school_id,stage) DO UPDATE SET happened_at=EXCLUDED.happened_at,attribution=EXCLUDED.attribution,source=EXCLUDED.source,content_id=EXCLUDED.content_id,proof=EXCLUDED.proof RETURNING *`);});
}
