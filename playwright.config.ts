import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'tests/browser',fullyParallel:false,workers:1,timeout:30000,
  use:{browserName:'chromium',channel:process.env.PLAYWRIGHT_CHANNEL,viewport:{width:960,height:540},deviceScaleFactor:1,baseURL:`http://127.0.0.1:4173${process.env.ASTRA_BASE_PATH??'/'}`,launchOptions:{args:['--num-raster-threads=1','--renderer-process-limit=1','--disable-gpu']}},
  webServer:{command:process.env.ASTRA_PREVIEW?`npm run preview -- --port 4173 --strictPort --base ${process.env.ASTRA_BASE_PATH??'/'}`:'npm run dev -- --port 4173 --strictPort',url:`http://127.0.0.1:4173${process.env.ASTRA_BASE_PATH??'/'}`,reuseExistingServer:!process.env.CI},
});
