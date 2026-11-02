import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { meridianHomeContextKey } from "../system/surface/ui/meridian-home-context.mjs";

const signedIn=(subjectId)=>({state:"signed-in",subjectId,displayName:"Visitante"});
const space=(id)=>({id,name:id,kind:"work",state:"active"});

test("Meridian drafts remain scoped to the same OS identity and authorized Space",()=>{
  const same=meridianHomeContextKey(signedIn("alpha"),space("work"));
  assert.equal(same,meridianHomeContextKey(signedIn("alpha"),space("work")));
  assert.notEqual(same,meridianHomeContextKey(signedIn("alpha"),space("personal")));
  assert.notEqual(same,meridianHomeContextKey(signedIn("beta"),space("work")));
  assert.notEqual(same,meridianHomeContextKey(signedIn("alpha"),null));
  assert.notEqual(same,meridianHomeContextKey({state:"signed-out"},null));
  assert.notEqual(same,meridianHomeContextKey({state:"unavailable"},null));
});
test("Meridian context key prevents separator collisions between subjects and Spaces",()=>{
  assert.notEqual(
    meridianHomeContextKey(signedIn("alpha:one"),space("two")),
    meridianHomeContextKey(signedIn("alpha"),space("one:two")),
  );
  assert.equal(meridianHomeContextKey({state:"signed-out"},null),
    meridianHomeContextKey({state:"signed-out"},space("unused")));
});
test("Home remounts local prompt and mock checklist before presenting another context",async()=>{
  const s=await readFile(new URL("../system/surface/workspace/components/central/meridian-home.tsx",import.meta.url),"utf8");
  const wrapper=s.slice(s.indexOf("export function MeridianHome("),s.indexOf("function MeridianHomeContext("));
  const content=s.slice(s.indexOf("function MeridianHomeContext("));
  assert.match(wrapper,/const \{identity,authorized\}=useWebAccount\(\)/);
  assert.match(wrapper,/key=\{meridianHomeContextKey\(identity, authorized\.activeSpace\)\}/);
  assert.doesNotMatch(wrapper,/setPrompt|setTasks|useEffect/);
  assert.match(content,/const \[prompt,setPrompt\]=useState\(''\)/);
  assert.match(content,/const \[tasks,setTasks\]=useState<string\[\]>\(\[\]\)/);
  assert.match(content,/const text=prompt\.trim\(\)/);
  assert.match(content,/onPrompt\(\{text,scopeKey\}\)/);
  assert.doesNotMatch(s,/localStorage|sessionStorage/);
});
test("Meridian Home status uses canonical identity presentation, not offline-first signout text",async()=>{
  const s=await readFile(new URL("../system/surface/workspace/components/central/meridian-home.tsx",import.meta.url),"utf8");
  assert.match(s,/const \{session,identity,displayName,authorized,sidebarAccount\}=useWebAccount\(\)/);
  assert.match(s,/Conta · \{sidebarAccount\.status\}/);
  assert.doesNotMatch(s,/\{offline\?'Conta sem conexão'/);
  const projection=await readFile(new URL("../system/surface/ui/sidebar-account.mjs",import.meta.url),"utf8");
  assert.match(projection,/sidebarAccountStatusKey\(session\.state, offline\)/);
  assert.match(projection,/validateIdentitySessionSnapshot\(identity\)/);
});
