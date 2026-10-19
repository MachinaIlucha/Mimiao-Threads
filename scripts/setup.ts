import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../server/security.js';
try { await readFile('.env'); console.log('.env already exists; left unchanged.'); }
catch {
 const password = process.env.STUDIO_SETUP_PASSWORD || randomBytes(18).toString('base64url');
 const dbPassword = randomBytes(18).toString('hex');
 const env = `DATABASE_URL=postgresql://studio:${dbPassword}@localhost:55439/studio\nPOSTGRES_PASSWORD=${dbPassword}\nPUBLIC_URL=http://localhost:4319\nPORT=4319\nHOST=127.0.0.1\nENCRYPTION_KEY=${randomBytes(32).toString('hex')}\nSESSION_SECRET=${randomBytes(32).toString('hex')}\nADMIN_PASSWORD_HASH=${hashPassword(password)}\nLIVE_PUBLISHING=false\n`;
 await writeFile('.env', env, {mode:0o600,flag:'wx'});
 await writeFile('OWNER-LOGIN.local.txt', `Local owner password: ${password}\nDelete this file after storing the password in your password manager.\n`, {mode:0o600,flag:'wx'});
 console.log('Created .env and OWNER-LOGIN.local.txt. Secrets were not printed. Keep both private.');
}
