import {afterEach,describe,expect,it,vi} from 'vitest';
import {runInNewContext} from 'node:vm';
vi.mock('../server/config',()=>({config:{camoufoxUrl:'http://manager:8000',camoufoxKey:'private-worker-key'}}));
import {camoufoxPage} from '../server/browser/camoufox';
afterEach(()=>vi.unstubAllGlobals());
describe('Camoufox transport',()=>{
 it('pins a manager page, preserves regex scopes and refreshes the current origin',async()=>{
  const fetcher=vi.fn()
   .mockResolvedValueOnce(Response.json({url:'about:blank',result:{profile_id:'fixed'}}))
   .mockResolvedValueOnce(Response.json({url:'https://www.threads.com/',result:'/@mimiao.crm'}));
  vi.stubGlobal('fetch',fetcher);
  const page=await camoufoxPage();
  expect(page.url()).toBe('about:blank');
  const href=await page.getByRole('link',{name:/^Profile$/i}).first().getAttribute('href',{timeout:12000});
  expect(href).toBe('/@mimiao.crm');expect(page.url()).toBe('https://www.threads.com/');
  const request=JSON.parse(fetcher.mock.calls[1][1].body);
  expect(request.steps).toEqual([{method:'get_by_role',args:['link',{name:{regex:'^Profile$',flags:'i'}}]},{method:'first',args:[]}]);
  expect(request.method).toBe('get_attribute');
  expect(fetcher.mock.calls[0][1].headers['X-Studio-Key']).toBe('private-worker-key');
 });
 it('never retries a click after a lost response',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(Response.json({url:'https://www.threads.com/',result:{}}))
   .mockRejectedValueOnce(new Error('connection closed after sending'));
  vi.stubGlobal('fetch',fetcher);
  const page=await camoufoxPage();
  await expect(page.getByRole('dialog').getByRole('button',{name:/^Post$/}).click()).rejects.toThrow('ответ потерян');
  expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it('fails closed on manager errors and does not expose error bodies',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('private DOM and tokens',{status:409})));
  await expect(camoufoxPage()).rejects.toThrow('Операция Camoufox остановлена');
 });
 it('passes every photo in order and preserves the DOM verification function',async()=>{
  const fetcher=vi.fn().mockImplementation(async()=>Response.json({url:'https://www.threads.com/',result:[]}));
  vi.stubGlobal('fetch',fetcher);
  const page=await camoufoxPage();
  await page.getByRole('dialog').locator('input[type="file"]').setInputFiles(['/app/data/media/a.jpg','/app/data/media/b.jpg']);
  await page.evaluate(()=>document.title);
  expect(JSON.parse(fetcher.mock.calls[1][1].body).args[0]).toEqual(['/app/data/media/a.jpg','/app/data/media/b.jpg']);
  expect(JSON.parse(fetcher.mock.calls[2][1].body).args[0]).toContain('document.title');
 });
 it('keeps compiled nested functions self-contained in the browser',async()=>{
  const fetcher=vi.fn().mockImplementation(async()=>Response.json({url:'about:blank',result:42}));
  vi.stubGlobal('fetch',fetcher);
  const page=await camoufoxPage();
  const compiled=new Function('return ()=>{const reader=__name(()=>42,"reader");return reader();}')();
  await page.evaluate(compiled);
  const script=JSON.parse(fetcher.mock.calls[1][1].body).args[0];
  expect(runInNewContext(`(${script})()`)).toBe(42);
 });
});
