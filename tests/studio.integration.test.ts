import { beforeAll,beforeEach,afterAll,describe,it,expect,vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
vi.mock('../server/providers/threads',()=>({connection:vi.fn(async()=>({username:'mimiao.crm'})),threads:vi.fn(),paged:vi.fn(async()=>[]),mediaFields:'id,text',refreshToken:vi.fn()}));
vi.mock('../server/providers/deepseek',()=>({generate:vi.fn(),search:vi.fn(async()=>[])}));
vi.mock('../server/browser/publisher',()=>({publishInBrowser:vi.fn(),reconcileBrowser:vi.fn(),browserPublishError:vi.fn()}));
import { pool,sql,rows,one } from '../server/db';
import { migrate } from '../server/migrate';
import { defaults } from '../server/defaults';
import { createApp } from '../server/app';
import { savePost } from '../server/services/posts';
import { prepareDay } from '../server/services/generation';
import { publishDue,reconcile } from '../server/services/publishing';
import { collectMetrics } from '../server/services/analytics';
import { sendReply } from '../server/services/discussions';
import { threads,paged } from '../server/providers/threads';
import { generate } from '../server/providers/deepseek';
import { ProviderError } from '../server/errors';
import { config } from '../server/config';
import { publishInBrowser,reconcileBrowser } from '../server/browser/publisher';
import { connection } from '../server/providers/threads';
const texts=['Що допомагає вам пояснити складну тему простими словами?','Чи є у вас улюблений спосіб почати перше заняття з новою групою?','Як ви домовляєтесь про перенесення уроків без зайвого листування?','Яка маленька перемога учня запам’яталася вам цього тижня?','Що ви змінили б у своєму робочому розкладі, якби починали спочатку?'];
let app:Awaited<ReturnType<typeof createApp>>;
beforeAll(async()=>{expect(new URL(config.databaseUrl).pathname).toBe('/studio_test');await migrate();app=await createApp();await app.ready();});
beforeEach(async()=>{vi.clearAllMocks();vi.mocked(connection).mockResolvedValue({username:'mimiao.crm'});config.publishingMode='api';await pool.query('TRUNCATE posts,revisions,publish_attempts,media,metrics,account_metrics,replies,operations,daily_plans,generation_runs,trends,ideas,experiments,reports,sessions,connections,browser_status CASCADE');await rows(sql`UPDATE settings SET value=${JSON.stringify({...defaults,paused:false})}::jsonb WHERE id=1`);config.livePublishing=true;});
afterAll(async()=>{await app.close();await pool.end();});
async function due(media:string[]=[]){return one(sql`INSERT INTO posts(text,status,scheduled_at,media_ids) VALUES(${texts[0]},'scheduled',now()-interval '1 minute',${JSON.stringify(media)}::jsonb) RETURNING *`);}
async function login(){const r=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin:config.publicUrl},payload:{password:'integration-password'}});expect(r.statusCode).toBe(200);return{cookie:r.headers['set-cookie']!.toString().split(';')[0],origin:config.publicUrl,'x-csrf-token':r.json().csrf};}
describe('authenticated API and editor',()=>{
 it('rejects unauthenticated and CSRF mutations',async()=>{expect((await app.inject('/api/posts')).statusCode).toBe(401);const headers=await login();expect((await app.inject({method:'POST',url:'/api/posts',headers:{cookie:headers.cookie,origin:headers.origin},payload:{text:'draft'}})).statusCode).toBe(403);expect((await app.inject({method:'POST',url:'/api/posts',headers,payload:{text:'draft'}})).statusCode).toBe(200);});
 it('normalizes photos and restricts access',async()=>{const headers=await login(),image=await sharp({create:{width:50,height:40,channels:3,background:'#bbaadd'}}).png().toBuffer();const boundary='studio-test-boundary';const payload=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n`),image,Buffer.from(`\r\n--${boundary}--\r\n`)]);const upload=await app.inject({method:'POST',url:'/api/media',headers:{...headers,'content-type':`multipart/form-data; boundary=${boundary}`},payload});expect(upload.statusCode).toBe(200);const id=upload.json().id;expect((await app.inject(`/media/${id}`)).statusCode).toBe(401);const response=await app.inject({url:`/media/${id}`,headers:{cookie:headers.cookie}});expect(response.headers['content-type']).toBe('image/jpeg');expect((await sharp(response.rawPayload).metadata()).format).toBe('jpeg');});
 it('keeps revisions and rejects stale edits',async()=>{const p=await savePost({text:texts[0]});await savePost({text:texts[1],revision:p.revision,reason:'Новый вопрос'},p.id);await expect(savePost({text:texts[2],revision:p.revision},p.id)).rejects.toMatchObject({statusCode:409});expect((await rows(sql`SELECT * FROM revisions`))).toHaveLength(1);});
 it('allows only one competing scheduled slot',async()=>{const scheduled_at='2099-10-20T09:00:00+03:00';const result=await Promise.allSettled([savePost({text:texts[0],status:'scheduled',scheduled_at}),savePost({text:texts[1],status:'scheduled',scheduled_at})]);expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);});
 it('creates and reschedules manual publications overnight in Kyiv time',async()=>{
  const headers=await login();let saved:{id:string;revision:number}|undefined;
  for(const time of ['00:00','03:15','07:59','23:59']){
   const scheduled_at=`2099-10-20T${time}:00+03:00`;
   const response=await app.inject({method:saved?'PUT':'POST',url:saved?`/api/posts/${saved.id}`:'/api/posts',headers,payload:{text:texts[0],status:'scheduled',scheduled_at,revision:saved?.revision}});
   expect(response.statusCode).toBe(200);saved=response.json();
   const stored=await one(sql`SELECT status,scheduled_at FROM posts WHERE id=${saved!.id}::uuid`);
   expect(stored!.status).toBe('scheduled');
   expect(new Date(stored!.scheduled_at).toISOString()).toBe(new Date(scheduled_at).toISOString());
  }
 });
 it('still rejects scheduling in the past',async()=>{
  await expect(savePost({text:texts[0],status:'scheduled',scheduled_at:'2000-10-20T03:15:00+03:00'})).rejects.toMatchObject({statusCode:400,message:'Выберите время в будущем'});
 });
});
describe('daily generation',()=>{
 it('claims a day once across concurrent requests',async()=>{vi.mocked(generate).mockResolvedValue({posts:texts.map(text=>({text,alternative:text,category:'teaching',topic:'Вопрос',reason:'Обсуждение',sourceUrls:[],trendId:null,verified:true,concerns:[]}))});await Promise.all([prepareDay('2099-10-20'),prepareDay('2099-10-20')]);expect(generate).toHaveBeenCalledTimes(1);expect((await rows(sql`SELECT * FROM posts`))).toHaveLength(5);});
 it('fails closed on unsupported claims',async()=>{vi.mocked(generate).mockResolvedValue({posts:texts.map(text=>({text,alternative:text,category:'teaching',topic:'Вопрос',reason:'Обсуждение',sourceUrls:[],trendId:null,verified:false,concerns:['Нет источника']}))});await expect(prepareDay('2099-10-20')).rejects.toThrow();expect((await rows(sql`SELECT * FROM posts`))).toHaveLength(0);expect((await one(sql`SELECT status FROM daily_plans`))!.status).toBe('failed');});
});
describe('publication safety',()=>{
 it('publishes once with competing workers',async()=>{const post=await due();vi.mocked(threads).mockImplementation(async endpoint=>endpoint==='me/threads'?{id:'container'}:endpoint==='container'?{status:'FINISHED'}:endpoint==='me/threads_publish'?{id:'published-id'}:{permalink:'https://www.threads.com/test'});await Promise.all([publishDue(),publishDue()]);expect(vi.mocked(threads).mock.calls.filter(c=>c[0]==='me/threads_publish')).toHaveLength(1);expect((await one(sql`SELECT status FROM posts WHERE id=${post!.id}::uuid`))!.status).toBe('published');});
 it('does not send when paused or live sending disabled',async()=>{await due();await rows(sql`UPDATE settings SET value=jsonb_set(value,'{paused}','true')`);await publishDue();expect(threads).not.toHaveBeenCalled();config.livePublishing=false;await rows(sql`UPDATE settings SET value=jsonb_set(value,'{paused}','false')`);await publishDue();expect(threads).not.toHaveBeenCalled();});
 it('marks overdue posts missed rather than sending a burst',async()=>{await due();await rows(sql`UPDATE posts SET scheduled_at=now()-interval '2 hours'`);await publishDue();expect(threads).not.toHaveBeenCalled();expect((await one(sql`SELECT status FROM posts`))!.status).toBe('missed');});
 it('does not silently drop missing photos',async()=>{await due([randomUUID()]);await publishDue();expect(threads).not.toHaveBeenCalled();expect((await one(sql`SELECT status FROM posts`))!.status).toBe('blocked');});
 it('pauses between container creation and final send',async()=>{await due();vi.mocked(threads).mockImplementation(async endpoint=>{if(endpoint==='me/threads'){await rows(sql`UPDATE settings SET value=jsonb_set(value,'{paused}','true')`);return{id:'container'};}return{status:'FINISHED'};});await publishDue();expect(vi.mocked(threads).mock.calls.some(c=>c[0]==='me/threads_publish')).toBe(false);});
 it('keeps ambiguous results unknown and reconciles without resending',async()=>{const post=await due();vi.mocked(threads).mockImplementation(async endpoint=>{if(endpoint==='me/threads_publish')throw new ProviderError(0,'publish',true);return endpoint==='me/threads'?{id:'container'}:{status:'FINISHED'};});await publishDue();expect((await one(sql`SELECT status FROM posts`))!.status).toBe('unknown');await publishDue();expect(vi.mocked(threads).mock.calls.filter(c=>c[0]==='me/threads_publish')).toHaveLength(1);vi.mocked(threads).mockImplementation(async endpoint=>endpoint==='container'?{status:'PUBLISHED'}:{permalink:'https://www.threads.com/test'});vi.mocked(paged).mockResolvedValue([{id:'found-id',text:post!.text,is_reply:false}]);await reconcile();expect((await one(sql`SELECT status FROM posts`))!.status).toBe('published');});
 it('cannot edit a post once publication is claimed',async()=>{const p=await due();await rows(sql`UPDATE posts SET status='publishing'`);await expect(savePost({text:texts[1],revision:p!.revision},p!.id)).rejects.toMatchObject({statusCode:409});});
});
describe('metrics and replies',()=>{
 it('labels imported history and preserves missing metrics',async()=>{const p=await one(sql`INSERT INTO posts(text,status,provider_id,published_at) VALUES('old','published','old-id',now()-interval '20 days') RETURNING id`);vi.mocked(threads).mockResolvedValue({data:[{name:'views',values:[{value:0}]}]});await collectMetrics();const metrics=await rows(sql`SELECT * FROM metrics WHERE post_id=${p!.id}::uuid`);expect(metrics).toHaveLength(1);expect(metrics[0]).toMatchObject({checkpoint:'import',views:0,likes:null,follows:null});});
 it('does not resend an ambiguous reply',async()=>{const r=await one(sql`INSERT INTO replies(provider_id,username,text,draft,state,created_at) VALUES('reply','person','Question',${texts[1]},'draft',now()) RETURNING id`);vi.mocked(threads).mockImplementation(async endpoint=>{if(endpoint==='me/threads_publish')throw new ProviderError(0,'publish',true);return endpoint==='me/threads'?{id:'container'}:{status:'FINISHED'};});await expect(sendReply(r!.id)).rejects.toThrow();await expect(sendReply(r!.id)).rejects.toMatchObject({statusCode:409});expect(vi.mocked(threads).mock.calls.filter(c=>c[0]==='me/threads_publish')).toHaveLength(1);});
});
describe('browser publishing transport',()=>{
 it('publishes without API credentials and records a permalink instead of a fake API id',async()=>{
  config.publishingMode='browser';vi.mocked(connection).mockResolvedValue(undefined);
  const p=await due();
  vi.mocked(publishInBrowser).mockImplementation(async(post,beforeSend)=>{
   await beforeSend([],new Date().toISOString());
   const attempt=await one(sql`SELECT * FROM publish_attempts WHERE post_id=${post.id}::uuid`);
   expect(attempt).toMatchObject({phase:'sending',transport:'browser',browser_baseline:[]});
   return {url:'https://www.threads.com/@mimiao.crm/post/abc',timestamp:new Date().toISOString(),text:post.text,images:0};
  });
  await publishDue();
  expect((await one(sql`SELECT * FROM posts WHERE id=${p!.id}::uuid`))).toMatchObject({status:'published',publication_method:'browser',provider_id:null,permalink:'https://www.threads.com/@mimiao.crm/post/abc'});
  expect(threads).not.toHaveBeenCalled();
 });
 it('rechecks pause before the browser click and pauses on preflight failure',async()=>{
  config.publishingMode='browser';await due();
  vi.mocked(publishInBrowser).mockImplementation(async(_post,beforeSend)=>{
   await rows(sql`UPDATE settings SET value=jsonb_set(value,'{paused}','true')`);
   await beforeSend([],new Date().toISOString());throw new Error('unreachable');
  });
  await publishDue();
  expect((await one(sql`SELECT status FROM posts`))!.status).toBe('blocked');
  expect((await one(sql`SELECT phase FROM publish_attempts`))!.phase).toBe('failed');
 });
 it('never retries an uncertain browser click, blocks the queue, and reconciles read-only',async()=>{
  config.publishingMode='browser';const p=await due();
  vi.mocked(publishInBrowser).mockImplementation(async(_post,beforeSend)=>{await beforeSend([],new Date().toISOString());throw new Error('browser closed after click');});
  await publishDue();
  expect((await one(sql`SELECT status FROM posts WHERE id=${p!.id}::uuid`))!.status).toBe('unknown');
  expect((await one(sql`SELECT value FROM settings`))!.value.paused).toBe(true);
  await rows(sql`UPDATE settings SET value=jsonb_set(value,'{paused}','false')`);await due();
  await publishDue();expect(publishInBrowser).toHaveBeenCalledTimes(1);
  vi.mocked(reconcileBrowser).mockResolvedValue({url:'https://www.threads.com/@mimiao.crm/post/abc',timestamp:new Date().toISOString(),text:p!.text,images:0});
  await reconcile();expect(reconcileBrowser).toHaveBeenCalledTimes(1);
  expect((await one(sql`SELECT status FROM posts WHERE id=${p!.id}::uuid`))!.status).toBe('published');
  expect(threads).not.toHaveBeenCalled();
 });
 it('never launches a browser for a disabled publisher',async()=>{
  config.publishingMode='browser';config.livePublishing=false;await due();await publishDue();expect(publishInBrowser).not.toHaveBeenCalled();
 });
});
