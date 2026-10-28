import {describe,it,expect,vi} from 'vitest';
vi.mock('../server/browser/session',()=>({withBrowser:vi.fn(),assertOwnAccount:vi.fn()}));
import {parsePostInsights,browserCheckpoint} from '../server/browser/insights';
describe('honest visible post insights',()=>{
 it('reads only the exact post summary, including real zeroes',()=>{
  expect(parsePostInsights('Other post\n999\nViews\nSummary\nViews\n1,234\nHigher\nProfile visits\n0\nTypical\nViewers\n900\nFollows\n2\nTypical\nViews over time\n10000')).toEqual({views:1234,profile_visits:0,follows:2});
 });
 it('does not turn missing, abbreviated or ambiguous metrics into numbers',()=>{
  expect(parsePostInsights('Other post\n100\nViews')).toEqual({views:null,profile_visits:null,follows:null});
  expect(parsePostInsights('Summary\nViews\n1.2K\nProfile visits\n12%\nFollows\n—')).toEqual({views:null,profile_visits:null,follows:null});
  expect(parsePostInsights('Summary\nViews\n10\nSummary\nViews\n20').views).toBeNull();
 });
 it('never backfills a missed checkpoint from a late observation',()=>{
  expect(browserCheckpoint(8)).toBeNull();expect(browserCheckpoint(25)).toBe('24h');
  expect(browserCheckpoint(29)).toBeNull();expect(browserCheckpoint(73)).toBe('72h');expect(browserCheckpoint(169)).toBe('7d');
 });
});
