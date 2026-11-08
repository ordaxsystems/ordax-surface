import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
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


test("Native Space picker filters only authorized names without reselecting or losing focus",async()=>{
  const source=await readFile(new URL("../system/surface/ui/space-switcher-controls.mjs",import.meta.url),"utf8");
  const css=await readFile(new URL("../system/surface/ui/space-switcher.css",import.meta.url),"utf8");
  const start=source.indexOf("export function spaceSwitcherMatchesName(");
  const end=source.indexOf("// One presentation for the existing Account-owned Spaces catalog",start);
  assert.ok(start>0&&end>start);
  const matcher=runInNewContext(source.slice(start,end).replace("export function ","function ")+"\nspaceSwitcherMatchesName");
  assert.equal(matcher("Impressão 3D","impressao","pt-BR"),true);
  assert.equal(matcher("Café & Arte","  CAFE  ","pt-BR"),true);
  assert.equal(matcher("Pizzaria","escola","pt-BR"),false);
  assert.equal(matcher("Espace École","ecole","fr-FR"),true);
  assert.equal(matcher("ABC","[","pt-BR"),false,"query is literal, not a regular expression");

  const filterStart=source.indexOf("  const filterSearchResults = () => {");
  const filterEnd=source.indexOf("\n  const render = () => {",filterStart);
  assert.ok(filterStart>0&&filterEnd>filterStart);
  const row=(id,name)=>({id,dataset:{spaceSwitcherSelect:id,spaceSwitcherName:name},hidden:false});
  const all=[row("a","Café"),row("b","Pizzaria"),row("c","Impressão 3D")];
  const empty={hidden:true};
  let query="cafe";
  const slot={
    querySelectorAll:selector=>{
      assert.equal(selector,"[data-space-switcher-select]");
      return all;
    },
    querySelector:selector=>{
      assert.equal(selector,"[data-space-switcher-search-empty]");
      return empty;
    },
  };
  const context={menu:slot,open:true,get searchQuery(){return query},
    lifecycle:{localization:{getLocale:()=>"pt-BR"}},
    spaceSwitcherMatchesName:matcher};
  const filter=runInNewContext(source.slice(filterStart,filterEnd)+"\nfilterSearchResults",context);
  filter();
  assert.deepEqual(all.map(item=>item.hidden),[false,true,true]);
  assert.equal(empty.hidden,true);

  query="zzz";
  filter();
  assert.deepEqual(all.map(item=>item.hidden),[true,true,true]);
  assert.equal(empty.hidden,false,"no match is explained within the existing picker");
  query="";
  filter();
  assert.deepEqual(all.map(item=>item.hidden),[false,false,false]);
  assert.equal(empty.hidden,true,"clearing the query restores every authorized result");

  assert.match(source,/const \{ ready, active, visibleSpaces: spacesVisible, activeProfile, profilesBySpace \} =/);
  assert.match(source,/for \(const space of spacesVisible\) \{/);
  assert.match(source,/item\.dataset\.spaceSwitcherName = space\.name/);
  assert.match(source,/control\.addEventListener\("input", onInput\)/);
  assert.match(source,/control\.removeEventListener\("input", onInput\)/);
  assert.match(source,/const hadSearchFocus = hadMenuFocus/);
  assert.match(source,/if \(hadSearchFocus && searchInput\) \{/);
  assert.match(source,/searchInput\.setSelectionRange\(searchCaret, searchCaret\)/);
  assert.match(source,/if \(open && event\.key === "Escape" && control\.contains\(event\.target\)\)/);
  assert.match(source,/button:not\(:disabled\):not\(\[hidden\]\)/);
  assert.match(source,/event\.target\.matches\?\.\("\[data-space-switcher-search\]"\)/);
  assert.match(css,/\.ordax-space-switcher-search:focus-visible/);
  assert.match(css,/\.ordax-space-switcher-option\[hidden\]/);
});
