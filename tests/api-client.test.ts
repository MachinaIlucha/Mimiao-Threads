import {afterEach,describe,it,expect,vi} from 'vitest';
import {api,setCsrf} from '../src/api';
afterEach(()=>vi.unstubAllGlobals());
describe('admin API requests',()=>{
 it('sends bodyless job commands without declaring an empty JSON payload',async()=>{
  const fetcher=vi.fn(async()=>new Response('{"jobId":"test"}',{status:200}));
  vi.stubGlobal('fetch',fetcher);setCsrf('test-csrf');
  await api('/jobs/browser-check','POST');
  const init=(fetcher.mock.calls as unknown as [string,RequestInit][])[0][1];
  expect(new Headers(init.headers).has('content-type')).toBe(false);
  expect(new Headers(init.headers).get('x-csrf-token')).toBe('test-csrf');
  expect(init.body).toBeUndefined();
 });
 it('retains JSON encoding for pause and editing commands',async()=>{
  const fetcher=vi.fn(async()=>new Response('{"ok":true}',{status:200}));
  vi.stubGlobal('fetch',fetcher);
  await api('/pause','POST',{paused:true});
  const init=(fetcher.mock.calls as unknown as [string,RequestInit][])[0][1];
  expect(new Headers(init.headers).get('content-type')).toBe('application/json');
  expect(init.body).toBe('{"paused":true}');
 });
});
