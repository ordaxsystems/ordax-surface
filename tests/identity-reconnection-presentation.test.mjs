import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { sidebarAccountStatusKey } from "../system/surface/ui/identity-presence-presentation.mjs";

test("Signed-out identity never becomes an offline session label on connectivity loss",()=>{
  assert.equal(sidebarAccountStatusKey("signed-out",false),"sidebar.account.connect");
  assert.equal(sidebarAccountStatusKey("signed-out",true),"sidebar.account.connect");
});
test("Signed-in and unavailable identities remain distinct from signed-out across reconnection",()=>{
  assert.equal(sidebarAccountStatusKey("signed-in",false),"sidebar.account.signedIn");
  assert.equal(sidebarAccountStatusKey("signed-in",true),"sidebar.account.offline");
  assert.equal(sidebarAccountStatusKey("unavailable",false),"sidebar.account.connect");
  assert.equal(sidebarAccountStatusKey("unavailable",true),"sidebar.account.offline");
  assert.equal(sidebarAccountStatusKey("signed-in",false),"sidebar.account.signedIn");
});
test("Sidebar projects status without treating network transport as an identity transition",async()=>{
  const s=await readFile(new URL("../system/surface/ui/sidebar-account.mjs",import.meta.url),"utf8");
  assert.match(s,/status: translate\(sidebarAccountStatusKey\(session\.state, offline\)\)/);
  assert.match(s,/connected: session\.state === "signed-in" && !offline/);
  assert.match(s,/session\.state === "signed-in" \? session\.displayName/);
  assert.match(s,/const session = validateIdentitySessionSnapshot\(identity\)/);
  assert.match(s,/snapshot\.connectivity === "offline"/);
  assert.doesNotMatch(s,/localStorage|sessionStorage|fetch\(/);
});
test("Home account status names a verified session without claiming network connectivity",async()=>{
  const s=await readFile(new URL("../system/surface/ui/home-status.mjs",import.meta.url),"utf8");
  const from=s.indexOf("function accountValue("),end=s.indexOf("function storageValue(",from);
  assert.ok(from>=0&&end>from,"current account projection exists");
  const account=s.slice(from,end);
  assert.match(account,/snapshot\.state === "signed-in"/);
  assert.match(account,/"sidebar\.account\.signedIn"/);
  assert.match(account,/"home\.status\.account\.signedOut"/);
  assert.match(account,/snapshot\.state === "unavailable"/);
  assert.doesNotMatch(account,/"home\.status\.account\.connected"/);
  assert.match(s,/internet: networkValue\(state\.network, sourceState\.network, translate\)/);
  assert.match(s,/account: accountValue\(state\.account, sourceState\.account, translate\)/);
});
