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
 publishingMode: process.env.PUBLISHING_MODE || 'api',
 browserProfileDir: path.resolve(process.env.BROWSER_PROFILE_DIR || 'data/threads-browser'),
 browserHeadless: process.env.BROWSER_HEADLESS === 'true',
 browserEngine: process.env.BROWSER_ENGINE || 'chromium',
 camoufoxUrl: (process.env.CAMOUFOX_URL || 'http://camoufox:8000').replace(/\/$/, ''),
 camoufoxKey: process.env.CAMOUFOX_STUDIO_KEY || '',
 publicDiscoveryApproved: process.env.THREADS_PUBLIC_DISCOVERY_APPROVED === 'true'
};
export function validateConfig() {
 if (!['api','browser'].includes(config.publishingMode)) throw new Error('PUBLISHING_MODE must be api or browser.');
 if (!['chromium','camoufox'].includes(config.browserEngine)) throw new Error('BROWSER_ENGINE must be chromium or camoufox.');
 if (config.publishingMode==='browser'&&config.browserEngine==='camoufox'&&config.camoufoxKey.length<32) throw new Error('CAMOUFOX_STUDIO_KEY must contain at least 32 characters.');
 if (!/^[a-f0-9]{64}$/i.test(config.encryptionKey) || config.sessionSecret.length < 32 || !config.passwordHash)
  throw new Error('Run npm run setup to create local secrets and the owner password.');
 if (config.production && !config.publicUrl.startsWith('https://')) throw new Error('Production PUBLIC_URL must use HTTPS.');
}
