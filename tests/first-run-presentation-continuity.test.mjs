import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {captureFirstRunFocus,restoreFirstRunFocus,captureFirstRunReadingState,restoreFirstRunReadingState}
  from "../system/surface/ui/first-run-presentation-state.mjs";
const mk=(attrs={},dataset={},rest={})=>({
  attributes:Object.entries(attrs).map(([name,value])=>({name,value})),
  dataset,disabled:false,hidden:false,closest:()=>null,
  getAttribute:name=>attrs[name]??null,
  focus(){this.focused=true;},...rest,
});
test("First Run retains the exact SSID rather than the first Wi-Fi action",()=>{
  const first=mk({"data-first-run-action":"network-select"},{firstRunSsid:"first"});
  const second=mk({"data-first-run-action":"network-select"},{firstRunSsid:"second"});
  const overlay={contains:n=>n===second,querySelectorAll:()=>[first,second],querySelector:()=>null};
  const intent=captureFirstRunFocus(overlay,second);
  assert.equal(intent.ssid,"second");
  assert.equal(restoreFirstRunFocus(overlay,intent),true);
  assert.equal(first.focused,undefined);
  assert.equal(second.focused,true);
});
test("First Run revocation or disappearance returns focus safely to the heading",()=>{
  const old=mk({"data-first-run-action":"network-select"},{firstRunSsid:"gone"});
  const wrong=mk({"data-first-run-action":"network-select"},{firstRunSsid:"other"});
  const heading=mk();
  const overlay={contains:()=>true,querySelectorAll:()=>[wrong],querySelector:()=>heading};
  const intent=captureFirstRunFocus(overlay,old);
  assert.equal(restoreFirstRunFocus(overlay,intent),false);
  assert.equal(wrong.focused,undefined);
  assert.equal(heading.focused,true);
  const disabled=mk({"data-first-run-action":"network-select"},{firstRunSsid:"gone"},{disabled:true});
  overlay.querySelectorAll=()=>[disabled];
  assert.equal(restoreFirstRunFocus(overlay,intent),false);
});
test("First Run retains only caret metadata, never credential values",()=>{
  const old=mk({"data-first-run-identity-password":""},{},{selectionStart:1,selectionEnd:4,selectionDirection:"forward",value:"secret"});
  const current=mk({"data-first-run-identity-password":""},{},{setSelectionRange(a,b,c){this.selection=[a,b,c]}});
  const overlay={contains:n=>n===old,querySelectorAll:()=>[current],querySelector:()=>null};
  const state=captureFirstRunFocus(overlay,old);
  assert.equal(JSON.stringify(state).includes("secret"),false);
  assert.equal(restoreFirstRunFocus(overlay,state),true);
  assert.deepEqual(current.selection,[1,4,"forward"]);
});
test("First Run maintains disclosures and scroll position within a refreshed step",()=>{
  const old={scrollTop:290,querySelector:s=>s===".ordax-first-run-account-documents"?{open:true}:null};
  const state=captureFirstRunReadingState(old);
  const details={open:false};
  const current={scrollTop:0,querySelector:s=>s===".ordax-first-run-account-documents"?details:null};
  restoreFirstRunReadingState(current,state);
  assert.equal(current.scrollTop,290);
  assert.equal(details.open,true);
  restoreFirstRunReadingState(null,state);
});
test("First Run wiring respects authoritative login and offline setup",async()=>{
  const s=await readFile(new URL("../system/surface/ui/first-run.mjs",import.meta.url),"utf8");
  const css=await readFile(new URL("../system/surface/ui/first-run.css",import.meta.url),"utf8");
  assert.match(s,/captureFirstRunFocus\(overlay, documentObject\.activeElement\)/);
  assert.match(s,/restoreFirstRunFocus\(overlay, previousFocus\)/);
  assert.match(s,/if \(sameStep\) restoreFirstRunReadingState\(body, previousReading\)/);
  assert.match(s,/draft\.accountMode = "local-only"/);
  assert.match(s,/identityAvailabilityPending/);
  assert.match(css,/\.ordax-first-run-action \{\s*min-height: 44px;/);
  assert.match(css,/@container \(max-width: 420px\)/);
});
