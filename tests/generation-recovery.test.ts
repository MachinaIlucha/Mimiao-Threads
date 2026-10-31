import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { rows, one } from '../server/db.js';
import { generate } from '../server/providers/deepseek.js';
import { prepareDay } from '../server/services/generation.js';
import { writeDayPlan } from '../server/services/plan-write.js';
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
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
  vi.mocked(rows).mockImplementation(async query => dialect.sqlToQuery(query).sql.includes('FROM growth_sources') ? [first, second] as any : []);
  vi.mocked(one).mockImplementation(async query => dialect.sqlToQuery(query).sql.includes('INSERT INTO daily_plans') ? { day: '2026-10-31' } as any : undefined);
  vi.mocked(generate).mockImplementation(async (kind, _instruction, input: any) =>
    (kind === 'plan-review' ? { accepted: true, issues: [] } : { posts: [candidate(input.evidence[0])] }) as any);
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
    if (kind === 'plan-review') return (++reviews === 1 ? { accepted: false, issues: ['Same lesson-check takeaway as history'] } : { accepted: true, issues: [] }) as any;
    return { posts: [candidate(input.evidence[0])] } as any;
  });
  await prepareDay('2026-11-02');
  const writers = vi.mocked(generate).mock.calls.filter(([kind]) => kind === 'daily-plan');
  expect(writers.map(call => (call[2] as any).evidence.map((e: any) => e.id))).toEqual([[first.id], [second.id]]);
  expect((writers[1][2] as any).validationErrors.join(' ')).toContain('Same lesson-check');
  expect(writers[1][4]).toEqual([second.url]);
  for (const call of vi.mocked(generate).mock.calls.filter(([kind]) => kind === 'plan-review'))
    expect((call[2] as any).knowledge).toBe(defaults.knowledge);
  expect(writeDayPlan).toHaveBeenCalledWith('2026-11-02', [candidate(second)], [], null, [], false, []);
});

it('never saves a rejected plan or silently replaces missing evidence with filler', async () => {
  vi.mocked(rows).mockResolvedValue([]);
  await expect(prepareDay('2026-11-02')).rejects.toMatchObject({ code: 'EVIDENCE_REQUIRED' });
  expect(generate).not.toHaveBeenCalled(); expect(writeDayPlan).not.toHaveBeenCalled();
});

it('retains the editorial gate when all attempts are rejected', async () => {
  vi.mocked(generate).mockImplementation(async (kind, _instruction, input: any) =>
    (kind === 'plan-review' ? { accepted: false, issues: ['Repeated takeaway'] } : { posts: [candidate(input.evidence[0])] }) as any);
  await expect(prepareDay('2026-11-02')).rejects.toMatchObject({ code: 'GENERATION_INVALID' });
  expect(writeDayPlan).not.toHaveBeenCalled();
  expect(vi.mocked(generate).mock.calls.filter(([kind]) => kind === 'plan-review')).toHaveLength(3);
});
