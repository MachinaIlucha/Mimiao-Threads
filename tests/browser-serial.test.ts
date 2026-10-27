import {it,expect,vi} from 'vitest';
import {serializeBrowser} from '../server/browser/serial';
it('waits for a complete operation and releases after failure without retry',async()=>{
 let release!:()=>void;
 const gate=new Promise<void>(r=>{release=r;});
 const order:string[]=[];
 const first=serializeBrowser(async()=>{order.push('reconcile');await gate;throw new Error('failed');});
 const rejected=expect(first).rejects.toThrow('failed');
 const send=vi.fn(async()=>{order.push('publish');return 'published';});
 const second=serializeBrowser(send);
 await Promise.resolve();expect(order).toEqual(['reconcile']);expect(send).not.toHaveBeenCalled();
 release();await rejected;expect(await second).toBe('published');
 expect(order).toEqual(['reconcile','publish']);expect(send).toHaveBeenCalledOnce();
});
