import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { DateTime } from 'luxon';
vi.mock('../server/providers/deepseek',()=>({generate:vi.fn(),search:vi.fn()}));
vi.mock('../server/providers/threads',()=>({connection:vi.fn(async()=>({username:'mimiao.crm'})),threads:vi.fn(),paged:vi.fn(async()=>[]),mediaFields:'id,text',refreshToken:vi.fn()}));
import { pool, sql, rows, one } from '../server/db';
import { config } from '../server/config';
import { migrate } from '../server/migrate';
import { defaults } from '../server/defaults';
import { ensureDailyQuota } from '../server/services/quota';
import { generate } from '../server/providers/deepseek';
import { AppError, ProviderError } from '../server/errors';
const quotaTexts=['Як ви перевіряєте, що оплата учня врахована саме за потрібний місяць?','Що у вашій школі відбувається, коли викладач переносить заняття в останній момент?','Хто у вашій команді першим помічає, що в учня закінчився абонемент?','Чи ведете ви окремо облік пробних занять і тих, хто після них залишився?','Як ви рахуєте оплату викладачу, якщо частина групи пропустила урок?','Що для вас важливіше під час переходу на нову CRM: історія оплат чи розклад?','Як батьки дізнаються у вашій школі про зміни в розкладі групи?','Скільки часу на тиждень забирає у вас звірка таблиці оплат із журналом занять?','Яке рішення у веденні обліку ви відкладаєте вже кілька місяців?','Що змусило б вас відмовитися від таблиць на користь окремої системи?'];
const NOW=new Date('2026-11-10T10:05:00Z'),DAY='2026-11-10';
const kyiv=(values:string[])=>values.map(v=>DateTime.fromJSDate(new Date(v)).setZone('Europe/Kyiv').toFormat('HH:mm'));
let n=0;
async function insertPost(f:{text:string;status:string;at:string;published?:boolean;generated?:boolean;planDay?:string;slot?:number}) {
 return (await one(sql`INSERT INTO posts(text,status,scheduled_at,published_at,generated,plan_day,slot) VALUES(${f.text},${f.status},${f.at}::timestamptz,${f.published?f.at:null}::timestamptz,${!!f.generated},${f.planDay??null}::date,${f.slot??null}::integer) RETURNING *`))!;
}
beforeAll(async()=>{expect(new URL(config.databaseUrl).pathname).toBe('/studio_test');await migrate();});
beforeEach(async()=>{
 vi.clearAllMocks();
 await pool.query('TRUNCATE posts,revisions,publish_attempts,daily_plans,operations,growth_sources CASCADE');
 await rows(sql`UPDATE settings SET value=${JSON.stringify({...defaults,paused:false})}::jsonb WHERE id=1`);
 config.livePublishing=true;config.publishingMode='api';n=0;
 vi.mocked(generate).mockImplementation(async()=>({evidenceId:null,text:quotaTexts[n++%quotaTexts.length],category:'founder',topic:'Тема '+n,reason:'Знання продукту'}) as any);
});
afterAll(async()=>{await pool.end();});
describe('daily quota',()=>{
 it("promotes today's generated drafts and fills the rest to eight",async()=>{
  await insertPost({text:'Наявний допис номер 1',status:'published',at:'2026-11-10T07:00:00Z',published:true});
  await insertPost({text:'Наявний допис номер 2',status:'published',at:'2026-11-10T09:00:00Z',published:true});
  const drafts=[];
  for(const [i,at] of ['2026-11-10T11:00:00Z','2026-11-10T13:00:00Z','2026-11-10T15:00:00Z'].entries())drafts.push(await insertPost({text:`Наявний допис номер ${i+3}`,status:'draft',at,generated:true,planDay:DAY,slot:i}));
  const manual=await insertPost({text:'Наявний допис номер 6',status:'draft',at:'2026-11-10T17:00:00Z'});
  const cancelled=await insertPost({text:'Наявний допис номер 7',status:'cancelled',at:'2026-11-10T19:00:00Z',generated:true});
  expect(await ensureDailyQuota(NOW)).toEqual({day:DAY,target:8,before:2,recycled:3,generated:3,after:8});
  for(const [i,d] of drafts.entries()){
   const row=(await one(sql`SELECT status,scheduled_at,revision FROM posts WHERE id=${d.id}::uuid`))!;
   expect(row.status).toBe('scheduled');
   expect(new Date(row.scheduled_at).toISOString()).toBe(['2026-11-10T11:00:00.000Z','2026-11-10T13:00:00.000Z','2026-11-10T15:00:00.000Z'][i]);
   expect(row.revision).toBe(d.revision+1);
   expect(await rows(sql`SELECT id FROM revisions WHERE post_id=${d.id}::uuid`)).toHaveLength(1);
  }
  const fresh=await rows(sql`SELECT * FROM posts WHERE generated AND text IN (SELECT jsonb_array_elements_text(${JSON.stringify(quotaTexts)}::jsonb)) ORDER BY slot`);
  expect(fresh).toHaveLength(3);
  expect(fresh.every(p=>p.status==='scheduled'&&p.evidence_id===null&&p.plan_day===DAY)).toBe(true);
  expect(fresh.map(p=>p.sources)).toEqual([[],[],[]]);
  expect(kyiv(fresh.map(p=>p.scheduled_at))).toEqual(['19:00','21:00','22:30']);
  expect(fresh.map(p=>p.slot)).toEqual([3,4,5]);
  expect((await one(sql`SELECT status FROM posts WHERE id=${manual.id}::uuid`))!.status).toBe('draft');
  expect((await one(sql`SELECT status FROM posts WHERE id=${cancelled.id}::uuid`))!.status).toBe('cancelled');
  expect(await one(sql`SELECT status,count FROM daily_plans WHERE day=${DAY}::date`)).toMatchObject({status:'ready',count:8});
  expect(vi.mocked(generate)).toHaveBeenCalledTimes(3);
  for(const call of vi.mocked(generate).mock.calls)expect(call[0]).toBe('evergreen');
  const ops=await rows(sql`SELECT status FROM operations WHERE kind='quota'`);
  expect(ops).toHaveLength(1);expect(ops[0].status).toBe('success');
 });
 it('does nothing when eight posts are already published or scheduled',async()=>{
  for(const [i,at] of ['06:00','07:00','08:00','09:00'].entries())await insertPost({text:`Наявний допис номер ${i+1}`,status:'published',at:`2026-11-10T${at}:00Z`,published:true});
  for(const [i,at] of ['12:00','14:00','16:00','18:00'].entries())await insertPost({text:`Наявний допис номер ${i+5}`,status:'scheduled',at:`2026-11-10T${at}:00Z`});
  expect(await ensureDailyQuota(NOW)).toMatchObject({before:8,recycled:0,generated:0,after:8});
  expect(generate).not.toHaveBeenCalled();
  expect(await rows(sql`SELECT id FROM operations WHERE kind='quota'`)).toHaveLength(0);
 });
 it('recycles missed posts and retries a blocked post only once',async()=>{
  const missed=await insertPost({text:'Наявний допис номер 1',status:'missed',at:'2026-11-10T07:00:00Z',generated:true});
  const a=await insertPost({text:'Наявний допис номер 2',status:'blocked',at:'2026-11-10T08:00:00Z',generated:true});
  const b=await insertPost({text:'Наявний допис номер 3',status:'blocked',at:'2026-11-10T08:30:00Z',generated:true});
  const c=await insertPost({text:'Найкраща CRM для вашої школи',status:'blocked',at:'2026-11-10T09:00:00Z',generated:true});
  const attempt=(post:Record<string,any>)=>rows(sql`INSERT INTO publish_attempts(post_id,revision,phase,transport) VALUES(${post.id}::uuid,${post.revision},'failed','api')`);
  await attempt(a);await attempt(b);await attempt(b);
  expect(await ensureDailyQuota(NOW)).toMatchObject({before:0,recycled:2,generated:6,after:8});
  const status=async(id:string)=>(await one(sql`SELECT status,scheduled_at FROM posts WHERE id=${id}::uuid`))!;
  const m=await status(missed.id),ar=await status(a.id);
  expect(m.status).toBe('scheduled');expect(kyiv([m.scheduled_at])).toEqual(['13:00']);
  expect(ar.status).toBe('scheduled');expect(kyiv([ar.scheduled_at])).toEqual(['15:00']);
  expect((await status(b.id)).status).toBe('blocked');
  expect((await status(c.id)).status).toBe('blocked');
  const scheduled=(await rows(sql`SELECT scheduled_at FROM posts WHERE status='scheduled' AND (scheduled_at AT TIME ZONE 'Europe/Kyiv')::date=${DAY}::date ORDER BY scheduled_at`)).map(r=>Date.parse(r.scheduled_at));
  expect(scheduled).toHaveLength(8);
  for(let i=0;i<scheduled.length;i++){
   expect(scheduled[i]).toBeGreaterThanOrEqual(Date.parse('2026-11-10T10:10:00Z'));
   if(i)expect(scheduled[i]-scheduled[i-1]).toBeGreaterThanOrEqual(10*60_000);
  }
 });
 it('retries invalid model output until the deficit is filled',async()=>{
  for(const [i,h] of [12,13,14,15,16,17].entries())await insertPost({text:`Наявний допис номер ${i+1}`,status:'scheduled',at:`2026-11-10T${h}:00:00Z`});
  await insertPost({text:quotaTexts[9],status:'published',at:'2026-11-09T10:00:00Z',published:true});
  vi.mocked(generate).mockReset();
  vi.mocked(generate)
   .mockRejectedValueOnce(new AppError(502,'Стиль','GENERATION_STYLE_INVALID'))
   .mockResolvedValueOnce({evidenceId:null,text:quotaTexts[9],category:'founder',topic:'Повтор',reason:'r'})
   .mockResolvedValueOnce({evidenceId:null,text:quotaTexts[0],category:'founder',topic:'Тема 0',reason:'r'})
   .mockResolvedValueOnce({evidenceId:null,text:quotaTexts[1],category:'founder',topic:'Тема 1',reason:'r'});
  expect(await ensureDailyQuota(NOW)).toMatchObject({before:6,generated:2,after:8});
  const calls=vi.mocked(generate).mock.calls;
  expect(calls).toHaveLength(4);
  expect((calls[2][2] as any).rejected[0].reasons).toContain('Слишком похоже на предыдущую публикацию');
  expect((calls[3][2] as any).rejected).toEqual([]);
 });
 it('reports a shortfall without throwing when the provider keeps failing',async()=>{
  vi.mocked(generate).mockReset();
  vi.mocked(generate).mockRejectedValue(new ProviderError(500,'deepseek.generate'));
  expect(await ensureDailyQuota(NOW)).toEqual({day:DAY,target:8,before:0,recycled:0,generated:0,after:0});
  expect(generate).toHaveBeenCalledTimes(3);
  const ops=await rows(sql`SELECT status,message FROM operations WHERE kind='quota'`);
  expect(ops).toHaveLength(1);expect(ops[0].status).toBe('warning');expect(ops[0].message).toContain('0 из 8');
 });
 it('counts unknown and publishing posts as delivered and leaves them untouched',async()=>{
  const u=await insertPost({text:'Наявний допис номер 1',status:'unknown',at:'2026-11-10T07:00:00Z'});
  const p=await insertPost({text:'Наявний допис номер 2',status:'publishing',at:'2026-11-10T09:00:00Z'});
  expect(await ensureDailyQuota(NOW)).toMatchObject({before:2,generated:6,after:8});
  for(const post of [u,p]){
   const row=(await one(sql`SELECT status,revision FROM posts WHERE id=${post.id}::uuid`))!;
   expect(row.status).toBe(post.status);expect(row.revision).toBe(post.revision);
  }
 });
 it('skips a day whose plan is being generated',async()=>{
  await rows(sql`INSERT INTO daily_plans(day,status,count,slots) VALUES('2026-11-10','generating',8,'[]')`);
  expect(await ensureDailyQuota(NOW)).toMatchObject({skipped:'generating',recycled:0,generated:0});
  expect(generate).not.toHaveBeenCalled();
  expect(await rows(sql`SELECT id FROM posts`)).toHaveLength(0);
 });
 it('uses a confirmed source chosen by the model and rejects unknown ids',async()=>{
  const source=(await one(sql`INSERT INTO growth_sources(title,text,kind,hypothesis,confirmed) VALUES('Нотатка','Підтверджений матеріал про облік','founder','accounting',true) RETURNING id`))!;
  for(const [i,h] of [11,12,13,14,15,16,17].entries())await insertPost({text:`Наявний допис номер ${i+1}`,status:'scheduled',at:`2026-11-10T${h}:00:00Z`});
  vi.mocked(generate).mockReset();
  vi.mocked(generate)
   .mockResolvedValueOnce({evidenceId:'00000000-0000-4000-8000-000000000000',text:quotaTexts[0],category:'founder',topic:'Тема 0',reason:'r'})
   .mockResolvedValueOnce({evidenceId:source.id,text:quotaTexts[1],category:'founder',topic:'Облік',reason:'r'});
  expect(await ensureDailyQuota(NOW)).toMatchObject({generated:1,after:8});
  expect(generate).toHaveBeenCalledTimes(2);
  const fresh=(await one(sql`SELECT evidence_id,hypothesis,sources FROM posts WHERE text=${quotaTexts[1]}`))!;
  expect(fresh.evidence_id).toBe(source.id);expect(fresh.hypothesis).toBe('accounting');expect(fresh.sources).toEqual([]);
 });
 it('migration 010 clears the stored pause',async()=>{
  await rows(sql`UPDATE settings SET value=jsonb_set(value,'{paused}','true'::jsonb) WHERE id=1`);
  await pool.query(await readFile(new URL('../server/migrations/010_always_publish.sql',import.meta.url),'utf8'));
  expect((await one(sql`SELECT value FROM settings WHERE id=1`))!.value.paused).toBe(false);
 });
});
