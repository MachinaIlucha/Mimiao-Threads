import { sql,one,pool } from '../server/db.js';
try{const h=await one(sql`SELECT at FROM heartbeats WHERE name='worker'`);process.exitCode=h&&Date.now()-Date.parse(h.at)<120000?0:1;}catch{process.exitCode=1;}finally{await pool.end();}
