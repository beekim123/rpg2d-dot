import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'tests/godot-web',fullyParallel:false,workers:1,timeout:45000,
  use:{browserName:'chromium',channel:process.env.PLAYWRIGHT_CHANNEL,baseURL:'http://127.0.0.1:8060',viewport:{width:960,height:540},deviceScaleFactor:1,launchOptions:{args:['--num-raster-threads=1','--renderer-process-limit=1']}},
  webServer:{command:'node tools/serve-godot.mjs',url:'http://127.0.0.1:8060',reuseExistingServer:!process.env.CI},
});
