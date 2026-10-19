import { beforeAll,beforeEach,afterAll,it,expect,vi } from 'vitest';
import { sql,rows,one,pool } from '../server/db';
import { migrate } from '../server/migrate';
import { refreshToken,threads } from '../server/providers/threads';
import { encrypt,decrypt } from '../server/security';
beforeAll(migrate);
beforeEach(async()=>{vi.unstubAllGlobals();await rows(sql`DELETE FROM connections`);});
afterAll(async()=>{vi.unstubAllGlobals();await pool.end();});
it('refreshes an expiring token and stores it encrypted',async()=>{
 await rows(sql`INSERT INTO connections(id,user_id,username,token,expires_at) VALUES(1,'123','mimiao.crm',${encrypt('old-test-token')},now()+interval '2 days')`);
 const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({access_token:'new-test-token',expires_in:5184000}),{status:200}));vi.stubGlobal('fetch',fetch);
 await refreshToken();const stored=await one(sql`SELECT * FROM connections`);expect(stored!.token).not.toContain('new-test-token');expect(decrypt(stored!.token)).toBe('new-test-token');expect(Date.parse(stored!.expires_at)-Date.now()).toBeGreaterThan(50*86400000);expect(fetch).toHaveBeenCalledTimes(1);
});
it('keeps token state on rejection and does not retry unauthorized writes',async()=>{
 const encrypted=encrypt('old-test-token');await rows(sql`INSERT INTO connections(id,user_id,username,token,expires_at) VALUES(1,'123','mimiao.crm',${encrypted},now()+interval '2 days')`);
 const fetch=vi.fn().mockImplementation(async()=>new Response(JSON.stringify({error:{code:190}}),{status:401}));vi.stubGlobal('fetch',fetch);
 await expect(refreshToken()).rejects.toMatchObject({status:401});expect((await one(sql`SELECT token FROM connections`))!.token).toBe(encrypted);fetch.mockClear();await expect(threads('me/threads_publish',{creation_id:'test'},'POST')).rejects.toMatchObject({status:401,uncertain:false});expect(fetch).toHaveBeenCalledTimes(1);
});
