import {it,expect,vi} from 'vitest';
import {JSDOM} from 'jsdom';
vi.mock('../server/db',()=>({sql:vi.fn(),one:vi.fn()}));
vi.mock('../server/browser/session',()=>({withBrowser:vi.fn(),assertOwnAccount:vi.fn(),setBrowserStatus:vi.fn()}));
import {readProfilePosts} from '../server/browser/publisher';

it('recognizes a photo permalink as the same post while excluding neighboring and quoted posts',async()=>{
 const card=(id:string,text:string,extra='')=>`<article><header><a href="/@mimiao.crm">mimiao.crm</a><a href="/@mimiao.crm/post/${id}"><time datetime="2026-10-28T13:00:10Z">8h</time></a></header><div dir="auto">${text}</div><a href="/@mimiao.crm/post/${id}/media"><img alt="Photo"/></a>${extra}<button aria-label="Like">Like</button></article>`;
 const dom=new JSDOM(`<main>${card('one','Перший текст')}${card('two','Другий текст')}${card('quote','Цитата','<a href="/@someone/post/quoted">Quoted</a>')}</main>`,{url:'https://www.threads.com/@mimiao.crm'});
 vi.stubGlobal('document',dom.window.document);
 vi.spyOn(dom.window.HTMLElement.prototype,'getClientRects').mockReturnValue([{}] as any);
 try{
  const posts=await readProfilePosts({evaluate:async(fn:any)=>fn()} as any);
  expect(posts.map(p=>[p.text,p.images])).toEqual([['Перший текст',1],['Другий текст',1]]);
 }finally{vi.unstubAllGlobals();dom.window.close();}
});
