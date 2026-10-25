import { defineConfig } from 'vitest/config';
import {repoRoot} from '../tools/lib/paths.mjs';
export default defineConfig({ root:repoRoot, test: { include: ['tests/**/*.test.ts'], maxWorkers: 1, fileParallelism: false } });
