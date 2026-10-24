// Surface-owned build-time renderer; staged in a disposable OS checkout.
// The only output is the explicit directory argument, never OS/Site source.
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import postcss from 'postcss';
import {readFile,readdir,mkdir,writeFile,rm,lstat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const out=resolve(process.argv[2]??''),surface=resolve(process.argv[3]??'');
const inside=(a,b)=>b===a||b.startsWith(a+sep);
if(process.argv.length!==4||inside(root,out)||inside(surface,out)||inside(out,root)||inside(out,surface))
  throw Error('Required external output and Surface source directory');
const git=(dir,...args)=>execFileSync('git',['-C',dir,...args],{encoding:'utf8'}).trim();
const osSha=git(root,'rev-parse','HEAD'),surfaceSha=git(surface,'rev-parse','HEAD');
if(surfaceSha!==process.env.ORDAX_SURFACE_CANDIDATE_SHA
  ||git(root,'ls-files','--','system/surface/ui','system/surface/workspace'))
  throw Error('Surface or OS checkout authority mismatch');
const digest=data=>createHash('sha256').update(data).digest('hex');
const gitBlob=data=>createHash('sha1').update(Buffer.concat([Buffer.from('blob '+data.length+'\0'),data])).digest('hex');
const blobs=(dir,prefixes)=>new Map(git(dir,'ls-tree','-r','HEAD','--',...prefixes).split('\n').filter(Boolean)
  .map(line=>{
    const match=/^(100644|100755) blob ([0-9a-f]{40})\t(.+)$/.exec(line);
    if(!match)throw Error('Unsupported Git source entry');
    return [match[3],match[2]];
  }));
const owned=blobs(surface,['system/surface/ui','system/surface/workspace','tools/public-artifacts']);
const hosted=blobs(root,['system/services','system/contracts','system/apps','system/surface/runtime','system/surface/entrypoint']);
const used=new Set([resolve(root,'tools/surface-demo/meridian-preview-entry.tsx'),resolve(root,'tools/surface-demo/meridian-preview.mjs')]);
const identityMock="import {projectSidebarAccount} from '"+resolve(root,'system/surface/ui/sidebar-account.mjs').replaceAll('\\','/')+"';export function useWebAccount(t){const identity={state:'signed-out'};const sidebarAccount=projectSidebarAccount(identity,false,t);return {identity,actions:{supportedActions:[],pending:false},displayName:sidebarAccount.displayName,initials:sidebarAccount.initials,sidebarAccount,offline:false,authorized:{ready:false,visibleSpaces:[],activeSpace:null}}}";
const adapters=new Map([
 ['account-context',identityMock],
 ['preferences-context',"export function useWebPreferences(){return {theme:'light',colorTheme:'light',snapshot:{},persistence:{state:'memory'},setColorTheme(){},setPreference(){}}}"],
 ['client-context',"export function useIntelligenceClient(){return {snapshot:{state:'unavailable',inferenceAvailable:false}}}"]
]);
const plugin={
 name:'readonly-surface-demo-adapters',enforce:'pre',
 resolveId(specifier,importer){
   if(!importer||!importer.replaceAll('\\','/').includes('/system/surface/workspace/'))return null;
   const name=specifier.split('/').at(-1).replace(/\.tsx$/,'');
   return adapters.has(name)?'\0preview:'+name:null;
 },
 load(id){return id.startsWith('\0preview:')?adapters.get(id.slice(9)):null},
 transform(_source,id){
   const path=id.split('?')[0];
   if(path.startsWith(root+sep)&&!path.includes(sep+'node_modules'+sep))used.add(path);
   return null;
 }
};
try{await lstat(out);throw Error('Refusing to overwrite existing output')}catch(e){if(e.code!=='ENOENT')throw e}
await mkdir(dirname(out),{recursive:true});
await build({configFile:false,root,plugins:[plugin,react(),tailwind()],
 resolve:{alias:{'@':resolve(root,'system/surface/workspace')}},
 build:{ssr:resolve(root,'tools/surface-demo/meridian-preview-entry.tsx'),
 outDir:out,emptyOutDir:false,ssrEmitAssets:true,cssCodeSplit:false,
 rollupOptions:{output:{entryFileNames:'render.mjs'}}},logLevel:'warn'});
const {renderMeridianPresentation}=await import(pathToFileURL(resolve(out,'render.mjs')).href);
const preview=renderMeridianPresentation();
await rm(resolve(out,'render.mjs'));
const sources=[];
for(const file of [...used].sort()){
  const name=relative(root,file).replaceAll('\\','/');
  if(name.startsWith('..'))throw Error('External dependency outside integration host: '+name);
  const visual=name.startsWith('system/surface/ui/')||name.startsWith('system/surface/workspace/');
  const ownerEntry=name.startsWith('tools/surface-demo/');
  const osOwner=name.startsWith('system/services/')||name.startsWith('system/contracts/')
    ||name.startsWith('system/apps/')||name.startsWith('system/surface/runtime/')
    ||name.startsWith('system/surface/entrypoint/');
  if(!visual&&!ownerEntry&&!osOwner)throw Error('Unrecognized source owner: '+name);
  const repo=visual||ownerEntry?surface:root;
  const path=ownerEntry?'tools/public-artifacts/'+name.slice('tools/surface-demo/'.length):name;
  const expected=(repo===surface?owned:hosted).get(path);
  if(!expected)throw Error('Untracked dependency: '+path);
  const bytes=await readFile(resolve(repo,path));
  if(gitBlob(bytes)!==expected||!bytes.equals(await readFile(file)))
    throw Error('Modified source dependency: '+path);
  sources.push({repository:repo===surface?'ordaxsystems/ordax-surface':'ordaxsystems/ordax-os',
    commit:repo===surface?surfaceSha:osSha,path,git_blob:expected,sha256:digest(bytes)});
}
const assets=resolve(out,'assets');
const cssFiles=(await readdir(assets)).filter(name=>name.endsWith('.css'));
if(cssFiles.length!==1)throw Error('Expected one Surface CSS bundle');
const cssTree=postcss.parse(await readFile(resolve(assets,cssFiles[0]),'utf8'));
cssTree.walkAtRules('import',()=>{throw Error('External CSS import forbidden')});
cssTree.walkComments(rule=>rule.remove());
cssTree.walkRules(rule=>{
  if(rule.parent.type==='atrule'&&/keyframes$/.test(rule.parent.name))return;
  rule.selectors=rule.selectors.map(selector=>
    '.demo-native '+selector.replace(/(^|[ ,])(?:html|body|:root)(?=$|[ .:#[])/g,
    '$1.demo-native-root'));
});
cssTree.walkAtRules('media',rule=>{
  if(/\bwidth\b/.test(rule.params)){rule.name='container';rule.params='public-surface '+rule.params}
});
let inline='',ordinal=0;
function noInlineStyles(html){
 return html.replace(/<([a-z][a-z0-9-]*)([^>]*?) style="([^"]*)"([^>]*)>/g,
 (_all,tag,before,style,after)=>{
   if(/url\s*\(|[{}]/i.test(style))throw Error('Forbidden dynamic preview style');
   const cls='snapshot-style-'+(++ordinal);
   inline+=' .demo-native .'+cls+'{'+style.replaceAll('&quot;','"')+'}';
   let attrs=before+after;
   if(/class="/.test(attrs))attrs=attrs.replace('class="','class="'+cls+' ');
   else attrs+=' class="'+cls+'"';
   return '<'+tag+attrs+'>';
 });
}
preview.chrome=noInlineStyles(preview.chrome);
for(const id of Object.keys(preview.views))preview.views[id]=noInlineStyles(preview.views[id]);
if(Object.keys(preview.views).length!==11||!preview.views.home||!preview.chrome.includes('demo-native-root'))
 throw Error('Incomplete readonly Surface demo');
const html=[preview.chrome,...Object.values(preview.views)].join('');
if(/<script\b|<iframe\b|<form\b[^>]*action=/i.test(html))
 throw Error('Executable or authoritative browser UI prohibited');
const css=cssTree.toString()+inline;
await writeFile(resolve(assets,'surface-preview.css'),css);
await rm(resolve(assets,cssFiles[0]));
preview.format='ordax.meridian-readonly-preview/1';
preview.presentation='example-only-not-an-authorized-session';
preview.sources=sources;
preview.cssSha256=digest(Buffer.from(css));
await writeFile(resolve(assets,'surface-preview.json'),JSON.stringify(preview)+'\n');
const items=[];
async function scan(dir){
 for(const part of await readdir(dir,{withFileTypes:true})){
   if(part.isSymbolicLink())throw Error('Output symlink forbidden');
   const path=resolve(dir,part.name);
   if(part.isDirectory())await scan(path);
   else if(part.isFile()){
     const data=await readFile(path);
     items.push({path:relative(out,path).replaceAll('\\','/'),size:data.length,sha256:digest(data)});
   }else throw Error('Unexpected output entry');
 }
}
await scan(out);
items.sort((a,b)=>a.path.localeCompare(b.path));
await writeFile(resolve(out,'manifest.json'),JSON.stringify({
 $schema:'ordax.meridian-readonly-preview-artifact/1',status:'candidate-not-published',
 artifact_class:'ordax-meridian-preview',runtime_authority:false,
 source_repository:'ordaxsystems/ordax-surface',source_commit:surfaceSha,
 os_host_repository:'ordaxsystems/ordax-os',os_host_commit:osSha,
 files:items
},null,2)+'\n');
console.log('MERIDIAN_READONLY_PREVIEW=PASS views=11 files='+items.length+
 ' surface='+surfaceSha+' host='+osSha);
