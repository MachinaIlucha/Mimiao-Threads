import { sql,one,rows } from '../db.js';
import { threads,connection } from '../providers/threads.js';
import { AppError } from '../errors.js';
import { event } from './state.js';
export async function resolvePublication(id:string,providerId:string){
 const p=await one(sql`SELECT * FROM posts WHERE id=${id}::uuid AND status='unknown'`);if(!p)throw new AppError(409,'Публикация не ожидает сверки');
 const c=await connection();const actual=await threads(providerId,{fields:'id,text,username,timestamp,permalink,is_reply'});
 if(!c||actual.username!==c.username||actual.text!==p.text||actual.is_reply||!actual.timestamp)throw new AppError(409,'Пост не соответствует тексту и аккаунту в журнале');
 await rows(sql`UPDATE posts SET status='published',provider_id=${actual.id},permalink=${actual.permalink||null},published_at=${actual.timestamp},error=NULL,updated_at=now() WHERE id=${id}::uuid AND status='unknown'`);
 await rows(sql`UPDATE publish_attempts SET phase='published',provider_id=${actual.id},updated_at=now() WHERE post_id=${id}::uuid AND phase IN ('unknown','sending')`);
 await event('publish.resolved','success','Опубликованный пост подтверждён по API',{postId:id,providerId});return {ok:true};
}
