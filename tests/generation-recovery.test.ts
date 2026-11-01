import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { rows, one } from '../server/db.js';
import { generate } from '../server/providers/deepseek.js';
import { prepareDay } from '../server/services/generation.js';
import { writeDayPlan, editableDayPosts } from '../server/services/plan-write.js';
import { settings, event } from '../server/services/state.js';
import { defaults } from '../server/defaults.js';

vi.mock('../server/db.js', async () => ({ sql: (await import('drizzle-orm')).sql, rows: vi.fn(), one: vi.fn() }));
vi.mock('../server/providers/deepseek.js', () => ({ generate: vi.fn() }));
vi.mock('../server/services/state.js', async () => ({
  settings: vi.fn(async () => (await import('../server/defaults.js')).defaults), event: vi.fn(), heartbeat: vi.fn(),
}));
vi.mock('../server/services/plan-write.js', () => ({
  assertDayResolved: vi.fn(), editableDayPosts: vi.fn(async () => []), writeDayPlan: vi.fn(),
}));

const dialect = new PgDialect();
const first = { id: '11111111-1111-4111-8111-111111111111', kind: 'founder', hypothesis: 'transition', confirmed: true, permission: false, url: null };
const second = { ...first, id: '22222222-2222-4222-8222-222222222222', hypothesis: 'accounting', kind: 'public', url: 'https://example.com/source' };
const candidate = (source: typeof first | typeof second) => ({
  evidenceId: source.id, hypothesis: source.hypothesis, text: 'Який процес ви хочете перевірити перед вибором системи?',
  alternative: 'З якого завдання вашої школи почнете перевірку?', category: 'founder', topic: 'Перевірка перед вибором',
  reason: 'Подтверждённый материал', sourceUrls: source.url ? [source.url] : [], trendId: null, verified: true, concerns: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(settings).mockResolvedValue({...defaults,dailyCount:1,weeklyCount:5});
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
  vi.mocked(rows).mockImplementation(async query => dialect.sqlToQuery(query).sql.includes('FROM growth_sources') ? [first, second] as any : []);
  vi.mocked(one).mockImplementation(async query => dialect.sqlToQuery(query).sql.includes('INSERT INTO daily_plans') ? { day: '2026-10-31' } as any : undefined);
  vi.mocked(generate).mockImplementation(async (kind, _instruction, input: any) =>
    (kind === 'plan-review' ? { blockingIssues: [], suggestions: [] } : { posts: [candidate(input.evidence[0])] }) as any);
});
afterEach(() => vi.useRealTimers());

it('keeps automatic weekend preparation off but lets an explicit request produce a draft', async () => {
  expect(await prepareDay('2026-10-31')).toMatchObject({ count: 0, skipped: true });
  expect(generate).not.toHaveBeenCalled();
  expect(await prepareDay('2026-10-31', { manual: true })).toMatchObject({ count: 1 });
  expect(writeDayPlan).toHaveBeenCalledOnce();
  const claim = vi.mocked(one).mock.calls.map(([query]) => dialect.sqlToQuery(query)).find(q => q.sql.includes('INSERT INTO daily_plans'))!;
  expect(claim.sql).toContain('daily_plans.count=0');
  expect(claim.params).toContain(true);
});

it('changes confirmed source after editorial rejection and supplies product knowledge to the reviewer', async () => {
  let reviews = 0;
  vi.mocked(generate).mockImplementation(async (kind, _instruction, input: any) => {
    if (kind === 'plan-review') return (++reviews === 1 ? { blockingIssues: [{ postIndex: 0, issue: 'Same lesson-check takeaway as history' }], suggestions: [] } : { blockingIssues: [], suggestions: [] }) as any;
    return { posts: [candidate(input.evidence[0])] } as any;
  });
  await prepareDay('2026-11-02');
  const writers = vi.mocked(generate).mock.calls.filter(([kind]) => kind === 'daily-plan');
  expect(writers.map(call => (call[2] as any).evidence.map((e: any) => e.id))).toEqual([[first.id], [second.id]]);
  expect((writers[1][2] as any).validationErrors.join(' ')).toContain('Same lesson-check');
  expect(writers[1][4]).toEqual([second.url]);
  for (const call of vi.mocked(generate).mock.calls.filter(([kind]) => kind === 'plan-review'))
    expect((call[2] as any).knowledge).toBe(defaults.knowledge);
  expect(writeDayPlan).toHaveBeenCalledWith('2026-11-02', [candidate(second)], [], null, [], false, [],90);
});

it('never saves a rejected plan or silently replaces missing evidence with filler', async () => {
  vi.mocked(rows).mockResolvedValue([]);
  await expect(prepareDay('2026-11-02')).rejects.toMatchObject({ code: 'EVIDENCE_REQUIRED' });
  expect(generate).not.toHaveBeenCalled(); expect(writeDayPlan).not.toHaveBeenCalled();
});

it('retains the editorial gate when all attempts are rejected', async () => {
  vi.mocked(generate).mockImplementation(async (kind, _instruction, input: any) =>
    (kind === 'plan-review' ? { blockingIssues: [{ postIndex: 0, issue: 'Repeated takeaway' }], suggestions: [] } : { posts: [candidate(input.evidence[0])] }) as any);
  await expect(prepareDay('2026-11-02')).rejects.toMatchObject({ code: 'GENERATION_INVALID' });
  expect(writeDayPlan).not.toHaveBeenCalled();
  expect(vi.mocked(generate).mock.calls.filter(([kind]) => kind === 'plan-review')).toHaveLength(5);
});


it('saves a valid plan when the reviewer has only optional suggestions', async () => {
  vi.mocked(generate).mockImplementation(async (kind, _instruction, input: any) =>
    (kind === 'plan-review' ? { blockingIssues: [], suggestions: ['Could shorten the opening', 'The source supports the factual claims'] } : { posts: [candidate(input.evidence[0])] }) as any);
  await expect(prepareDay('2026-11-02')).resolves.toMatchObject({ count: 1 });
  expect(writeDayPlan).toHaveBeenCalledOnce();
});


it('prepares eight distinct posts on both Sunday and Monday with the permanent settings',async()=>{
 vi.mocked(settings).mockResolvedValue(defaults);
 const sources=Array.from({length:8},(_,i)=>({...first,id:`00000000-0000-4000-8000-00000000000${i}`}));
 const texts=['Хто підтверджує виплату викладачу?','Де знайти історію зарахувань учня?','Які відомості переносити з таблиці?','Чи потрібен команді окремий доступ до філій?','Як школа перевіряє неоплачені рахунки?','Яку інформацію отримують батьки?','Коли зупиняти надсилання нагадувань?','Що врахувати перед зміною навчального пакета?'];
 vi.mocked(rows).mockImplementation(async query=>dialect.sqlToQuery(query).sql.includes('FROM growth_sources')?sources as any:[]);
 vi.mocked(generate).mockImplementation(async(kind,_instruction,input:any)=>
  (kind==='plan-review'?{blockingIssues:[],suggestions:[]}:{posts:input.evidence.map((source:any,i:number)=>({...candidate(source),text:texts[i],alternative:texts[i],topic:`Тема ${i}`}))}) as any);
 for(const day of ['2026-11-01','2026-11-02'])await expect(prepareDay(day)).resolves.toMatchObject({day,count:8});
 expect(writeDayPlan).toHaveBeenCalledTimes(2);
 for(const call of vi.mocked(writeDayPlan).mock.calls)expect(call[1]).toHaveLength(8);
 for(const call of vi.mocked(generate).mock.calls.filter(([kind])=>kind==='daily-plan')){
  expect((call[2] as any).slots).toHaveLength(8);
  expect(call[1]).toContain('Exactly 8 different posts');
 }
});


const lines = [
 'Хто підтверджує виплату викладачу після останнього заняття?', 'Де шукати історію зарахувань учня за минулий семестр?',
 'Які відомості переносити зі старої таблиці в першу чергу?', 'Чи потрібен окремий доступ до даних для кожної філії?',
 'Як школа перевіряє неоплачені рахунки наприкінці місяця?', 'Яку інформацію щотижня отримують батьки від адміністратора?',
 'Коли варто зупиняти надсилання нагадувань про борг?', 'Що врахувати перед зміною навчального пакета посеред року?',
 'Скільки часу займає закриття розкладу на наступний тиждень?', 'Хто відповідає за пробні уроки для нових учнів?',
 'Навіщо вести окремий облік абонементів для дорослих груп?', 'Який звіт найчастіше просять власники невеликих студій?',
 'Де зберігати домовленості про знижки для братів і сестер?', 'Як передати групу іншому викладачеві без плутанини в оплатах?',
 'Чим замінити паперовий журнал відвідуваності в маленькій школі?', 'Коли перераховувати залишок занять після пропуску через хворобу?',
];
type Snapshot = { kind: string; instruction: string; input: any };
// Inputs are cloned at call time because the service keeps appending to the arrays it passes in.
function setupPlan(n: number, review: (call: number, input: any) => { postIndex: number; issue: string }[], tweak: (k: number, post: any) => any = (_k, post) => post) {
  vi.mocked(settings).mockResolvedValue({ ...defaults, dailyCount: n, weeklyCount: 7 });
  const sources = Array.from({ length: n }, (_, i) => ({ ...first, id: `00000000-0000-4000-8000-00000000000${i}` }));
  vi.mocked(rows).mockImplementation(async query => dialect.sqlToQuery(query).sql.includes('FROM growth_sources') ? sources as any : []);
  const snapshots: Snapshot[] = [];
  let written = 0, reviews = 0;
  vi.mocked(generate).mockImplementation(async (kind, instruction, input: any) => {
    snapshots.push({ kind, instruction, input: JSON.parse(JSON.stringify(input)) });
    if (kind === 'plan-review') return { blockingIssues: review(++reviews, input), suggestions: [] } as any;
    const needed = n - input.approvedPosts.length;
    return { posts: Array.from({ length: needed }, (_, i) => { const k = written++; return tweak(k, { ...candidate(input.evidence[i % input.evidence.length]), text: lines[k], alternative: lines[k], topic: `Тема ${k}` }); }) } as any;
  });
  return { writers: () => snapshots.filter(s => s.kind === 'daily-plan'), reviewers: () => snapshots.filter(s => s.kind === 'plan-review') };
}

it('rewrites only the posts the editor rejected and keeps the approved ones', async () => {
  const run = setupPlan(3, call => call === 1 ? [{ postIndex: 1, issue: 'Same takeaway as history' }] : []);
  await expect(prepareDay('2026-11-02')).resolves.toMatchObject({ count: 3 });
  const writers = run.writers(), reviewers = run.reviewers();
  expect(writers).toHaveLength(2);
  expect(writers[1].instruction).toContain('Exactly 1 different posts');
  expect(writers[1].input.approvedPosts).toHaveLength(2);
  expect(writers[1].input.previousDraft.posts).toHaveLength(1);
  expect(reviewers[1].input.posts).toHaveLength(1);
  expect(reviewers[1].input.approvedPosts).toHaveLength(2);
  expect(writeDayPlan).toHaveBeenCalledOnce();
  const saved = vi.mocked(writeDayPlan).mock.calls[0][1].map(p => p.text);
  expect(saved).toHaveLength(3);
  expect(saved).toContain(lines[0]); expect(saved).toContain(lines[2]);
  expect(saved).not.toContain(lines[1]);
});

it('holds back a post with concerns without losing the rest', async () => {
  const run = setupPlan(3, () => [], (k, post) => k === 1 ? { ...post, verified: false, concerns: ['x'] } : post);
  await expect(prepareDay('2026-11-02')).resolves.toMatchObject({ count: 3 });
  expect(run.reviewers()[0].input.posts).toHaveLength(2);
  expect(run.writers()[1].instruction).toContain('Exactly 1 different posts');
  expect(vi.mocked(writeDayPlan).mock.calls[0][1]).toHaveLength(3);
});

it('blocks every post when the reviewer names an unknown index', async () => {
  const run = setupPlan(2, call => call === 1 ? [{ postIndex: 9, issue: 'Unattributed problem' }] : []);
  await expect(prepareDay('2026-11-02')).resolves.toMatchObject({ count: 2 });
  const writers = run.writers();
  expect(writers[1].instruction).toContain('Exactly 2 different posts');
  expect(writers[1].input.approvedPosts).toHaveLength(0);
});

it('saves a partial plan with a warning when at least half is approved and nothing is replaced', async () => {
  setupPlan(4, call => [{ postIndex: call === 1 ? 3 : 0, issue: 'Repeated takeaway' }]);
  await expect(prepareDay('2026-11-02')).resolves.toMatchObject({ count: 3, requested: 4, partial: true });
  expect(writeDayPlan).toHaveBeenCalledOnce();
  expect(vi.mocked(writeDayPlan).mock.calls[0][1]).toHaveLength(3);
  expect(event).toHaveBeenCalledWith('generation', 'warning', expect.stringContaining('3 из 4'), expect.anything());
});

it('fails instead of saving less than half', async () => {
  setupPlan(4, (call, input) => call === 1 ? [1, 2, 3].map(postIndex => ({ postIndex, issue: 'Repeated takeaway' })) : input.posts.map((_: unknown, postIndex: number) => ({ postIndex, issue: 'Repeated takeaway' })));
  await expect(prepareDay('2026-11-02')).rejects.toMatchObject({ code: 'GENERATION_INVALID' });
  expect(writeDayPlan).not.toHaveBeenCalled();
});

it('never saves a partial plan over existing posts', async () => {
  setupPlan(4, call => [{ postIndex: call === 1 ? 3 : 0, issue: 'Repeated takeaway' }]);
  vi.mocked(editableDayPosts).mockResolvedValueOnce([{ id: 1, text: 'Старий пост про зовсім інші речі без жодних повторів', topic: 'Старе', category: 'founder', status: 'draft', created_at: '2026-10-30T10:00:00Z', published_at: null }] as any);
  await expect(prepareDay('2026-11-02', { regenerate: true, manual: true })).rejects.toMatchObject({ code: 'GENERATION_INVALID' });
  expect(writeDayPlan).not.toHaveBeenCalled();
});
