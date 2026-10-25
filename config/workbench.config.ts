import {defineConfig} from '@playwright/test';
import {fileURLToPath} from 'node:url';
export default defineConfig({
  testDir:'../tests/workbench',testMatch:'**/*.spec.ts',outputDir:'../build/test-results/workbench',
  fullyParallel:false,workers:1,timeout:30000,
  use:{browserName:'chromium',channel:process.env.PLAYWRIGHT_CHANNEL,viewport:{width:1280,height:900},deviceScaleFactor:1,baseURL:'http://127.0.0.1:8787',launchOptions:{args:['--num-raster-threads=1','--renderer-process-limit=1','--disable-gpu']}},
  webServer:{cwd:fileURLToPath(new URL('../',import.meta.url)),command:'node tools/workbench/serve.mjs',url:'http://127.0.0.1:8787',reuseExistingServer:!process.env.CI},
});
