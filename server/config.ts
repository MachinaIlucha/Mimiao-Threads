import 'dotenv/config';
import path from 'node:path';
export const config = {
 databaseUrl: process.env.DATABASE_URL || 'postgresql://studio:studio@localhost:55439/studio',
 publicUrl: (process.env.PUBLIC_URL || 'http://localhost:4319').replace(/\/$/, ''),
 port: Number(process.env.PORT || 4319), host: process.env.HOST || '127.0.0.1',
 production: process.env.NODE_ENV === 'production',
 encryptionKey: process.env.ENCRYPTION_KEY || '', sessionSecret: process.env.SESSION_SECRET || '',
 passwordHash: process.env.ADMIN_PASSWORD_HASH || '', deepseekKey: process.env.DEEPSEEK_API_KEY || '',
 appId: process.env.THREADS_APP_ID || '', appSecret: process.env.THREADS_APP_SECRET || '',
 apiVersion: process.env.THREADS_API_VERSION || 'v1.0',
 mediaDir: path.resolve(process.env.MEDIA_DIR || 'data/media'),
 livePublishing: process.env.LIVE_PUBLISHING === 'true',
 publicDiscoveryApproved: process.env.THREADS_PUBLIC_DISCOVERY_APPROVED === 'true'
};
export function validateConfig() {
 if (!/^[a-f0-9]{64}$/i.test(config.encryptionKey) || config.sessionSecret.length < 32 || !config.passwordHash)
  throw new Error('Run npm run setup to create local secrets and the owner password.');
 if (config.production && !config.publicUrl.startsWith('https://')) throw new Error('Production PUBLIC_URL must use HTTPS.');
}
