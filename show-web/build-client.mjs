// SPDX-License-Identifier: GPL-3.0-or-later
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('.',import.meta.url));
export async function buildClient(){
 const result=await build({entryPoints:[join(root,'client.js')],bundle:true,write:false,format:'iife',target:'es2020',minify:true,legalComments:'inline',plugins:[{name:'room-paths',setup(b){b.onResolve({filter:/^\//},args=>args.kind==='entry-point'?null:({path:args.path==='/vendor/VRButton.js'?join(root,'node_modules/three/examples/jsm/webxr/VRButton.js'):join(root,args.path.slice(1))}));}}]});
 const license=await readFile(join(root,'THIRD-PARTY-LICENSES.txt'),'utf8');
 const bytes=Buffer.concat([Buffer.from('/*! Cardinal 3D: GPL-3.0-or-later. Bundled dependency notices:\n'+license.replaceAll('*/','* /')+'*/\n'),Buffer.from(result.outputFiles[0].contents)]),hash=createHash('sha256').update(bytes).digest('hex').slice(0,16);
 return {bytes,path:`/room-app-${hash}.js`};
}
