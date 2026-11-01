import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { storeEmptyPresentation } from "../system/surface/ui/store-entry-presentation.mjs";
import { captureStoreControlFocus, restoreStoreControlFocus } from "../system/surface/ui/store-control-focus.mjs";

test("Store distinguishes ready empty catalog from an unavailable catalog", () => {
  const empty=storeEmptyPresentation(0,0,"discover","");
  assert.equal(empty.reason,"catalog-empty");
  assert.equal(empty.descriptionId,"store.section.description.discover");
  assert.notEqual(empty.titleId,"store.status.unavailable");
  assert.equal(storeEmptyPresentation(0,0,"installed","anything").reason,"catalog-empty");
});

test("Store empty sections and unmatched search have contextual existing translations",()=>{
  assert.equal(storeEmptyPresentation(5,0,"installed","").reason,"section-empty");
  assert.equal(storeEmptyPresentation(5,0,"installed","").titleId,"store.section.installed");
  assert.equal(storeEmptyPresentation(5,0,"updates","").descriptionId,"store.section.description.updates");
  assert.equal(storeEmptyPresentation(5,0,"installed","busca").reason,"search-empty");
  assert.equal(storeEmptyPresentation(5,0,"installed","busca").descriptionId,"store.empty.filteredDescription");
  assert.equal(storeEmptyPresentation(5,3,"discover",""),null);
});

function button(dataset,opts={}){
  const state={tagName:"BUTTON",dataset,disabled:!!opts.disabled,hidden:!!opts.hidden,focused:false};
  state.closest=()=>opts.ancestorHidden?{}:null;
  state.focus=()=>{state.focused=true;};
  return state;
}
test("Store restores keyboard focus for the same app action after repaint",()=>{
  const old=button({storeOperation:"update",storeAppId:"app.one"});
  const previous={contains:node=>node===old};
  const intent=captureStoreControlFocus(previous,{activeElement:old});
  const wrong=button({storeOperation:"update",storeAppId:"app.other"});
  const right=button({storeOperation:"update",storeAppId:"app.one"});
  assert.equal(restoreStoreControlFocus({querySelectorAll:()=>[wrong,right]},intent),true);
  assert.equal(wrong.focused,false);
  assert.equal(right.focused,true);
});

test("Store cannot restore focus to a revoked or hidden action",()=>{
  const intent={key:"storeOperation",value:"install",appId:"app.one"};
  const disabled=button({storeOperation:"install",storeAppId:"app.one"},{disabled:true});
  const hidden=button({storeOperation:"install",storeAppId:"app.one"},{ancestorHidden:true});
  assert.equal(restoreStoreControlFocus({querySelectorAll:()=>[disabled,hidden]},intent),false);
  const navigation=button({storeView:"installed"});
  assert.equal(restoreStoreControlFocus({querySelectorAll:()=>[navigation]},{key:"storeView",value:"installed"}),true);
  assert.equal(navigation.focused,true);
  assert.equal(captureStoreControlFocus({contains:()=>false},{activeElement:navigation}),null);
});

test("Shared Store wires live empty variants, semantic status and compact detail layout",async()=>{
  const s=await readFile(new URL("../system/surface/ui/store-overview-controls.mjs",import.meta.url),"utf8");
  const css=await readFile(new URL("../system/surface/ui/store.css",import.meta.url),"utf8");
  assert.match(s,/storeEmptyPresentation\(snapshot\.entries\.length, filtered\.length, activeView, searchQuery\)/);
  assert.match(s,/empty\.dataset\.storeEmptyReason = presentation\.reason/);
  assert.match(s,/empty\.dataset\.storeEmptyReason = "catalog-unavailable"/);
  assert.match(s,/count\.setAttribute\("aria-live", "polite"\)/);
  assert.match(s,/captureStoreControlFocus\(slot, slot\.ownerDocument\)/);
  assert.match(s,/restoreStoreControlFocus\(slot, previousControlFocus\)/);
  assert.match(s,/panel\.dataset\.storeDetailAppId = entry\.appId/);
  assert.match(css,/@container \(max-width: 480px\)/);
  assert.match(css,/\.ordax-store-detail-state \.ordax-store-actions \{\s*width: 100%;/);
});
