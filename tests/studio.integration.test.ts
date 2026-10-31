import { beforeAll,beforeEach,afterAll,describe,it,expect,vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { DateTime } from 'luxon';
vi.mock('../server/providers/threads',()=>({connection:vi.fn(async()=>({username:'mimiao.crm'})),threads:vi.fn(),paged:vi.fn(async()=>[]),mediaFields:'id,text',refreshToken:vi.fn()}));
vi.mock('../server/providers/deepseek',()=>({generate:vi.fn(),search:vi.fn(async()=>[])}));
vi.mock('../server/browser/publisher',()=>({publishInBrowser:vi.fn(),reconcileBrowser:vi.fn(),reconcileBrowserBatch:vi.fn(async()=>new Map()),browserPublishError:vi.fn()}));
import { pool,sql,rows,one } from '../server/db';
import { migrate } from '../server/migrate';
import { defaults } from '../server/defaults';
import { createApp } from '../server/app';
import { savePost } from '../server/services/posts';
import { assignMissingDraftTimes } from '../server/services/draft-times';
import { prepareDay } from '../server/services/generation';
import { writeDayPlan } from '../server/services/plan-write';
import { publishDue,reconcile } from '../server/services/publishing';
import { collectMetrics } from '../server/services/analytics';
import { sendReply,collectReplies } from '../server/services/discussions';
import { threads,paged } from '../server/providers/threads';
import { generate } from '../server/providers/deepseek';
import { AppError,ProviderError } from '../server/errors';
import { config } from '../server/config';
import { publishInBrowser,reconcileBrowser,reconcileBrowserBatch } from '../server/browser/publisher';
import { connection } from '../server/providers/threads';
const texts=['Що допомагає вам пояснити складну тему простими словами?','Чи є у вас улюблений спосіб почати перше заняття з новою групою?','Як ви домовляєтесь про перенесення уроків без зайвого листування?','Яка маленька перемога учня запам’яталася вам цього тижня?','Що ви змінили б у своєму робочому розкладі, якби починали спочатку?'];
let app:Awaited<ReturnType<typeof createApp>>;
beforeAll(async()=>{expect(new URL(config.databaseUrl).pathname).toBe('/studio_test');await migrate();app=await createApp();await app.ready();});
beforeEach(async()=>{vi.clearAllMocks();vi.mocked(connection).mockResolvedValue({username:'mimiao.crm'});config.publishingMode='api';await pool.query('TRUNCATE posts,revisions,publish_attempts,media,metrics,account_metrics,replies,operations,daily_plans,generation_runs,trends,ideas,experiments,reports,sessions,connections,browser_status,growth_sources,growth_schools,growth_events CASCADE');await rows(sql`UPDATE settings SET value=${JSON.stringify({...defaults,dailyCount:5,paused:false})}::jsonb WHERE id=1`);config.livePublishing=true;});
afterAll(async()=>{await app.close();await pool.end();});
async function due(media:string[]=[]){return one(sql`INSERT INTO posts(text,status,scheduled_at,media_ids) VALUES(${texts[0]},'scheduled',now()-interval '1 minute',${JSON.stringify(media)}::jsonb) RETURNING *`);}
let loginIp=0;
async function login(){const r=await app.inject({method:'POST',url:'/api/auth/login',remoteAddress:`127.0.0.${++loginIp}`,headers:{origin:config.publicUrl},payload:{password:'integration-password'}});expect(r.statusCode).toBe(200);return{cookie:r.headers['set-cookie']!.toString().split(';')[0],origin:config.publicUrl,'x-csrf-token':r.json().csrf};}
const freshTexts=[...texts,'Які запитання батьків допомагають вам краще зрозуміти потреби дитини?','Як ви обираєте матеріали для творчих завдань у класі?','Що дає вам натхнення для навчання під час канікул?','Який формат зворотного зв’язку найзручніший для ваших колег?','Про що ви хотіли б поговорити на наступній зустрічі освітян?'];
function planPosts(count=5){return freshTexts.slice(0,count).map((text,i)=>({text,alternative:text,category:'teaching' as const,topic:`Нова тема ${i}`,reason:'Обсуждение',sourceUrls:[],trendId:null,verified:true,concerns:[]}));}
function mockPlan(count=5){vi.mocked(generate).mockResolvedValue({posts:planPosts(count)});}
async function readyPlan(){await rows(sql`INSERT INTO daily_plans(day,status,count,slots) VALUES('2099-10-20','ready',5,'[]')`);}
async function readyPost(){await readyPlan();return (await one(sql`INSERT INTO posts(text,status,scheduled_at,plan_day,slot) VALUES('Попереднє запитання','scheduled','2099-10-20T09:00:00+03:00','2099-10-20',0) RETURNING *`))!;}
describe('authenticated API and editor',()=>{
 it('assigns distinct times to concurrent drafts and retains an existing choice on edits',async()=>{
  const posts=await Promise.all([savePost({text:'First draft'}),savePost({text:'Second draft'})]);
  expect(new Set(posts.map(p=>p.scheduled_at)).size).toBe(2);
  for(const post of posts){expect(post.status).toBe('draft');expect(new Date(post.scheduled_at!).getTime()).toBeGreaterThan(Date.now());}
  const edited=await savePost({text:'Edited draft',scheduled_at:null,revision:posts[0].revision},posts[0].id);
  expect(edited.scheduled_at).toBe(posts[0].scheduled_at);
 });
 it('repairs missing draft times once without changing approval or existing schedules',async()=>{
  const scheduled=await due();
  const untimed=(await one(sql`INSERT INTO posts(text,status) VALUES('Needs a proposed time','draft') RETURNING *`))!;
  const chosen=await savePost({text:'Already has a time',scheduled_at:'2099-10-20T09:00:00+03:00'});
  const changed=await assignMissingDraftTimes();
  expect(changed).toHaveLength(1);expect(changed[0]).toMatchObject({id:untimed.id,status:'draft'});
  expect(new Date(changed[0].scheduled_at).getTime()).toBeGreaterThan(Date.now());
  expect(await one(sql`SELECT * FROM posts WHERE id=${scheduled!.id}::uuid`)).toEqual(scheduled);
  expect(await one(sql`SELECT * FROM posts WHERE id=${chosen.id}::uuid`)).toEqual(chosen);
  const revision=await one(sql`SELECT snapshot FROM revisions WHERE post_id=${untimed.id}::uuid`);
  expect(revision!.snapshot.scheduled_at).toBeNull();
  expect(await assignMissingDraftTimes()).toHaveLength(0);
 });
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
describe('evidence-led generation',()=>{
 async function source(permission=true,kind='founder'){return (await one(sql`INSERT INTO growth_sources(title,text,kind,hypothesis,confirmed,permission) VALUES('Перший запуск','Допомагаю почати з однієї групи',${kind},'transition',true,${permission}) RETURNING *`))!;}
 function candidate(id:string){return {evidenceId:id,hypothesis:'transition',text:'Почніть з однієї групи. Допоможу перевірити перший робочий сценарій.',alternative:'Можемо разом перевірити роботу однієї групи.',category:'founder',topic:'Допомога на старті',reason:'Гіпотеза переходу',sourceUrls:[],trendId:null,verified:true,concerns:[]};}
 function mock(p:any){vi.mocked(generate).mockImplementation(async kind=>kind==='plan-review'?{accepted:true,issues:[]}:{posts:[p]});}
 it('keeps a generated proposal away from a time already assigned to another draft',async()=>{
  const owner=await savePost({text:'Owner draft',scheduled_at:'2099-10-20T18:00:00+03:00'});
  const e=await source();mock(candidate(e.id));await prepareDay('2099-10-20');
  const generated=await one(sql`SELECT * FROM posts WHERE generated`);
  expect(generated!.status).toBe('draft');
  expect(Math.abs(Date.parse(generated!.scheduled_at)-Date.parse(owner.scheduled_at!))).toBeGreaterThanOrEqual(90*60_000);
 });
 it('fails without evidence before calling the provider',async()=>{await expect(prepareDay('2099-10-20')).rejects.toMatchObject({code:'EVIDENCE_REQUIRED'});expect(generate).not.toHaveBeenCalled();expect(await rows(sql`SELECT * FROM posts`)).toHaveLength(0);});
 it('does not use a private customer story without permission',async()=>{await source(false,'customer');await expect(prepareDay('2099-10-20')).rejects.toMatchObject({code:'EVIDENCE_REQUIRED'});expect(generate).not.toHaveBeenCalled();});
 it('creates a draft with source and hypothesis, never a scheduled post',async()=>{const e=await source();mock(candidate(e.id));await prepareDay('2099-10-20');const p=await one(sql`SELECT * FROM posts`);expect(p).toMatchObject({status:'draft',evidence_id:e.id,hypothesis:'transition'});await publishDue();expect(threads).not.toHaveBeenCalled();});
 it('rejects fabricated evidence and unsupported claims',async()=>{await source();mock({...candidate(randomUUID()),verified:false,concerns:['No evidence']});await expect(prepareDay('2099-10-20')).rejects.toThrow();expect(await rows(sql`SELECT * FROM posts`)).toHaveLength(0);});
 it('preserves existing drafts on failed regeneration',async()=>{const old=await readyPost();const e=await source();mock({...candidate(e.id),verified:false,concerns:['No evidence']});await expect(prepareDay('2099-10-20',{regenerate:true})).rejects.toThrow();expect(await one(sql`SELECT * FROM posts WHERE id=${old.id}::uuid`)).toEqual(old);});
 it('refuses replacement when a send is unresolved',async()=>{await source();const old=await readyPost();await rows(sql`UPDATE posts SET status='unknown' WHERE id=${old.id}::uuid`);await expect(prepareDay('2099-10-20',{regenerate:true})).rejects.toMatchObject({statusCode:409});expect(generate).not.toHaveBeenCalled();});
 it('requires an owner scheduling action and rejects revoked sources',async()=>{const e=await source();mock(candidate(e.id));await prepareDay('2099-10-20');const p=(await one(sql`SELECT * FROM posts`))!;const approved=await savePost({...p,scheduled_at:new Date(p.scheduled_at).toISOString(),status:'scheduled'},p.id);expect(approved.status).toBe('scheduled');await rows(sql`UPDATE growth_sources SET confirmed=false WHERE id=${e.id}::uuid`);await rows(sql`UPDATE posts SET scheduled_at=now()-interval '1 minute' WHERE id=${p.id}::uuid`);await publishDue();expect(threads).not.toHaveBeenCalled();expect(await one(sql`SELECT status FROM posts WHERE id=${p.id}::uuid`)).toMatchObject({status:'blocked'});});
 it('does not generate on weekends',async()=>{const day=DateTime.fromISO('2099-10-20').set({weekday:6}).toISODate()!;expect(await prepareDay(day)).toMatchObject({count:0,skipped:true});expect(generate).not.toHaveBeenCalled();});
 it('rejects a source revoked during generation without replacing the queue',async()=>{const e=await source(),old=await readyPost();vi.mocked(generate).mockImplementation(async kind=>{if(kind==='plan-review'){await rows(sql`UPDATE growth_sources SET confirmed=false WHERE id=${e.id}::uuid`);return {accepted:true,issues:[]};}return {posts:[candidate(e.id)]};});await expect(prepareDay('2099-10-20',{regenerate:true})).rejects.toThrow();expect(await one(sql`SELECT * FROM posts WHERE id=${old.id}::uuid`)).toEqual(old);});
});
describe('school attribution and source API',()=>{
 it('imports research unconfirmed and creates one manually linked discussion only after review',async()=>{
  const headers=await login();
  const response=await app.inject({method:'POST',url:'/api/growth/sources',headers,payload:{title:'Выбор CRM',text:'Владелец школы сравнивает варианты учёта.',url:'https://www.threads.com/@school/post/example',author:'school',kind:'public',hypothesis:'accounting'}});
  expect(response.statusCode).toBe(200);const source=response.json();expect(source.confirmed).toBe(false);
  const url=`/api/growth/sources/${source.id}/reply`;
  expect((await app.inject({method:'POST',url,headers})).statusCode).toBe(409);
  expect((await app.inject({method:'PATCH',url:`/api/growth/sources/${source.id}`,headers,payload:{confirmed:true,permission:false}})).statusCode).toBe(200);
  for(let i=0;i<2;i++){const reply=await app.inject({method:'POST',url,headers});expect(reply.statusCode).toBe(200);expect(reply.json()).toMatchObject({provider_id:`manual:${source.id}`,kind:'opportunity',username:'school'});}
  expect(await rows(sql`SELECT * FROM replies`)).toHaveLength(1);expect(threads).not.toHaveBeenCalled();
 });
 it('protects growth data with authentication and CSRF',async()=>{expect((await app.inject('/api/growth')).statusCode).toBe(401);const headers=await login();expect((await app.inject({method:'POST',url:'/api/growth/schools',headers:{cookie:headers.cookie},payload:{}})).statusCode).toBe(403);});
 it('deduplicates school identity and corrects an event without inferring stages',async()=>{const headers=await login(),payload={name:'Test school',key:'EXAMPLE.SCHOOL',qualified:true};const school=await app.inject({method:'POST',url:'/api/growth/schools',headers,payload});expect(school.statusCode).toBe(200);expect((await app.inject({method:'POST',url:'/api/growth/schools',headers,payload:{...payload,key:'example.school'}})).statusCode).toBe(409);const event={stage:'paid',happened_at:new Date().toISOString(),attribution:'unknown',proof:'Платёж проверен владельцем'};for(let i=0;i<2;i++)expect((await app.inject({method:'PUT',url:'/api/growth/schools/'+school.json().id+'/event',headers,payload:event})).statusCode).toBe(200);const data=await app.inject({url:'/api/growth',headers});expect(data.json().events).toHaveLength(1);expect(data.json().events[0]).toMatchObject({stage:'paid',attribution:'unknown',source:''});});
 it('does not send manually linked discussions through guessed provider ids',async()=>{const r=await one(sql`INSERT INTO replies(provider_id,username,text,draft,kind,created_at) VALUES('manual:test','school','Source','Відповідь','opportunity',now()) RETURNING id`);await expect(sendReply(r!.id)).rejects.toMatchObject({statusCode:409});expect(threads).not.toHaveBeenCalled();});
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
 it('limits automatic reply preparation to five drafts per Kyiv day across polls',async()=>{
  const key=config.deepseekKey;config.deepseekKey='integration-only';
  try{
   for(let i=0;i<4;i++)await rows(sql`INSERT INTO replies(provider_id,username,text,draft,drafted_at,created_at) VALUES(${'prepared-'+i},'school','Question','Відповідь',now(),now())`);
   for(let i=0;i<2;i++)await rows(sql`INSERT INTO replies(provider_id,username,text,created_at) VALUES(${'pending-'+i},'school','Question',now())`);
   vi.mocked(generate).mockResolvedValue({draft:'Що хочете перевірити для своєї школи?',reason:'Уточнение задачи',classification:'question',meaningful:true});
   await collectReplies();await collectReplies();expect(generate).toHaveBeenCalledTimes(1);
   expect(await rows(sql`SELECT id FROM replies WHERE drafted_at IS NOT NULL`)).toHaveLength(5);
  }finally{config.deepseekKey=key;}
 });
 it('labels imported history and preserves missing metrics',async()=>{const p=await one(sql`INSERT INTO posts(text,status,provider_id,published_at) VALUES('old','published','old-id',now()-interval '20 days') RETURNING id`);vi.mocked(threads).mockResolvedValue({data:[{name:'views',values:[{value:0}]}]});await collectMetrics();const metrics=await rows(sql`SELECT * FROM metrics WHERE post_id=${p!.id}::uuid`);expect(metrics).toHaveLength(1);expect(metrics[0]).toMatchObject({checkpoint:'import',views:0,likes:null,follows:null});});
 it('does not resend an ambiguous reply',async()=>{const r=await one(sql`INSERT INTO replies(provider_id,username,text,draft,state,created_at) VALUES('reply','person','Question',${texts[1]},'draft',now()) RETURNING id`);vi.mocked(threads).mockImplementation(async endpoint=>{if(endpoint==='me/threads_publish')throw new ProviderError(0,'publish',true);return endpoint==='me/threads'?{id:'container'}:{status:'FINISHED'};});await expect(sendReply(r!.id)).rejects.toThrow();await expect(sendReply(r!.id)).rejects.toMatchObject({statusCode:409});expect(vi.mocked(threads).mock.calls.filter(c=>c[0]==='me/threads_publish')).toHaveLength(1);});
});
describe('browser publishing transport',()=>{
 it.each([
  {interval:60,offset:0,linked:true,previousMinutes:61,sends:true},
  {interval:90,offset:0,linked:true,previousMinutes:61,sends:false},
  {interval:60,offset:0,linked:false,previousMinutes:61,sends:false},
  {interval:60,offset:-1,linked:true,previousMinutes:61,sends:false},
  {interval:60,offset:0,linked:true,previousMinutes:59,sends:false},
 ])('uses hourly spacing only for the matching plan: %j',async({interval,offset,linked,previousMinutes,sends})=>{
  config.publishingMode='browser';
  const plan=(await one(sql`INSERT INTO daily_plans(day,status,count,slots,min_interval_minutes) VALUES((now() AT TIME ZONE 'Europe/Kyiv')::date+${offset}::integer,'ready',8,'[]',${interval}) RETURNING day`))!;
  await rows(sql`INSERT INTO posts(text,status,published_at) VALUES('Previous post','published',now()-${previousMinutes}::integer*interval '1 minute')`);
  const p=await due();
  if(linked)await rows(sql`UPDATE posts SET plan_day=${plan.day}::date WHERE id=${p!.id}::uuid`);
  vi.mocked(publishInBrowser).mockImplementation(async(post,beforeSend)=>{
   await beforeSend([],new Date().toISOString());
   return {url:'https://www.threads.com/@mimiao.crm/post/compact-test',timestamp:new Date().toISOString(),text:post.text,images:0};
  });
  await publishDue();
  expect(publishInBrowser).toHaveBeenCalledTimes(sends?1:0);
  expect((await one(sql`SELECT status FROM posts WHERE id=${p!.id}::uuid`))!.status).toBe(sends?'published':'scheduled');
 });
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
 it('preserves a manual pause made before the browser click',async()=>{
  config.publishingMode='browser';await due();
  vi.mocked(publishInBrowser).mockImplementation(async(_post,beforeSend)=>{
   await rows(sql`UPDATE settings SET value=jsonb_set(value,'{paused}','true')`);
   await beforeSend([],new Date().toISOString());throw new Error('unreachable');
  });
  await publishDue();
  expect((await one(sql`SELECT status FROM posts`))!.status).toBe('blocked');
  expect((await one(sql`SELECT phase FROM publish_attempts`))!.phase).toBe('failed');
 });
 it('continues other posts while an uncertain browser send is reconciled without resending',async()=>{
  config.publishingMode='browser';const p=await due();
  vi.mocked(publishInBrowser).mockImplementation(async(_post,beforeSend)=>{await beforeSend([],new Date().toISOString());throw new Error('browser closed after click');});
  await publishDue();
  expect((await one(sql`SELECT status FROM posts WHERE id=${p!.id}::uuid`))!.status).toBe('unknown');
  expect((await one(sql`SELECT value FROM settings`))!.value.paused).toBe(false);
  const next=await due();
  await rows(sql`UPDATE posts SET text=${texts[1]} WHERE id=${next!.id}::uuid`);
  vi.mocked(reconcileBrowserBatch).mockResolvedValue(new Map());
  await reconcile();
  vi.mocked(publishInBrowser).mockImplementation(async(post,beforeSend)=>{
   await beforeSend([],new Date().toISOString());
   return {url:'https://www.threads.com/@mimiao.crm/post/next',timestamp:new Date().toISOString(),text:post.text,images:0};
  });
  await publishDue();await publishDue();
  expect((await one(sql`SELECT status FROM posts WHERE id=${next!.id}::uuid`))!.status).toBe('published');
  expect((await one(sql`SELECT status FROM posts WHERE id=${p!.id}::uuid`))!.status).toBe('unknown');
  expect(vi.mocked(publishInBrowser).mock.calls.map(([post])=>post.id)).toEqual([p!.id,next!.id]);
  vi.mocked(reconcileBrowserBatch).mockResolvedValue(new Map([[p!.id,{url:'https://www.threads.com/@mimiao.crm/post/abc',timestamp:new Date().toISOString(),text:p!.text,images:0}]]));
  await reconcile();
  expect((await one(sql`SELECT status FROM posts WHERE id=${p!.id}::uuid`))!.status).toBe('published');
  expect(await rows(sql`SELECT id FROM publish_attempts WHERE post_id=${p!.id}::uuid`)).toHaveLength(1);
  expect(publishInBrowser).toHaveBeenCalledTimes(2);
 });
 it('preserves an owner pause after an uncertain send is reconciled',async()=>{
  config.publishingMode='browser';const p=await due();
  vi.mocked(publishInBrowser).mockImplementation(async(_post,beforeSend)=>{await beforeSend([],new Date().toISOString());throw new Error('browser closed after click');});
  await publishDue();
  expect((await one(sql`SELECT status FROM posts WHERE id=${p!.id}::uuid`))!.status).toBe('unknown');
  await rows(sql`UPDATE settings SET value=jsonb_set(value,'{paused}','true')`);
  const next=await due();
  vi.mocked(reconcileBrowserBatch).mockResolvedValue(new Map([[p!.id,{url:'https://www.threads.com/@mimiao.crm/post/abc',timestamp:new Date().toISOString(),text:p!.text,images:0}]]));
  await reconcile();await publishDue();
  expect((await one(sql`SELECT status FROM posts WHERE id=${p!.id}::uuid`))!.status).toBe('published');
  expect((await one(sql`SELECT value FROM settings`))!.value.paused).toBe(true);
  expect((await one(sql`SELECT status FROM posts WHERE id=${next!.id}::uuid`))!.status).toBe('scheduled');
  expect(publishInBrowser).toHaveBeenCalledTimes(1);
  expect(await rows(sql`SELECT id FROM publish_attempts WHERE post_id=${p!.id}::uuid`)).toHaveLength(1);
 });
 it('isolates a known browser failure and publishes the next scheduled post',async()=>{
  config.publishingMode='browser';const p=await due();
  vi.mocked(publishInBrowser).mockRejectedValue(new Error('browser preflight failed'));
  await publishDue();
  expect((await one(sql`SELECT status FROM posts WHERE id=${p!.id}::uuid`))!.status).toBe('blocked');
  expect((await one(sql`SELECT value FROM settings`))!.value.paused).toBe(false);
  expect((await one(sql`SELECT phase,sending_at FROM publish_attempts WHERE post_id=${p!.id}::uuid`))).toMatchObject({phase:'failed',sending_at:null});
  const next=await due();
  vi.mocked(publishInBrowser).mockImplementation(async(post,beforeSend)=>{
   await beforeSend([],new Date().toISOString());
   return {url:'https://www.threads.com/@mimiao.crm/post/next',timestamp:new Date().toISOString(),text:post.text,images:0};
  });
  await publishDue();await publishDue();
  expect((await one(sql`SELECT status FROM posts WHERE id=${next!.id}::uuid`))!.status).toBe('published');
  expect(vi.mocked(publishInBrowser).mock.calls.map(([post])=>post.id)).toEqual([p!.id,next!.id]);
  expect(await rows(sql`SELECT id FROM publish_attempts WHERE post_id=${p!.id}::uuid`)).toHaveLength(1);
 });
 it('never launches a browser for a disabled publisher',async()=>{
  config.publishingMode='browser';config.livePublishing=false;await due();await publishDue();expect(publishInBrowser).not.toHaveBeenCalled();
 });
});
