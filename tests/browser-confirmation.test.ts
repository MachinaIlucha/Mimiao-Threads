import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {waitForPublication} from '../server/browser/confirmation';
const sentAt='2026-10-21T00:32:25Z';
const post={url:'https://www.threads.com/@mimiao.crm/post/Abc123',text:'Текст допису',timestamp:'2026-10-21T00:32:26Z',images:1};
beforeEach(()=>vi.useFakeTimers());
afterEach(()=>vi.useRealTimers());
describe('browser publication confirmation',()=>{
 it('waits for a new card to hydrate, then stops reading',async()=>{
  const read=vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{...post,text:''}]).mockResolvedValue([post]);
  const result=waitForPublication(read,post.text,[],sentAt,1);
  await vi.runAllTimersAsync();
  expect(await result).toEqual(post);expect(read).toHaveBeenCalledTimes(3);
 });
 it('leaves an unconfirmed send unresolved after the bounded wait',async()=>{
  const read=vi.fn().mockResolvedValue([post]);
  const result=waitForPublication(read,post.text,[post.url],sentAt,1);
  await vi.advanceTimersByTimeAsync(20000);
  expect(await result).toBeNull();expect(vi.getTimerCount()).toBe(0);
 });
 it('requires all images even when text and time match',async()=>{
  const read=vi.fn().mockResolvedValueOnce([{...post,images:0}]).mockResolvedValue([post]);
  const result=waitForPublication(read,post.text,[],sentAt,1);
  await vi.runAllTimersAsync();expect(await result).toEqual(post);expect(read).toHaveBeenCalledTimes(2);
 });
 it('propagates browser failures without retrying commands',async()=>{
  const read=vi.fn().mockRejectedValue(new Error('Browser disconnected'));
  await expect(waitForPublication(read,post.text,[],sentAt,1)).rejects.toThrow('Browser disconnected');
  expect(read).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
 });
});
