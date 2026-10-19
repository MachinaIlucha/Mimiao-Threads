import { randomBytes, createCipheriv, createDecipheriv, scryptSync, timingSafeEqual, createHmac, createHash } from 'node:crypto';
import { config } from './config.js';
export const randomToken = () => randomBytes(32).toString('hex');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function hashPassword(password: string) { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password,salt,64).toString('hex')}`; }
export function verifyPassword(password: string, value: string) {
 try { const [salt, hash] = value.split(':'); const expected=Buffer.from(hash,'hex'); const actual=scryptSync(password,salt,64); return expected.length===actual.length && timingSafeEqual(expected,actual); } catch { return false; }
}
export function encrypt(value: string) { const iv=randomBytes(12); const c=createCipheriv('aes-256-gcm',Buffer.from(config.encryptionKey,'hex'),iv); const data=Buffer.concat([c.update(value,'utf8'),c.final()]); return [iv.toString('hex'),c.getAuthTag().toString('hex'),data.toString('hex')].join('.'); }
export function decrypt(value: string) { const [iv,tag,data]=value.split('.').map(s=>Buffer.from(s,'hex')); const c=createDecipheriv('aes-256-gcm',Buffer.from(config.encryptionKey,'hex'),iv); c.setAuthTag(tag); return Buffer.concat([c.update(data),c.final()]).toString('utf8'); }
export function mediaSignature(id: string, expires: number) { return createHmac('sha256',config.sessionSecret).update(`${id}:${expires}`).digest('hex'); }
export function safeEqual(a: string,b: string) { const x=Buffer.from(a),y=Buffer.from(b); return x.length===y.length&&timingSafeEqual(x,y); }
export function publicHttps(url: string) { try { const u=new URL(url); return u.protocol==='https:' && !u.username && !u.password && !['localhost','127.0.0.1','::1'].includes(u.hostname); } catch { return false; } }
