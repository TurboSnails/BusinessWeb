import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node', include: ['server/knowledge/**/*.test.ts', 'knowledge-sync/**/*.test.ts', 'obsidian-plugin/src/**/*.test.ts'], restoreMocks: true, clearMocks: true } })
