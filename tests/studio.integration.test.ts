import { beforeAll,beforeEach,afterAll,describe,it,expect,vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { DateTime } from 'luxon';
vi.mock('../server/providers/threads',()=>({connection:vi.fn(async()=>({username:'mimiao.crm'})),threads:vi.fn(),paged:vi.fn(async()=>[]),mediaFields:'id,text',refreshToken:vi.fn()}));
vi.mock('../server/providers/deepseek',()=>({generate:vi.fn(),search:vi.fn(async()=>[])}));
vi.mock('../server/browser/publisher',()=>({publishInBrowser:vi.fn(),reconcileBrowser:vi.fn(),browserPublishError:vi.fn()}));
import { pool,sql,rows,one } from '../server/db';
import { migrate } from '../server/migrate';
import { defaults } from '../server/defaults';
import { createApp } from '../server/app';
import { savePost } from '../server/services/posts';
import { prepareDay } from '../server/services/generation';
import { writeDayPlan } from '../server/services/plan-write';
import { publishDue,reconcile } from '../server/services/publishing';
import { collectMetrics } from '../server/services/analytics';
import { sendReply } from '../server/services/discussions';
import { threads,paged } from '../server/providers/threads';
import { generate } from '../server/providers/deepseek';
import { AppError,ProviderError } from '../server/errors';
import { config } from '../server/config';
import { publishInBrowser,reconcileBrowser } from '../server/browser/publisher';
import { connection } from '../server/providers/threads';
const texts=['Що допомагає вам пояснити складну тему простими словами?','Чи є у вас улюблений спосіб почати перше заняття з новою групою?','Як ви домовляєтесь про перенесення уроків без зайвого листування?','Яка маленька перемога учня запам’яталася вам цього тижня?','Що ви змінили б у своєму робочому розкладі, якби починали спочатку?'];
let app:Awaited<ReturnType<typeof createApp>>;
beforeAll(async()=>{expect(new URL(config.databaseUrl).pathname).toBe('/studio_test');await migrate();app=await createApp();await app.ready();});
beforeEach(async()=>{vi.clearAllMocks();vi.mocked(connection).mockResolvedValue({username:'mimiao.crm'});config.publishingMode='api';await pool.query('TRUNCATE posts,revisions,publish_attempts,media,metrics,account_metrics,replies,operations,daily_plans,generation_runs,trends,ideas,experiments,reports,sessions,connections,browser_status CASCADE');await rows(sql`UPDATE settings SET value=${JSON.stringify({...defaults,dailyCount:5,paused:false})}::jsonb WHERE id=1`);config.livePublishing=true;});
afterAll(async()=>{await app.close();await pool.end();});
async function due(media:string[]=[]){return one(sql`INSERT INTO posts(text,status,scheduled_at,media_ids) VALUES(${texts[0]},'scheduled',now()-interval '1 minute',${JSON.stringify(media)}::jsonb) RETURNING *`);}
async function login(){const r=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin:config.publicUrl},payload:{password:'integration-password'}});expect(r.statusCode).toBe(200);return{cookie:r.headers['set-cookie']!.toString().split(';')[0],origin:config.publicUrl,'x-csrf-token':r.json().csrf};}
const freshTexts=[...texts,'Які запитання батьків допомагають вам краще зрозуміти потреби дитини?','Як ви обираєте матеріали для творчих завдань у класі?','Що дає вам натхнення для навчання під час канікул?','Який формат зворотного зв’язку найзручніший для ваших колег?','Про що ви хотіли б поговорити на наступній зустрічі освітян?'];
function planPosts(count=5){return freshTexts.slice(0,count).map((text,i)=>({text,alternative:text,category:'teaching' as const,topic:`Нова тема ${i}`,reason:'Обсуждение',sourceUrls:[],trendId:null,verified:true,concerns:[]}));}
function mockPlan(count=5){vi.mocked(generate).mockResolvedValue({posts:planPosts(count)});}
async function readyPlan(){await rows(sql`INSERT INTO daily_plans(day,status,count,slots) VALUES('2099-10-20','ready',5,'[]')`);}
async function readyPost(){await readyPlan();return (await one(sql`INSERT INTO posts(text,status,scheduled_at,plan_day,slot) VALUES('Попереднє запитання','scheduled','2099-10-20T09:00:00+03:00','2099-10-20',0) RETURNING *`))!;}
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
 it.each(['text','alternative'] as const)('identifies the exact duplicate %s field for repair without partial inserts',async field=>{
  const originalText=planPosts()[0].text;
  const original=(await one(sql`INSERT INTO posts(text,status,published_at) VALUES(${originalText},'published',now()) RETURNING *`))!;
  const fresh='Вчителі, запропонуйте учневі намалювати карту понять кольоровими олівцями.';
  const valid=planPosts().map((p,i)=>i===0?{...p,text:fresh,alternative:fresh}:p);
  const invalid=valid.map((p,i)=>i===0?{...p,[field]:originalText}:p);
  vi.mocked(generate).mockResolvedValueOnce({posts:invalid}).mockImplementationOnce(async()=>{
   expect(await rows(sql`SELECT * FROM posts`)).toEqual([original]);
   expect(await rows(sql`SELECT * FROM posts WHERE generated=true`)).toHaveLength(0);
   return {posts:valid};
  });
  expect(await prepareDay('2099-10-20')).toEqual({day:'2099-10-20',count:5});
  expect(generate).toHaveBeenCalledTimes(2);
  for(const call of vi.mocked(generate).mock.calls){
   expect((call[2] as {history:unknown[]}).history).toEqual([{topic:original.topic,category:original.category}]);
  }
  expect(vi.mocked(generate).mock.calls[1][2]).toMatchObject({previousDraft:{posts:invalid}});
  const feedback=(vi.mocked(generate).mock.calls[1][2] as {validationErrors:string[]}).validationErrors.join(' ');
  expect(feedback).toContain(`posts[0].${field}`);expect(feedback).toContain('Слишком похоже');
  expect(vi.mocked(generate).mock.calls[0][1]).toContain('Product posts are optional');
  expect(await rows(sql`SELECT * FROM posts`)).toHaveLength(6);
  expect(await rows(sql`SELECT * FROM posts WHERE generated=true`)).toHaveLength(5);
  expect(await one(sql`SELECT * FROM posts WHERE id=${original.id}::uuid`)).toEqual(original);
 });
 it('accepts five ordinary educator suggestions without counting them as product calls',async()=>{
  const posts=planPosts().map(p=>({...p,text:`Вчителі, спробуйте обговорити: ${p.text}`}));
  vi.mocked(generate).mockResolvedValue({posts});
  expect(await prepareDay('2099-10-20')).toEqual({day:'2099-10-20',count:5});
  expect(generate).toHaveBeenCalledTimes(1);
  expect(await rows(sql`SELECT * FROM posts`)).toHaveLength(5);
 });
 it('still rejects multiple distinct product solicitations after three attempts',async()=>{
  const posts=planPosts().map((p,i)=>i<2?{...p,text:`Власники шкіл, спробуйте Mimiao. ${p.text}`,category:'product' as const}:p);
  vi.mocked(generate).mockResolvedValue({posts});
  await expect(prepareDay('2099-10-20')).rejects.toMatchObject({code:'GENERATION_INVALID',message:'Слишком много рекламных призывов'});
  expect(generate).toHaveBeenCalledTimes(3);
  expect(await rows(sql`SELECT * FROM posts`)).toHaveLength(0);
 });
 it.each(['source','trend'])('repairs repeated %s evidence before persisting the complete plan',async kind=>{
  const url='https://example.org/confirmed-topic';
  const trend=(await one(sql`INSERT INTO trends(title,summary,angle,evidence,score,confidence,expires_at) VALUES('Тема','Опис','Порада',${JSON.stringify([{url}])}::jsonb,1,'high','2099-10-22T22:00:00+03:00') RETURNING *`))!;
  const withEvidence=(uses:number)=>planPosts().map((p,i)=>({...p,sourceUrls:kind==='source'&&i<uses?[url]:[],trendId:kind==='trend'&&i<uses?trend.id:null}));
  vi.mocked(generate).mockResolvedValueOnce({posts:withEvidence(3)}).mockImplementationOnce(async()=>{
   expect(await rows(sql`SELECT * FROM posts`)).toHaveLength(0);
   expect(await rows(sql`SELECT * FROM revisions`)).toHaveLength(0);
   return {posts:withEvidence(2)};
  });
  expect(await prepareDay('2099-10-20')).toEqual({day:'2099-10-20',count:5});
  expect(generate).toHaveBeenCalledTimes(2);
  const feedback=(vi.mocked(generate).mock.calls[1][2] as {validationErrors:string[]}).validationErrors.join(' ');
  expect(feedback).toContain(kind==='source'?`источник ${url}`:`тренд ${trend.id}`);expect(feedback).toContain('максимум 2');
  const posts=await rows(sql`SELECT * FROM posts ORDER BY slot`);expect(posts).toHaveLength(5);
  expect(posts.map(p=>p.text)).toEqual(planPosts().map(p=>p.text));
  expect(posts.filter(p=>kind==='source'?p.sources.length>0:p.expires_at!==null)).toHaveLength(2);
  expect(posts.every(p=>p.status==='scheduled'&&p.generated)).toBe(true);
 });
 it('preserves the old plan and revisions after three diversity failures',async()=>{
  const old=await readyPost(),url='https://example.org/overused-topic';
  await rows(sql`INSERT INTO trends(title,summary,angle,evidence,score,confidence,expires_at) VALUES('Тема','Опис','Порада',${JSON.stringify([{url}])}::jsonb,1,'high','2099-10-22T22:00:00+03:00')`);
  await rows(sql`INSERT INTO revisions(post_id,revision,snapshot,reason) VALUES(${old.id}::uuid,0,${JSON.stringify(old)}::jsonb,'Существующая правка')`);
  const revisions=await rows(sql`SELECT * FROM revisions`);
  vi.mocked(generate).mockResolvedValue({posts:planPosts().map((p,i)=>({...p,sourceUrls:i<3?[url]:[]}))});
  await expect(prepareDay('2099-10-20',{regenerate:true})).rejects.toMatchObject({code:'GENERATION_INVALID'});
  expect(generate).toHaveBeenCalledTimes(3);expect(await rows(sql`SELECT * FROM posts`)).toEqual([old]);
  expect(await rows(sql`SELECT * FROM revisions`)).toEqual(revisions);
  expect(await one(sql`SELECT status FROM daily_plans`)).toMatchObject({status:'failed'});
 });
 it('claims a day once across concurrent requests',async()=>{vi.mocked(generate).mockResolvedValue({posts:texts.map(text=>({text,alternative:text,category:'teaching',topic:'Вопрос',reason:'Обсуждение',sourceUrls:[],trendId:null,verified:true,concerns:[]}))});await Promise.all([prepareDay('2099-10-20'),prepareDay('2099-10-20')]);expect(generate).toHaveBeenCalledTimes(1);expect((await rows(sql`SELECT * FROM posts`))).toHaveLength(5);});
 it('creates ten future posts when configured for ten',async()=>{
  await rows(sql`UPDATE settings SET value=jsonb_set(value,'{dailyCount}','10')`);mockPlan(10);
  expect(await prepareDay('2099-10-20')).toEqual({day:'2099-10-20',count:10});
  const posts=await rows(sql`SELECT * FROM posts`);expect(posts).toHaveLength(10);
  for(const p of posts){expect(p).toMatchObject({status:'scheduled',plan_day:'2099-10-20'});expect(new Date(p.scheduled_at).getTime()).toBeGreaterThan(Date.now());expect(DateTime.fromJSDate(new Date(p.scheduled_at)).setZone('Europe/Kyiv').toISODate()).toBe('2099-10-20');}
  expect(await one(sql`SELECT status,count FROM daily_plans`)).toMatchObject({status:'ready',count:10});
 });
 it.each([false,true])('repairs an unknown source URL before committing ten posts (external sources: %s)',async(hasSources)=>{
  await rows(sql`UPDATE settings SET value=jsonb_set(value,'{dailyCount}','10')`);
  const evidenceUrl='https://example.org/educator-study',ideaUrl='https://example.org/classroom-idea',invalidUrl='https://mimiao.example/invented-evidence';
  if(hasSources){
   await rows(sql`INSERT INTO trends(title,summary,angle,evidence,score,confidence,expires_at) VALUES('Тема','Опис','Питання',${JSON.stringify([{url:evidenceUrl},{url:evidenceUrl},{note:'No URL'}])}::jsonb,1,'high','2099-10-22T22:00:00+03:00')`);
   await rows(sql`INSERT INTO ideas(text,source_url) VALUES('Ідея',${ideaUrl}),('Повтор',${evidenceUrl}),('Без джерела','')`);
  }
  const valid=planPosts(10),invalid=valid.map((p,i)=>({...p,sourceUrls:i===0?[invalidUrl]:[]}));
  vi.mocked(generate).mockResolvedValueOnce({posts:invalid}).mockImplementationOnce(async()=>{expect(await rows(sql`SELECT * FROM posts`)).toHaveLength(0);return {posts:valid};});
  expect(await prepareDay('2099-10-20')).toEqual({day:'2099-10-20',count:10});
  expect(generate).toHaveBeenCalledTimes(2);
  const allowedSourceUrls=hasSources?[evidenceUrl,ideaUrl]:[];
  for(const call of vi.mocked(generate).mock.calls){expect(call[2]).toMatchObject({allowedSourceUrls});expect(call[4]).toEqual(allowedSourceUrls);}
  const repair=vi.mocked(generate).mock.calls[1][2] as {validationErrors:string[]};
  expect(repair.validationErrors.join(' ')).toContain('posts[0].sourceUrls');expect(repair.validationErrors.join(' ')).toContain(invalidUrl);expect(repair.validationErrors.join(' ')).toContain('allowedSourceUrls');expect(repair.validationErrors.join(' ')).toContain('[]');
  const posts=await rows(sql`SELECT * FROM posts`);expect(posts).toHaveLength(10);expect(posts.every(p=>p.status==='scheduled'&&p.generated&&p.sources.length===0)).toBe(true);expect(await one(sql`SELECT status,count,attempts FROM daily_plans`)).toMatchObject({status:'ready',count:10,attempts:1});
 });
 it('retains audience and source validation feedback together on the third attempt',async()=>{
  await rows(sql`UPDATE settings SET value=jsonb_set(value,'{dailyCount}','10')`);
  const audienceError='Стиль общения Mimiao: posts[0].text не начинается с обращения к аудитории. Начните с «Вчителі,».';
  const invalidUrl='https://example.org/unsupported-source';
  const valid=planPosts(10).map(p=>({...p,text:`Вчителі, ${p.text}`,alternative:`Репетитори, ${p.alternative}`}));
  const invalid=valid.map((p,i)=>({...p,sourceUrls:i===0?[invalidUrl]:[]}));
  vi.mocked(generate).mockRejectedValueOnce(new AppError(502,audienceError,'GENERATION_STYLE_INVALID')).mockResolvedValueOnce({posts:invalid}).mockImplementationOnce(async()=>{expect(await rows(sql`SELECT * FROM posts`)).toHaveLength(0);return {posts:valid};});
  expect(await prepareDay('2099-10-20')).toEqual({day:'2099-10-20',count:10});expect(generate).toHaveBeenCalledTimes(3);
  const calls=vi.mocked(generate).mock.calls;
  expect(calls[1][2]).toMatchObject({validationErrors:[audienceError]});
  const finalInput=calls[2][2] as {validationErrors:string[]};
  expect(finalInput.validationErrors).toHaveLength(2);expect(finalInput.validationErrors[0]).toBe(audienceError);expect(finalInput.validationErrors[1]).toContain(invalidUrl);expect(finalInput.validationErrors.every(error=>error.length<=1500)).toBe(true);
  expect(calls[2][1]).toContain('correct them together without violating any other constraints');
  const posts=await rows(sql`SELECT * FROM posts`);expect(posts).toHaveLength(10);expect(posts.every(p=>p.status==='scheduled'&&p.generated&&p.sources.length===0)).toBe(true);expect(await one(sql`SELECT status,count,attempts FROM daily_plans`)).toMatchObject({status:'ready',count:10,attempts:1});
 });
 it('regenerates only editable posts and retains revisions and media',async()=>{
  await readyPlan();const media=[randomUUID()];
  const original=(await one(sql`INSERT INTO posts(text,status,scheduled_at,plan_day,slot,media_ids) VALUES('Оригінальна тема','scheduled','2099-10-20T09:00:00+03:00','2099-10-20',0,${JSON.stringify(media)}::jsonb) RETURNING *`))!;
  const manual=(await one(sql`INSERT INTO posts(text,status,scheduled_at) VALUES('Ручна тема','blocked','2099-10-20T11:00:00+03:00') RETURNING *`))!;
  const published=(await one(sql`INSERT INTO posts(text,status,scheduled_at,published_at,plan_day,slot) VALUES('Опублікована тема','published','2099-10-20T08:00:00+03:00','2099-10-20T08:00:00+03:00','2099-10-20',1) RETURNING *`))!;
  const unrelated=(await one(sql`INSERT INTO posts(text,status,plan_day,slot) VALUES('Інший день','draft','2099-10-21',0) RETURNING *`))!;
  mockPlan();await prepareDay('2099-10-20',{regenerate:true});
  for(const old of [original,manual]){const stored=(await one(sql`SELECT * FROM posts WHERE id=${old.id}::uuid`))!;expect(stored).toMatchObject({status:'cancelled',text:old.text,media_ids:old.media_ids,revision:old.revision+1,plan_day:null,slot:null});expect(stored.scheduled_at).toBe(old.scheduled_at);}
  const revisions=await rows(sql`SELECT * FROM revisions ORDER BY post_id`);expect(revisions).toHaveLength(2);expect(revisions.every(r=>r.reason==='Перегенерация плана на 2099-10-20')).toBe(true);expect(revisions.find(r=>r.post_id===original.id)!.snapshot.media_ids).toEqual(media);
  for(const old of [published,unrelated])expect(await one(sql`SELECT * FROM posts WHERE id=${old.id}::uuid`)).toEqual(old);
  const fresh=await rows(sql`SELECT * FROM posts WHERE generated=true`);expect(fresh).toHaveLength(5);expect(fresh.every(p=>p.status==='scheduled'&&p.media_ids.length===0)).toBe(true);
  expect(new Set([published,...fresh].map(p=>p.slot)).size).toBe(6);
 });
 it('keeps the old plan on invalid regenerated output',async()=>{
  const old=await readyPost();mockPlan();vi.mocked(generate).mockResolvedValue({posts:planPosts().map(p=>({...p,verified:false,concerns:['Нет источника']}))});
  await expect(prepareDay('2099-10-20',{regenerate:true})).rejects.toMatchObject({statusCode:502});
  expect(generate).toHaveBeenCalledTimes(3);expect(await rows(sql`SELECT * FROM posts`)).toEqual([old]);expect(await rows(sql`SELECT * FROM revisions`)).toHaveLength(0);expect(await one(sql`SELECT status FROM daily_plans`)).toMatchObject({status:'failed'});
 });
 it('background retry after failed regeneration does not append another plan',async()=>{
  const old=await readyPost();vi.mocked(generate).mockResolvedValue({posts:planPosts().map(p=>({...p,verified:false,concerns:['Нет источника']}))});
  await expect(prepareDay('2099-10-20',{regenerate:true})).rejects.toMatchObject({statusCode:502});
  vi.mocked(generate).mockClear();mockPlan();
  await expect(prepareDay('2099-10-20')).rejects.toMatchObject({statusCode:409,message:'Предыдущий план сохранён. Используйте перегенерацию, чтобы заменить его.'});
  expect(generate).not.toHaveBeenCalled();expect(await rows(sql`SELECT * FROM posts`)).toEqual([old]);expect(await rows(sql`SELECT * FROM posts WHERE generated=true`)).toHaveLength(0);expect(await one(sql`SELECT status,attempts FROM daily_plans`)).toMatchObject({status:'failed',attempts:3});
 });
 it('retains the old plan when a trend expires before its recomputed slot',async()=>{
  const old=await readyPost();
  const protectedPost=(await one(sql`INSERT INTO posts(text,status,published_at,scheduled_at,plan_day,slot) VALUES('Опублікована тема','published','2099-10-20T09:00:00+03:00','2099-10-20T09:00:00+03:00','2099-10-20',1) RETURNING *`))!;
  const trend=(await one(sql`INSERT INTO trends(title,summary,angle,evidence,score,confidence,expires_at) VALUES('Тема','Опис','Питання','[]',1,'high','2099-10-20T22:00:00+03:00') RETURNING *`))!;
  const candidates=planPosts().map((p,i)=>({...p,trendId:i===4?trend.id:null}));
  await expect(writeDayPlan('2099-10-20',candidates,[trend],null,[old],true)).rejects.toMatchObject({statusCode:409,message:'Тема устареет до публикации. Повторите подготовку.'});
  expect(await one(sql`SELECT * FROM posts WHERE id=${old.id}::uuid`)).toEqual(old);expect(await one(sql`SELECT * FROM posts WHERE id=${protectedPost.id}::uuid`)).toEqual(protectedPost);expect(await rows(sql`SELECT * FROM posts WHERE generated=true`)).toHaveLength(0);expect(await rows(sql`SELECT * FROM revisions`)).toHaveLength(0);
 });
 it('rejects a concurrent owner edit without partial replacement',async()=>{
  const old=await readyPost();vi.mocked(generate).mockImplementation(async()=>{await rows(sql`UPDATE posts SET text='Змінено власником',revision=revision+1 WHERE id=${old.id}::uuid`);return {posts:planPosts()};});
  await expect(prepareDay('2099-10-20',{regenerate:true})).rejects.toMatchObject({statusCode:409,message:'План изменился во время подготовки. Повторите перегенерацию.'});
  expect(await rows(sql`SELECT text,status,revision FROM posts`)).toEqual([{text:'Змінено власником',status:'scheduled',revision:old.revision+1}]);expect(await rows(sql`SELECT * FROM revisions`)).toHaveLength(0);
 });
 it('only one concurrent regeneration replaces a ready plan',async()=>{
  const old=await readyPost();mockPlan();await Promise.all([prepareDay('2099-10-20',{regenerate:true}),prepareDay('2099-10-20',{regenerate:true})]);
  expect(generate).toHaveBeenCalledTimes(1);expect(await rows(sql`SELECT * FROM posts WHERE generated=true`)).toHaveLength(5);expect(await one(sql`SELECT status FROM posts WHERE id=${old.id}::uuid`)).toMatchObject({status:'cancelled'});
 });
 it('refuses regeneration during unresolved publication',async()=>{
  await readyPlan();mockPlan();const p=(await one(sql`INSERT INTO posts(text,status,scheduled_at) VALUES('Невідома публікація','unknown','2099-10-20T09:00:00+03:00') RETURNING id`))!;
  for(const status of ['unknown','publishing']){await rows(sql`UPDATE posts SET status=${status} WHERE id=${p.id}::uuid`);await expect(prepareDay('2099-10-20',{regenerate:true})).rejects.toMatchObject({statusCode:409});}
  expect(generate).not.toHaveBeenCalled();expect(await rows(sql`SELECT * FROM posts`)).toHaveLength(1);
 });
 it('prepares today with future automatic times',async()=>{
  // Fake only Date: PostgreSQL and provider mock timers continue to run normally.
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2099-10-20T11:00:00Z'));
  try{mockPlan();await prepareDay('2099-10-20');const posts=await rows(sql`SELECT * FROM posts`);expect(posts).toHaveLength(5);for(const p of posts){expect(p.status).toBe('scheduled');expect(new Date(p.scheduled_at).getTime()).toBeGreaterThan(Date.now());expect(DateTime.fromJSDate(new Date(p.scheduled_at)).setZone('Europe/Kyiv').toISODate()).toBe('2099-10-20');}}
  finally{vi.useRealTimers();}
 });
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
  expect((await one(sql`SELECT value FROM settings`))!.value.paused).toBe(false);
  const next=await due();
  await publishDue();expect(publishInBrowser).toHaveBeenCalledTimes(1);
  vi.mocked(reconcileBrowser).mockResolvedValue(null);
  await reconcile();await publishDue();
  expect(publishInBrowser).toHaveBeenCalledTimes(1);
  expect((await one(sql`SELECT status FROM posts WHERE id=${next!.id}::uuid`))!.status).toBe('scheduled');
  vi.mocked(reconcileBrowser).mockResolvedValue({url:'https://www.threads.com/@mimiao.crm/post/abc',timestamp:new Date().toISOString(),text:p!.text,images:0});
  await reconcile();expect(reconcileBrowser).toHaveBeenCalledTimes(2);
  expect((await one(sql`SELECT status FROM posts WHERE id=${p!.id}::uuid`))!.status).toBe('published');
  vi.mocked(publishInBrowser).mockImplementation(async(post,beforeSend)=>{
   await beforeSend([],new Date().toISOString());
   return {url:'https://www.threads.com/@mimiao.crm/post/next',timestamp:new Date().toISOString(),text:post.text,images:0};
  });
  await publishDue();
  expect((await one(sql`SELECT status FROM posts WHERE id=${next!.id}::uuid`))!.status).toBe('published');
  expect(publishInBrowser).toHaveBeenCalledTimes(2);
  expect(vi.mocked(publishInBrowser).mock.calls.map(([post])=>post.id)).toEqual([p!.id,next!.id]);
  expect(await rows(sql`SELECT id FROM publish_attempts WHERE post_id=${p!.id}::uuid`)).toHaveLength(1);
  expect(threads).not.toHaveBeenCalled();
 });
 it('preserves an owner pause after an uncertain send is reconciled',async()=>{
  config.publishingMode='browser';const p=await due();
  vi.mocked(publishInBrowser).mockImplementation(async(_post,beforeSend)=>{await beforeSend([],new Date().toISOString());throw new Error('browser closed after click');});
  await publishDue();
  expect((await one(sql`SELECT status FROM posts WHERE id=${p!.id}::uuid`))!.status).toBe('unknown');
  await rows(sql`UPDATE settings SET value=jsonb_set(value,'{paused}','true')`);
  const next=await due();
  vi.mocked(reconcileBrowser).mockResolvedValue({url:'https://www.threads.com/@mimiao.crm/post/abc',timestamp:new Date().toISOString(),text:p!.text,images:0});
  await reconcile();await publishDue();
  expect((await one(sql`SELECT status FROM posts WHERE id=${p!.id}::uuid`))!.status).toBe('published');
  expect((await one(sql`SELECT value FROM settings`))!.value.paused).toBe(true);
  expect((await one(sql`SELECT status FROM posts WHERE id=${next!.id}::uuid`))!.status).toBe('scheduled');
  expect(publishInBrowser).toHaveBeenCalledTimes(1);
  expect(await rows(sql`SELECT id FROM publish_attempts WHERE post_id=${p!.id}::uuid`)).toHaveLength(1);
 });
 it('pauses the queue on a known browser failure before the sending boundary',async()=>{
  config.publishingMode='browser';const p=await due();
  vi.mocked(publishInBrowser).mockRejectedValue(new Error('browser preflight failed'));
  await publishDue();
  expect((await one(sql`SELECT status FROM posts WHERE id=${p!.id}::uuid`))!.status).toBe('blocked');
  expect((await one(sql`SELECT value FROM settings`))!.value.paused).toBe(true);
  expect((await one(sql`SELECT phase,sending_at FROM publish_attempts WHERE post_id=${p!.id}::uuid`))).toMatchObject({phase:'failed',sending_at:null});
  await due();await publishDue();
  expect(publishInBrowser).toHaveBeenCalledTimes(1);
 });
 it('never launches a browser for a disabled publisher',async()=>{
  config.publishingMode='browser';config.livePublishing=false;await due();await publishDue();expect(publishInBrowser).not.toHaveBeenCalled();
 });
});
