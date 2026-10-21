import { beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('../server/config', () => ({ config: { deepseekKey: 'test-key' } }));
vi.mock('../server/services/state', () => ({ settings: vi.fn(async () => ({ model: 'deepseek-test' })) }));
vi.mock('../server/db', async () => ({ sql: (await import('drizzle-orm')).sql, rows: vi.fn(async () => []) }));
vi.mock('../server/providers/http', () => ({ requestJson: vi.fn() }));

import { generate } from '../server/providers/deepseek';
import { requestJson } from '../server/providers/http';
import { rows } from '../server/db';
import { clientVoiceErrors, clientVoiceInstruction } from '../server/domain/client-voice';
import { CLIENT_VOICE } from '../shared/client-voice';
import { CLIENT_COMMUNICATION_SOURCES } from '../shared/client-communication-sources';

beforeEach(() => vi.clearAllMocks());
function respond(value: unknown) {
  vi.mocked(requestJson).mockResolvedValue({ choices: [{ message: { content: JSON.stringify(value) } }], usage: {} });
}

const planFormat=z.object({posts:z.array(z.object({text:z.string(),alternative:z.string(),category:z.enum(['teaching','life','founder','product']),sourceUrls:z.array(z.string().url())}))});

it('sends enum and array requirements after the full voice instructions', async () => {
  const plan={posts:[{text:'Вчителі, що допомагає учням?',alternative:'Репетитори, як ви це помічаєте?',category:'teaching',sourceUrls:[]}]};
  respond(plan);
  await expect(generate('daily-plan','Write Ukrainian prose.',{},planFormat)).resolves.toEqual(plan);
  const body=JSON.parse(vi.mocked(requestJson).mock.calls[0][1]!.body as string);
  const prompt=body.messages[0].content as string;
  const contract=JSON.parse(prompt.split('\nJSON Schema:\n').at(-1)!);
  expect(contract.properties.posts.items.properties.category.enum).toEqual(['teaching','life','founder','product']);
  expect(contract.properties.posts.items.properties.sourceUrls.type).toBe('array');
  expect(prompt.indexOf('Response format contract:')).toBeGreaterThan(prompt.indexOf(CLIENT_VOICE));
  expect(prompt.indexOf('Current task requirements:')).toBeGreaterThan(prompt.indexOf(CLIENT_VOICE));
  expect(prompt.indexOf('Write Ukrainian prose.')).toBeGreaterThan(prompt.indexOf('Current task requirements:'));
  expect(prompt.indexOf('Response format contract:')).toBeGreaterThan(prompt.indexOf('Write Ukrainian prose.'));
});

it.each([
  {category:'навчання',sourceUrls:[]},
  {category:'teaching',sourceUrls:null},
])('rejects malformed provider fields instead of silently coercing them: %j', async fields => {
  respond({posts:[{text:'Вчителі, що допомагає учням?',alternative:'Репетитори, як ви це помічаєте?',...fields}]});
  await expect(generate('daily-plan','Write Ukrainian prose.',{},planFormat)).rejects.toMatchObject({code:'GENERATION_INVALID'});
  expect(rows).toHaveBeenCalledOnce();
});

it.each(['daily-plan', 'variant', 'evergreen', 'reply'])('sends the client voice to DeepSeek for %s', async kind => {
  respond({ text: 'Вчителі, як ви помічаєте прогрес учнів?', draft: 'Дякую, що поділилися.' });
  await generate(kind, 'Return JSON. Apply supplied voice.', { voice: 'Особисте уточнення' }, z.object({ text: z.string(), draft: z.string() }));
  const body = JSON.parse(vi.mocked(requestJson).mock.calls[0][1]!.body as string);
  expect(body.messages[0].content).toContain(CLIENT_VOICE);
  for (const source of CLIENT_COMMUNICATION_SOURCES) {
    expect(body.messages[0].content).toContain(source.text);
  }
  expect(body.messages[0].content).toContain('Плейбук является справочником общения, а не актуальным каталогом');
  expect(JSON.parse(body.messages[1].content).voice).toBe('Особисте уточнення');
});

it('rejects a dash in the alternative before returning a daily plan and records the failed check', async () => {
  respond({ posts: [{ text: 'Вчителі, що допомагає учням?', alternative: 'Репетитори, увага — це важливо.' }] });
  await expect(generate('daily-plan', 'Return JSON.', {}, z.object({ posts: z.array(z.object({ text: z.string(), alternative: z.string() })) })))
    .rejects.toMatchObject({ code: 'GENERATION_STYLE_INVALID' });
  expect(rows).toHaveBeenCalledOnce();
});

it.each(['Урок — це розмова.', 'Урок–це розмова.', 'Урок - це розмова.', 'Зустрічаємось 2-3 рази.'])('rejects dash punctuation or numeric ranges: %s', text => {
  expect(clientVoiceErrors('variant', { text: `Вчителі, ${text}` })).toContain('Стиль общения Mimiao: перепишите текст без тире, а диапазоны выразите словами.');
});

it('keeps correct Ukrainian word hyphens and URL hyphens', async () => {
  const text = 'Вчителі, будь-який досвід може стати у пригоді. https://example.com/2-3';
  respond({ text });
  await expect(generate('evergreen', 'Return JSON.', {}, z.object({ text: z.string() }))).resolves.toEqual({ text });
});

it('checks reply drafts without treating private reasoning or sources as public copy', () => {
  expect(clientVoiceErrors('reply', { draft: 'Дякую — це корисно.' })).not.toHaveLength(0);
  expect(clientVoiceErrors('daily-plan', { posts: [{ text: 'Вчителі, що допомагає?', alternative: 'Репетитори, як ви це робите?', reason: 'Вопрос — для обсуждения' }] })).toEqual([]);
});

it.each(['research', 'weekly-review'])('preserves internal %s language and punctuation', async kind => {
  respond({ text: 'Вывод — данных недостаточно.' });
  const result = await generate(kind, 'Write explanations in Russian.', {}, z.object({ text: z.string() }));
  expect(result.text).toContain('—');
  const body = JSON.parse(vi.mocked(requestJson).mock.calls[0][1]!.body as string);
  expect(body.messages[0].content).not.toContain(CLIENT_VOICE);
  for (const source of CLIENT_COMMUNICATION_SOURCES) {
    expect(body.messages[0].content).not.toContain(source.text);
  }
});

it.each(['daily-plan','variant','evergreen'])('requires the educator opening for both public fields in %s',kind=>{
  const valid='Вчителі, що допомагає вам у роботі?',invalid='Я Ілля, засновник Mimiao.';
  for(const field of ['text','alternative'] as const){
    const post={text:valid,alternative:valid,category:'founder',[field]:invalid};
    const errors=clientVoiceErrors(kind,kind==='daily-plan'?{posts:[post]}:post);
    expect(errors).toHaveLength(1);expect(errors[0]).toContain(field);expect(errors[0]).toContain('обращения к аудитории');
  }
  expect(clientVoiceInstruction(kind)).toContain('включая founder и product');
});
it.each(['Репетитори,','Вчителі,','Викладачі,','Власники шкіл,'])('accepts the exact audience opening %s in all public generation kinds',opening=>{
  const text=`  ${opening.toLocaleLowerCase('uk')} я Ілля, засновник Mimiao.`;
  for(const kind of ['daily-plan','variant','evergreen']){
    const post={text,alternative:text,category:'product'};
    expect(clientVoiceErrors(kind,kind==='daily-plan'?{posts:[post]}:post)).toEqual([]);
  }
});
it.each(['Я Ілля. Вчителі, що думаєте?','Вчителі та репетитори, що думаєте?','Вчителі: що думаєте?'])('rejects an audience address outside the required opening: %s',text=>{
  expect(clientVoiceErrors('variant',{text})).toHaveLength(1);
});
it('keeps replies unrestricted by the audience opening',()=>{
  expect(clientVoiceErrors('reply',{draft:'Дякую, що поділилися досвідом.'})).toEqual([]);
  expect(clientVoiceInstruction('reply')).not.toContain('Обязательная адаптация для Threads');
});

const readableText = 'Вчителі, спробуйте залишити наприкінці заняття хвилину для одного конкретного запитання. 💡\n\nЩо учневі вже зрозуміло, а до чого варто повернутися наступного разу?';
it('preserves parsed JSON newlines in both generated public fields exactly', async () => {
  const plan={posts:[{text:readableText,alternative:readableText.replace('💡','📚'),category:'teaching',sourceUrls:[]}]};
  respond(plan);
  await expect(generate('daily-plan','Return JSON.',{},planFormat)).resolves.toEqual(plan);
});
it('rejects a long unbroken alternative and records its failed style check', async () => {
  respond({posts:[{text:readableText,alternative:readableText.replace(/\n/g,' '),category:'teaching',sourceUrls:[]}]});
  await expect(generate('daily-plan','Return JSON.',{},planFormat)).rejects.toMatchObject({code:'GENERATION_STYLE_INVALID'});
  expect(rows).toHaveBeenCalledOnce();
  const query=vi.mocked(rows).mock.calls[0][0] as {queryChunks:unknown[]};
  expect(JSON.stringify(query)).toContain('posts[0].alternative');
  expect(JSON.stringify(query)).toContain('styleErrors');
});
it.each(['daily-plan','variant','evergreen'])('checks layout on both fields for %s', kind => {
  for(const field of ['text','alternative'] as const){
    const post={text:readableText,alternative:readableText,[field]:readableText.replace(/\n/g,' ')};
    const errors=clientVoiceErrors(kind,kind==='daily-plan'?{posts:[post]}:post);
    expect(errors).toHaveLength(1);expect(errors[0]).toContain(field);expect(errors[0]).toContain('два абзаца');
  }
});
it('exempts replies from post layout and emoji limits', () => {
  expect(clientVoiceErrors('reply',{draft:`${'Дякую за відповідь. '.repeat(15)}💡 📚 👩🏽‍🏫`})).toEqual([]);
});

it('checks the daily emoji minimum without requiring emoji in individual variants or replies', () => {
  const text=readableText.replace('💡','');
  const posts=Array.from({length:5},()=>({text,alternative:text}));
  const errors=clientVoiceErrors('daily-plan',{posts});
  expect(errors).toHaveLength(2);expect(errors[0]).toContain('3 из 5 полей text.');expect(errors[1]).toContain('3 из 5 полей alternative.');
  expect(clientVoiceErrors('variant',{text,alternative:text})).toEqual([]);
  expect(clientVoiceErrors('reply',{draft:text})).toEqual([]);
});
