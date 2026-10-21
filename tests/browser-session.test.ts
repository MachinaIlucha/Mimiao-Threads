import {beforeEach,describe,expect,it,vi} from 'vitest';
const fake=vi.hoisted(()=>({url:vi.fn(),goto:vi.fn()}));
vi.mock('../server/config',()=>({config:{browserEngine:'camoufox'}}));
vi.mock('../server/db',()=>({sql:vi.fn(),one:vi.fn(),rows:vi.fn()}));
vi.mock('../server/browser/camoufox',()=>({camoufoxPage:async()=>fake}));
import {browserPage} from '../server/browser/session';
beforeEach(()=>vi.resetAllMocks());
describe('managed browser startup',()=>{
 it('opens Threads when a persistent profile restarts with a blank tab',async()=>{
  fake.url.mockReturnValue('about:blank');
  expect(await browserPage()).toBe(fake);
  expect(fake.goto).toHaveBeenCalledExactlyOnceWith('https://www.threads.com/',{waitUntil:'domcontentloaded'});
 });
 it.each(['https://www.threads.com/','https://www.threads.com/@mimiao.crm','https://www.instagram.com/accounts/login/','https://www.instagram.com/challenge/'])('preserves an existing page: %s',async url=>{
  fake.url.mockReturnValue(url);await browserPage();expect(fake.goto).not.toHaveBeenCalled();
 });
 it('does not retry a failed navigation',async()=>{
  fake.url.mockReturnValue('about:blank');fake.goto.mockRejectedValue(new Error('navigation failed'));
  await expect(browserPage()).rejects.toThrow('navigation failed');expect(fake.goto).toHaveBeenCalledTimes(1);
 });
});
