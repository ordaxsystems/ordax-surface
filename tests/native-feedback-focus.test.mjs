import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { markSurfaceFeedback } from "../system/surface/ui/surface-feedback.mjs";
import { restoreSectionFocusFallback } from "../system/surface/ui/section-navigation.mjs";

const fixture=()=>({
  dataset:{},attrs:new Map(),setAttribute(k,v){this.attrs.set(k,v);},
});

test("Shared Native feedback is an atomic polite status with explicit tone",()=>{
  const status=fixture();
  assert.equal(markSurfaceFeedback(status,"attention"),status);
  assert.equal(status.dataset.surfaceFeedbackTone,"attention");
  assert.equal(status.attrs.get("role"),"status");
  assert.equal(status.attrs.get("aria-live"),"polite");
  assert.equal(status.attrs.get("aria-atomic"),"true");
  const informational=fixture();
  markSurfaceFeedback(informational);
  assert.equal(informational.dataset.surfaceFeedbackTone,"information");
  assert.throws(()=>markSurfaceFeedback(fixture(),"successfully-installed"),TypeError);
});

function activeSection({disabled=false,hidden=false,ancestorHidden=false}={}){
  return {
    disabled,hidden,closest:()=>ancestorHidden?{}:null,
    focus(options){this.focused=options;},
  };
}
test("Native Section recovers keyboard focus only when action disappears or is revoked",()=>{
  const active=activeSection();
  const slot={querySelector:selector=>{
    assert.equal(selector,'.ordax-section-navigation-item[aria-current="page"]');
    return active;
  }};
  assert.equal(restoreSectionFocusFallback(slot,{kind:"action",value:"remove"},null),true);
  assert.deepEqual(active.focused,{preventScroll:true});
  active.focused=null;
  assert.equal(restoreSectionFocusFallback(slot,{kind:"action"},activeSection()),false);
  assert.equal(active.focused,null);
  assert.equal(restoreSectionFocusFallback(slot,null,null),false);
  assert.equal(restoreSectionFocusFallback(slot,{kind:"action"},activeSection({disabled:true})),true);
  assert.equal(restoreSectionFocusFallback(slot,{kind:"action"},activeSection({hidden:true})),true);
  assert.equal(restoreSectionFocusFallback(slot,{kind:"action"},activeSection({ancestorHidden:true})),true);
  assert.equal(restoreSectionFocusFallback({querySelector:()=>activeSection({disabled:true})},{kind:"action"},null),false);
});

test("Account distinguishes confirmed information from failure in semantic Meridian tokens",async()=>{
  const code=await readFile(new URL("../system/surface/ui/account-overview-controls.mjs",import.meta.url),"utf8");
  const css=await readFile(new URL("../system/surface/ui/account.css",import.meta.url),"utf8");
  for(const [messageId,tone] of [
    ["account.lifecycle.close.closed","closeMessageTone"],["account.spaces.create.createdPending","createMessageTone"],
    ["account.profiles.activated","profileMessageTone"],["account.profiles.deactivated","profileMessageTone"],
  ]){
    assert.match(code,new RegExp('= t\\("'+messageId.replace(/\./g,"\\.")+'"\\);\\s*'+tone+' = "information"'));
  }
  assert.match(code,/createMessageTone = "attention"/);
  assert.match(code,/profileMessageTone = "attention"/);
  assert.match(code,/closeMessageTone = "attention"/);
  assert.match(css,/\.ordax-account-message\[data-surface-feedback-tone="information"\]/);
  assert.match(css,/var\(--ordax-subtle-bg\)/);
  assert.match(css,/var\(--ordax-danger-bg\)/);
});

test("Account, Settings and System use shared accessibility and safe focus fallback",async()=>{
  for(const name of ["account","settings","system"]){
    const code=await readFile(new URL("../system/surface/ui/"+name+"-overview-controls.mjs",import.meta.url),"utf8");
    assert.match(code,/from "\.\/surface-feedback\.mjs"/);
    assert.match(code,/markSurfaceFeedback\(/);
    assert.match(code,/restoreSectionFocusFallback\(slot, snapshot\.focus,/);
    assert.match(code,/from "\.\/section-navigation\.mjs"/);
  }
  const system=await readFile(new URL("../system/surface/ui/system-overview-controls.mjs",import.meta.url),"utf8");
  for(const id of ["metricsMessageId","recoveryMessageId","historyMessageId"]){
    assert.match(system,new RegExp("markSurfaceFeedback\\([\\s\\S]*"+id));
  }
});
