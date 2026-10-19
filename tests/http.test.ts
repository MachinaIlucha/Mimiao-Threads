import { afterEach,it,expect,vi } from 'vitest';
import { requestJson } from '../server/providers/http';
import { ProviderError } from '../server/errors';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('never retries a write with unknown outcome',async()=>{const fetch=vi.fn().mockRejectedValue(new Error('network'));vi.stubGlobal('fetch',fetch);await expect(requestJson('https://graph.threads.net/me/threads_publish',{method:'POST'},'publish',false)).rejects.toMatchObject({uncertain:true});expect(fetch).toHaveBeenCalledTimes(1);});
it('does not expose provider response bodies',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{message:'secret-token-example',code:190}}),{status:401})));try{await requestJson('https://graph.threads.net/test',{},'read');throw new Error('Expected provider rejection');}catch(error){expect(error).toBeInstanceOf(ProviderError);expect(String(error)).not.toContain('secret-token-example');}});
it('bounds retries of retryable reads',async()=>{vi.useFakeTimers();const fetch=vi.fn().mockResolvedValue(new Response('{}',{status:503}));vi.stubGlobal('fetch',fetch);const result=requestJson('https://graph.threads.net/test',{},'read',true);const assertion=expect(result).rejects.toBeInstanceOf(ProviderError);await vi.runAllTimersAsync();await assertion;expect(fetch).toHaveBeenCalledTimes(3);});
