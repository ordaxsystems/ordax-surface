import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { restoreHomeCollectionFocus } from "../system/surface/ui/home-collection-focus.mjs";
import { sidebarAccountAccessibleLabel } from "../system/surface/ui/sidebar-account.mjs";

function focusable(settings = {}) {
  return {disabled:false,hidden:false,closest:()=>null,
    focus(options){this.lastFocus = options;}, ...settings};
}
test("Home keeps the same focused action only when the action still exists", () => {
  const fallback = focusable();
  const home = {querySelector:selector=>{
    assert.equal(selector,".ordax-home-search");return fallback;
  }};
  const candidate = focusable();
  assert.equal(restoreHomeCollectionFocus(home,true,candidate),true);
  assert.deepEqual(candidate.lastFocus,{preventScroll:true});
  assert.equal(fallback.lastFocus,undefined);
  candidate.lastFocus=undefined;
  assert.equal(restoreHomeCollectionFocus(home,false,candidate),false);
  assert.equal(candidate.lastFocus,undefined);
});
test("Home moves keyboard focus to stable search when an item is revoked or removed", () => {
  const fallback = focusable();
  const home = {querySelector:()=>fallback};
  assert.equal(restoreHomeCollectionFocus(home,true,null),false);
  assert.deepEqual(fallback.lastFocus,{preventScroll:true});
  for(const bad of [focusable({disabled:true}), focusable({hidden:true}),
    focusable({closest:()=>({})})]){
    fallback.lastFocus=undefined;
    assert.equal(restoreHomeCollectionFocus(home,true,bad),false);
    assert.deepEqual(fallback.lastFocus,{preventScroll:true});
    assert.equal(bad.lastFocus,undefined);
  }
  assert.equal(restoreHomeCollectionFocus({querySelector:()=>focusable({disabled:true})},true,null),false);
});
test("Home Account accessible button reflects the current session without stale authority",()=>{
  const view={openLabel:"Abrir conta",displayName:"Alex Oliveira",status:"Conta conectada"};
  assert.equal(sidebarAccountAccessibleLabel(view),"Abrir conta · Alex Oliveira · Conta conectada");
  assert.equal(sidebarAccountAccessibleLabel({...view,status:"Sem conexão"}),
    "Abrir conta · Alex Oliveira · Sem conexão");
  assert.equal(sidebarAccountAccessibleLabel({...view,displayName:"Conta indisponível",status:"Reconectar"}),
    "Abrir conta · Conta indisponível · Reconectar");
});
test("Home sections recover keyboard focus when their snapshot removes the item",async()=>{
  const root = new URL("../system/surface/ui/",import.meta.url);
  for(const filename of ["home-continuation.mjs","home-pending.mjs"]){
    const code=await readFile(new URL(filename,root),"utf8");
    assert.match(code,/from "\.\/home-collection-focus\.mjs"/);
    assert.match(code,/section\?\.contains\?\.\(activeElement\) === true/);
    assert.match(code,/if \(!presentation\.visible\) \{[\s\S]*?restoreHomeCollectionFocus\(homePanel, focusedWithin\)/);
    assert.match(code,/restoreHomeCollectionFocus\(homePanel, focusedWithin, target\)/);
    assert.doesNotMatch(code,/target\?\.focus\(\{ preventScroll: true \}\)/);
  }
});
test("Native sidebar labels update reactively from the same session projection",async()=>{
  const code=await readFile(new URL("../system/surface/ui/sidebar-account.mjs",import.meta.url),"utf8");
  assert.match(code,/projectSidebarAccount\(session, snapshot\.connectivity === "offline", t\)/);
  assert.match(code,/open\.setAttribute\("aria-label", sidebarAccountAccessibleLabel\(view\)\)/);
  assert.equal((code.match(/escapeMarkup\(sidebarAccountAccessibleLabel\(view\)\)/g)??[]).length,2);
  assert.doesNotMatch(code,/localStorage|sessionStorage/);
});
