import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/**/*.integration.test.ts'], setupFiles:['tests/setup-integration.ts'], fileParallelism: false, testTimeout: 30000, hookTimeout: 30000 } });
