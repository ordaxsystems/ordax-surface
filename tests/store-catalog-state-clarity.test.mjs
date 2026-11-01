import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { storeEntryVisualState } from "../system/surface/ui/store-overview-controls.mjs";

const fixture=(state,extra={})=>({
  appId:"com.example.tool",title:"Ferramenta",state,installedVersion:"1.0.0",
  availableVersion:"2.0.0",updatable:false,blockedReason:null,...extra,
});

test("State projections use OS eligibility, not version guesses",()=>{
  assert.equal(storeEntryVisualState(fixture("installed")).updateAvailable,false);
  assert.equal(storeEntryVisualState(fixture("installed",{updatable:true})).updateAvailable,true);
  assert.equal(storeEntryVisualState(fixture("available",{updatable:true})).updateAvailable,false);
});

test("In-progress and terminal states retain OS names and failure reasons",()=>{
  for(const state of ["available","installed","installing","updating","removing","staged","failed-retained"]){
    const visual=storeEntryVisualState(fixture(state));
    assert.equal(visual.state,state);
    assert.equal(visual.blockedReason,null);
    assert.equal(visual.requestPhase,null);
  }
  const blocked=storeEntryVisualState(fixture("blocked",{blockedReason:"Incompatível com dispositivo"}));
  assert.equal(blocked.blockedReason,"Incompatível com dispositivo");
});

test("Accepted lifecycle request cannot turn available into installed",()=>{
  const entry=fixture("available");
  const received=storeEntryVisualState(entry,{appId:entry.appId,operation:"install",phase:"accepted"});
  assert.equal(received.state,"available");
  assert.equal(received.requestPhase,"accepted");
  assert.equal(received.requestOperation,"install");
  assert.equal(storeEntryVisualState(entry,{appId:"other",operation:"install",phase:"accepted"}).requestPhase,null);
  assert.equal(storeEntryVisualState(entry,{appId:entry.appId,operation:"fake",phase:"accepted"}).requestPhase,null);
  assert.equal(storeEntryVisualState(entry,{appId:entry.appId,operation:"install",phase:"complete"}).requestPhase,null);
  assert.equal(storeEntryVisualState(entry,{appId:entry.appId,operation:"update",phase:"requesting"}).requestPhase,"requesting");
});

test("One Store renderer uses localized statuses and existing Meridian tokens",async()=>{
  const s=await readFile(new URL("../system/surface/ui/store-overview-controls.mjs",import.meta.url),"utf8");
  const css=await readFile(new URL("../system/surface/ui/store.css",import.meta.url),"utf8");
  assert.match(s,/appendStatus\(documentObject, footer, entry, pendingRequest, t\)/);
  assert.match(s,/appendStatus\(documentObject, state, entry, pendingRequest, t\)/);
  assert.match(s,/t\("store\.section\.updates"\)/);
  assert.match(s,/t\("store\.request\." \+ visual\.requestOperation \+ "\.accepted"\)/);
  assert.match(s,/t\("store\.details\.blocked"\) \+ " " \+ entry\.blockedReason/);
  assert.match(s,/note\.dataset\.storeRequestPhase = visual\.requestPhase/);
  assert.match(css,/\.ordax-store-update-status\[data-store-update-available="true"\]/);
  assert.match(css,/\.ordax-store-card-status\[data-store-entry-state="staged"\]/);
  assert.match(css,/\.ordax-store-card-warning \{/);
  assert.doesNotMatch(s,/\b(progressPercent|fakeProgress|simulatedProgress)\b/);
});
