import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {projectHomeSyncStatus} from "../system/surface/ui/home-sync-presentation.mjs";

const t=(id)=>"locale:"+id;
const active={transport:"available",accountContinuity:"active",pendingMutationCount:0};
const notActive={...active,accountContinuity:"not-active"};
const hostRequired={...active,transport:"host-required"};

test("Home Sync never projects signed-out from a temporarily inactive service",()=>{
  assert.deepEqual(projectHomeSyncStatus(notActive,"ready",{state:"signed-in"},t,"pt-BR"),{
    text:"locale:home.status.unavailable",state:"unavailable",
  });
  assert.deepEqual(projectHomeSyncStatus(hostRequired,"ready",{state:"signed-in"},t,"pt-BR"),{
    text:"locale:home.status.sync.waiting",state:"neutral",
  });
  assert.deepEqual(projectHomeSyncStatus(active,"ready",{state:"signed-in"},t,"pt-BR"),{
    text:"locale:home.status.sync.current",state:"success",
  });
});
test("Only a genuine signed-out identity projects No account",()=>{
  const disconnected=projectHomeSyncStatus(notActive,"ready",{state:"signed-out"},t,"en-US");
  assert.equal(disconnected.text,"locale:home.status.account.signedOut");
  assert.equal(disconnected.state,"neutral");
  for(const identity of [null,{state:"unavailable"}]){
    const x=projectHomeSyncStatus(active,"ready",identity,t,"en-US");
    assert.deepEqual(x,{text:"locale:home.status.unavailable",state:"unavailable"});
  }
});
test("Pending queue remains visible even during offline or signed-out transitions",()=>{
  const queue={...hostRequired,pendingMutationCount:2};
  for(const identity of [{state:"signed-in"},{state:"signed-out"},{state:"unavailable"}]){
    const result=projectHomeSyncStatus(queue,"ready",identity,t,"pt-BR");
    assert.equal(result.text,"2 locale:home.status.sync.pendingMany");
    assert.equal(result.state,"pending");
  }
  const singular=projectHomeSyncStatus({...queue,pendingMutationCount:1},"ready",{state:"signed-in"},t,"en-US");
  assert.equal(singular.text,"1 locale:home.status.sync.pendingOne");
});
test("Source read errors and loading never imply signed out or sync success",()=>{
  for(const state of ["loading","unavailable"]){
    const result=projectHomeSyncStatus(active,state,{state:"signed-in"},t,"pt-BR");
    assert.equal(result.text,"locale:home.status."+state);
    assert.equal(result.state,state);
  }
  assert.throws(()=>projectHomeSyncStatus(active,"ready",{state:"signed-in"},null,"pt-BR"),TypeError);
});
test("Home reads current identity and sync snapshots rather than stale callback payloads",async()=>{
  const s=await readFile(new URL("../system/surface/ui/home-status.mjs",import.meta.url),"utf8");
  assert.match(s,/state\.account = validateIdentitySessionSnapshot\(identityPort\.getSnapshot\(\)\)/);
  assert.match(s,/state\.sync = validateSyncRuntimeSnapshot\(syncPort\.getSnapshot\(\)\)/);
  assert.match(s,/const unsubscribeIdentity = identityPort\?\.subscribe\(\(\) => \{\s*render\(\);/);
  assert.match(s,/const unsubscribeSync = syncPort\?\.subscribe\(\(\) => \{\s*render\(\);/);
  assert.match(s,/projectHomeSyncStatus\(state\.sync, sourceState\.sync, state\.account, translate, locale\)/);
  assert.doesNotMatch(s,/syncValue\(/);
});
test("Reconnect invalidates outdated success and cannot promote an older read",async()=>{
  const s=await readFile(new URL("../system/surface/ui/home-status.mjs",import.meta.url),"utf8");
  assert.match(s,/const refreshReadPorts = async \(\) => \{\s*if \(destroyed\) return;\s*markReadPortsLoading\(\)/);
  assert.match(s,/sourceState\.network = "loading";/);
  assert.match(s,/sourceState\.storage = "loading";/);
  assert.equal((s.match(/if \(destroyed \|\| refreshQueued\) return;/g)??[]).length,2);
  assert.match(s,/if \(refreshQueued && !destroyed\)/);
  assert.match(s,/readHomeStatusWithDeadline\(port, validate\)/);
  assert.doesNotMatch(s,/localStorage|sessionStorage|fetch\(/);
});
