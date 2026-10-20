import {beforeEach,describe,it,expect,vi} from 'vitest';
import type {Post} from '../shared/types';
const fake=vi.hoisted(()=>({
 editor:{count:vi.fn(),fill:vi.fn(),innerText:vi.fn()},
 send:{isEnabled:vi.fn(),click:vi.fn()},
 upload:{setInputFiles:vi.fn()},wait:vi.fn(),open:vi.fn(),
 evaluate:vi.fn(),preview:vi.fn(),identity:vi.fn(),one:vi.fn(),stat:vi.fn()
}));
vi.mock('../server/db',()=>({sql:vi.fn(),one:fake.one}));
vi.mock('node:fs/promises',()=>({stat:fake.stat}));
vi.mock('../server/browser/session',()=>({
 assertOwnAccount:fake.identity,setBrowserStatus:vi.fn(),
 withBrowser:async(fn:any)=>fn({
  goto:vi.fn(),evaluate:fake.evaluate,waitForFunction:fake.preview,
  locator:()=>({evaluateAll:async()=>[]}),
  getByRole:(role:string,options?:{name:RegExp})=>role==='dialog'?{
   waitFor:fake.wait,getByText:()=>({waitFor:fake.wait}),locator:()=>fake.upload,
   getByRole:(r:string)=>r==='textbox'?fake.editor:fake.send
  }:options?.name.source.includes('New thread')?{click:fake.open}:{waitFor:fake.wait}
 })
}));
import {publishInBrowser} from '../server/browser/publisher';
const post={text:'Текст для перевірки',media_ids:[]} as unknown as Post;
beforeEach(()=>{
 vi.resetAllMocks();fake.editor.count.mockResolvedValue(1);fake.editor.innerText.mockResolvedValue(post.text);
 fake.send.isEnabled.mockResolvedValue(true);fake.evaluate.mockResolvedValue([]);
 fake.one.mockResolvedValue({storage_name:'photo.jpg'});fake.stat.mockResolvedValue({isFile:()=>true});
});
describe('browser composer preflight and sending boundary',()=>{
 it('does not open the composer when the identity check fails',async()=>{
  fake.identity.mockRejectedValue(new Error('login required'));
  await expect(publishInBrowser(post,vi.fn())).rejects.toThrow();
  expect(fake.open).not.toHaveBeenCalled();expect(fake.send.click).not.toHaveBeenCalled();
 });
 it('blocks the entire post when an attachment is missing',async()=>{
  fake.one.mockResolvedValue(undefined);
  await expect(publishInBrowser({...post,media_ids:['missing']},vi.fn())).rejects.toThrow('фото');
  expect(fake.open).not.toHaveBeenCalled();
 });
 it('never sends a text-only fallback when image upload fails',async()=>{
  fake.upload.setInputFiles.mockRejectedValue(new Error('upload failed'));const before=vi.fn();
  await expect(publishInBrowser({...post,media_ids:['photo']},before)).rejects.toThrow();
  expect(before).not.toHaveBeenCalled();expect(fake.send.click).not.toHaveBeenCalled();
 });
 it('requires loaded previews and unchanged text',async()=>{
  fake.preview.mockRejectedValue(new Error('previews incomplete'));
  await expect(publishInBrowser({...post,media_ids:['photo']},vi.fn())).rejects.toThrow();
  expect(fake.send.click).not.toHaveBeenCalled();
  fake.editor.innerText.mockResolvedValue('different text');
  await expect(publishInBrowser(post,vi.fn())).rejects.toThrow('Текст');
  expect(fake.send.click).not.toHaveBeenCalled();
 });
 it('performs the durable boundary callback before exactly one click, and does not retry on missing evidence',async()=>{
  const before=vi.fn(async()=>{expect(fake.send.click).not.toHaveBeenCalled();});
  await expect(publishInBrowser(post,before)).rejects.toThrow('результат');
  expect(before).toHaveBeenCalledOnce();expect(fake.send.click).toHaveBeenCalledOnce();
 });
 it('does not click if pause or durable persistence blocks the boundary',async()=>{
  await expect(publishInBrowser(post,async()=>{throw new Error('paused');})).rejects.toThrow('paused');
  expect(fake.send.click).not.toHaveBeenCalled();
 });
});
