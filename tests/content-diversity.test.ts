import { expect, it } from 'vitest';
import { contentDiversityErrors } from '../server/domain/content-diversity';
const post = (trendId: string | null = null, sourceUrls: string[] = []) => ({ trendId, sourceUrls });
it('allows two uses of a trend but rejects three with actionable feedback', () => {
  expect(contentDiversityErrors([post('trend'), post('trend')])).toEqual([]);
  expect(contentDiversityErrors([post('trend'), post('trend'), post('trend')])).toEqual([expect.stringContaining('тренд trend: максимум 2')]);
});
it('counts an exact source URL once per post and limits it to two posts', () => {
  const url = 'https://example.org/topic';
  expect(contentDiversityErrors([post(null, [url, url, url]), post(null, [url])])).toEqual([]);
  expect(contentDiversityErrors([post(null, [url, url]), post(null, [url]), post(null, [url])])).toEqual([expect.stringContaining(`источник ${url}: максимум 2`)]);
});
it('does not count absent evidence or combine different exact URLs and trends', () => {
  expect(contentDiversityErrors(Array.from({length:10}, () => post()))).toEqual([]);
  expect(contentDiversityErrors(Array.from({length:10}, (_, i) => post(`trend${i}`, [`https://example.org/${i}`])))).toEqual([]);
  expect(contentDiversityErrors([post(null,['https://example.org/a']),post(null,['https://example.org/a/']),post(null,['https://example.org/a?x=1'])])).toEqual([]);
});
