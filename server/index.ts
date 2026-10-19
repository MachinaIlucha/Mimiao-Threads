import { config,validateConfig } from './config.js';
import { migrate } from './migrate.js';
import { createApp } from './app.js';
import { pool } from './db.js';
import { boss } from './jobs.js';
validateConfig();await migrate();const app=await createApp();await app.listen({port:config.port,host:config.host});console.log(`Threads Studio: ${config.publicUrl}`);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();await boss.stop();await pool.end();process.exit(0);});
