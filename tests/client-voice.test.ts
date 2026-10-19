import { beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('../server/config', () => ({ config: { deepseekKey: 'test-key' } }));
vi.mock('../server/services/state', () => ({ settings: vi.fn(async () => ({ model: 'deepseek-test' })) }));
vi.mock('../server/db', async () => ({ sql: (await import('drizzle-orm')).sql, rows: vi.fn(async () => []) }));
vi.mock('../server/providers/http', () => ({ requestJson: vi.fn() }));

import { generate } from '../server/providers/deepseek';
import { requestJson } from '../server/providers/http';
import { rows } from '../server/db';
import { clientVoiceErrors } from '../server/domain/client-voice';
import { CLIENT_VOICE } from '../shared/client-voice';
import { CLIENT_COMMUNICATION_SOURCES } from '../shared/client-communication-sources';

beforeEach(() => vi.clearAllMocks());
function respond(value: unknown) {
  vi.mocked(requestJson).mockResolvedValue({ choices: [{ message: { content: JSON.stringify(value) } }], usage: {} });
}

it.each(['daily-plan', 'variant', 'evergreen', 'reply'])('sends the client voice to DeepSeek for %s', async kind => {
  respond({ text: 'Як ви помічаєте прогрес учнів?', draft: 'Дякую, що поділилися.' });
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
  respond({ posts: [{ text: 'Що допомагає учням?', alternative: 'Увага — це важливо.' }] });
  await expect(generate('daily-plan', 'Return JSON.', {}, z.object({ posts: z.array(z.object({ text: z.string(), alternative: z.string() })) })))
    .rejects.toMatchObject({ code: 'GENERATION_STYLE_INVALID' });
  expect(rows).toHaveBeenCalledOnce();
});

it.each(['Урок — це розмова.', 'Урок–це розмова.', 'Урок - це розмова.', 'Зустрічаємось 2-3 рази.'])('rejects dash punctuation or numeric ranges: %s', text => {
  expect(clientVoiceErrors('variant', { text })).not.toHaveLength(0);
});

it('keeps correct Ukrainian word hyphens and URL hyphens', async () => {
  const text = 'Будь-який досвід може стати у пригоді. https://example.com/2-3';
  respond({ text });
  await expect(generate('evergreen', 'Return JSON.', {}, z.object({ text: z.string() }))).resolves.toEqual({ text });
});

it('checks reply drafts without treating private reasoning or sources as public copy', () => {
  expect(clientVoiceErrors('reply', { draft: 'Дякую — це корисно.' })).not.toHaveLength(0);
  expect(clientVoiceErrors('daily-plan', { posts: [{ text: 'Що допомагає?', alternative: 'Як ви це робите?', reason: 'Вопрос — для обсуждения' }] })).toEqual([]);
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
