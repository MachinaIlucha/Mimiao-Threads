import {describe,it,expect} from 'vitest';
import {matchingPublication,postUrl,type BrowserPostEvidence} from '../server/browser/evidence';
const sentAt='2026-10-20T14:00:00Z';
const post:BrowserPostEvidence={url:'https://www.threads.com/@mimiao.crm/post/Abc123',text:'Тест\nтексту',timestamp:'2026-10-20T14:00:10Z',images:2};
describe('browser publication evidence',()=>{
 it('accepts only the intended account and canonical Threads URLs',()=>{
  expect(postUrl(post.url+'?x=1')).toBe(post.url);
  for(const url of ['https://evil.com/@mimiao.crm/post/Abc','https://www.threads.com/@other/post/Abc','https://www.threads.com.evil.com/@mimiao.crm/post/Abc','https://user@www.threads.com/@mimiao.crm/post/Abc','http://www.threads.com/@mimiao.crm/post/Abc'])expect(postUrl(url)).toBeNull();
 });
 it('requires fresh, exact, uniquely matched evidence and all photos',()=>{
  expect(matchingPublication([post], 'Тест тексту',[],sentAt,2)?.url).toBe(post.url);
  expect(matchingPublication([post],post.text,[post.url],sentAt,2)).toBeNull();
  expect(matchingPublication([post],post.text+' інший',[],sentAt,2)).toBeNull();
  expect(matchingPublication([post],post.text,[],sentAt,3)).toBeNull();
  expect(matchingPublication([{...post,timestamp:'2026-10-20T13:59:00Z'}],post.text,[],sentAt,0)).toBeNull();
  expect(matchingPublication([{...post,timestamp:'2026-10-20T14:10:00Z'}],post.text,[],sentAt,0)).toBeNull();
  expect(matchingPublication([post,{...post,url:post.url+'other'}],post.text,[],sentAt,2)).toBeNull();
  expect(matchingPublication([post,post],post.text,[],sentAt,2)?.url).toBe(post.url);
 });
});
