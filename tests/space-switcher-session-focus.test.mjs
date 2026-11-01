import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { restoreTransientActionFocus } from "../system/surface/ui/focus-recovery.mjs";
import { restoreHomeCollectionFocus } from "../system/surface/ui/home-collection-focus.mjs";

const button=(settings={})=>({
  disabled:false,hidden:false,closest:()=>null,
  focus(options){this.focusOptions=options},...settings,
});
test("Space switcher retains the same enabled Space option after a harmless refresh",()=>{
  const selected=button(),trigger=button();
  assert.equal(restoreTransientActionFocus(true,selected,trigger),true);
  assert.deepEqual(selected.focusOptions,{preventScroll:true});
  assert.equal(trigger.focusOptions,undefined);
});
test("Space switcher recovers focus on revocation, loading and subject change",()=>{
  for(const candidate of [null,button({disabled:true}),button({hidden:true}),
    button({closest:()=>({})})]){
    const trigger=button();
    assert.equal(restoreTransientActionFocus(true,candidate,trigger),false);
    assert.deepEqual(trigger.focusOptions,{preventScroll:true});
    assert.equal(candidate?.focusOptions,undefined);
  }
});
test("Background updates never steal focus from elsewhere",()=>{
  const candidate=button(),trigger=button();
  assert.equal(restoreTransientActionFocus(false,candidate,trigger),false);
  assert.equal(candidate.focusOptions,undefined);
  assert.equal(trigger.focusOptions,undefined);
});
test("An unusable fallback never forces a fake recovery",()=>{
  const trigger=button({disabled:true});
  assert.equal(restoreTransientActionFocus(true,null,trigger),false);
  assert.equal(trigger.focusOptions,undefined);
});
test("Home and Space switcher reuse the same single transient-focus policy",async()=>{
  const root=new URL("../system/surface/ui/",import.meta.url);
  const [switcher,home]=await Promise.all(["space-switcher-controls.mjs","home-collection-focus.mjs"].map(p=>readFile(new URL(p,root),"utf8")));
  assert.match(home,/from "\.\/focus-recovery\.mjs"/);
  assert.match(home,/restoreTransientActionFocus\(/);
  const fallback=button();
  assert.equal(restoreHomeCollectionFocus({querySelector:()=>fallback},true,null),false);
  assert.deepEqual(fallback.focusOptions,{preventScroll:true});
  assert.match(switcher,/from "\.\/focus-recovery\.mjs"/);
  assert.match(switcher,/const hadMenuFocus = menu\.contains\(focusedElement\)/);
  assert.match(switcher,/restoreTransientActionFocus\(hadMenuFocus, null, trigger\)/);
  assert.match(switcher,/restoreTransientActionFocus\(hadMenuFocus, focusTarget, trigger\)/);
  assert.match(switcher,/identityPresentationContextChanged\(observedIdentity, nextIdentity\)/);
  assert.match(switcher,/refreshRevision \+= 1/);
  assert.match(switcher,/const authorized = deriveAuthorizedSpaces\(identity, catalog, selection\)/);
  assert.match(switcher,/if \(!authorized\.ready\) return/);
});
