import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { meridianHomeContextKey } from "../system/surface/ui/meridian-home-context.mjs";

const src=new URL("../system/surface/workspace/components/",import.meta.url);
const read=async path=>readFile(new URL(path,src),"utf8");
const signedIn=(id)=>({state:"signed-in",subjectId:id});
const space=(id)=>({id,name:id,kind:"personal",state:"active"});

test("Home-to-Aura prompt envelope differentiates subject, authorized Space, and logout",()=>{
  const from=meridianHomeContextKey(signedIn("user-a"),space("space-one"));
  assert.equal(from,meridianHomeContextKey(signedIn("user-a"),space("space-one")));
  assert.notEqual(from,meridianHomeContextKey(signedIn("user-b"),space("space-one")));
  assert.notEqual(from,meridianHomeContextKey(signedIn("user-a"),space("space-two")));
  assert.notEqual(from,meridianHomeContextKey(signedIn("user-a"),null));
  assert.notEqual(from,meridianHomeContextKey({state:"signed-out"},null));
  assert.notEqual(from,meridianHomeContextKey({state:"unavailable"},null));
  assert.notEqual(from,undefined);
});

test("Home checks live OS identity/catalog/selection before forwarding prompt and scope",async()=>{
  const code=await read("central/meridian-home.tsx");
  const action=code.slice(code.indexOf("  function submit(event:FormEvent)"),code.indexOf("  return <div className=",code.indexOf("  function submit(event:FormEvent)")));
  assert.match(code,/import \{ deriveAuthorizedSpaces \} from '\.\.\/\.\.\/\.\.\/\.\.\/services\/spaces\/authorized-view\.mjs'/);
  assert.match(action,/const scopeKey=meridianHomeContextKey\(identity,authorized\.activeSpace\)/);
  assert.match(action,/const liveIdentity=session\.identity\.getSnapshot\(\)/);
  assert.match(action,/liveIdentity,session\.spaces\.getSnapshot\(\),session\.selection\.getSnapshot\(\)/);
  assert.match(action,/if\(scopeKey!==meridianHomeContextKey\(liveIdentity,liveAuthorized\.activeSpace\)\)return/);
  assert.match(action,/onPrompt\(\{text,scopeKey\}\)/);
  assert.doesNotMatch(action,/onPrompt\(text\)/);
});

test("Central and window reducer retain source context with initial Aura prompt",async()=>{
  const [central,reducer,window]=await Promise.all([
    read("central/central.tsx"),read("central/desktop-state.ts"),read("central/window-content.tsx"),
  ]);
  assert.match(central,/prompt:text, promptScope:scopeKey/);
  assert.match(reducer,/promptScope\?: string/);
  assert.match(reducer,/initialPrompt: \{ text: action\.prompt, scopeKey: action\.promptScope \}/);
  assert.match(window,/initialPrompt=\{props\.initialPrompt\}/);
});

test("Aura rejects unscoped or cross-account initial prompts, including remounts",async()=>{
  const code=await read("intelligence/aura-content.tsx");
  const effect=code.slice(code.indexOf("  useEffect(() => {\n    if (initialPrompt === undefined"),code.indexOf("  function submit(event: FormEvent)"));
  assert.match(code,/const scopeKey = meridianHomeContextKey\(identity, authorized\.activeSpace\)/);
  assert.match(effect,/consumedInitialPrompt\.current = initialPrompt/);
  assert.match(effect,/if \(initialPrompt\.scopeKey !== scopeKey\) return/);
  assert.match(effect,/void run\(initialPrompt\.text\)/);
  assert.doesNotMatch(effect,/void run\(initialPrompt\.text\);[\s\S]*if \(initialPrompt\.scopeKey/);
});

test("Aura rechecks current authoritative OS projection for all outbound inference",async()=>{
  const code=await read("intelligence/aura-content.tsx");
  const start=code.indexOf("  const run = useCallback(");
  const end=code.indexOf("  useEffect(() => {\n    if (initialPrompt === undefined",start);
  const run=code.slice(start,end);
  assert.match(run,/conversation\.getScope\(\) !== scopeKey/);
  assert.match(run,/const liveIdentity = session\.identity\.getSnapshot\(\)/);
  assert.match(run,/liveIdentity, session\.spaces\.getSnapshot\(\), session\.selection\.getSnapshot\(\)/);
  assert.match(run,/meridianHomeContextKey\(liveIdentity, liveAuthorized\.activeSpace\) !== scopeKey/);
  assert.ok(run.indexOf("liveAuthorized.activeSpace")<run.indexOf("client.ask("));
  assert.match(run,/controller\.signal/);
});
