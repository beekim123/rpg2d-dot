// Local build/test tools always use one compute worker, independent of CPU count.
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
const require=createRequire(import.meta.url);
const packages={vite:'vite',tsc:'typescript',vitest:'vitest',playwright:'@playwright/test'};
const [command,...args]=process.argv.slice(2);
if(!Object.hasOwn(packages,command))throw new Error('Unknown project tool');
const manifestPath=require.resolve(`${packages[command]}/package.json`),manifest=require(manifestPath);
const binary=typeof manifest.bin==='string'?manifest.bin:manifest.bin[command];
const env={...process.env};
for(const name of ['OMP_NUM_THREADS','OPENBLAS_NUM_THREADS','MKL_NUM_THREADS','VECLIB_MAXIMUM_THREADS','RAYON_NUM_THREADS','UV_THREADPOOL_SIZE'])env[name]='1';
const child=spawnSync(process.execPath,[resolve(dirname(manifestPath),binary),...args],{stdio:'inherit',env});
if(child.error)throw child.error;
process.exit(child.status??1);
