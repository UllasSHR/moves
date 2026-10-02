import {build} from 'esbuild';
await build({entryPoints:['src/tracker.worker.ts'],bundle:true,format:'iife',platform:'browser',target:'es2022',outfile:'public/tracker.js'});
