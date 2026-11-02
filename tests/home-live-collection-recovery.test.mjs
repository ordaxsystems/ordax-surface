import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const ui=new URL("../system/surface/ui/",import.meta.url);

test("Home continuation takes projects and recent files from live validated OS snapshots",async()=>{
  const source=await readFile(new URL("home-continuation.mjs",ui),"utf8");
  const render=source.slice(source.indexOf("  const render = () => {"),source.indexOf("  const unsubscribeProjects ="));
  assert.match(render,/const projectSnapshot = projectPort\?\.getSnapshot\(\) \?\? null;/);
  assert.match(render,/const recentSnapshot = recentPort\?\.getSnapshot\(\) \?\? null;/);
  assert.match(source,/validateProjectCatalogSnapshot\(projects\)/);
  assert.match(source,/validateRecentFilesSnapshot\(recentFiles\)/);
  assert.match(render,/projects: projectSnapshot/);
  assert.match(render,/recentFiles: recentSnapshot/);
  assert.match(source,/projectPort\?\.subscribe\(\(\) => \{\s*render\(\);/);
  assert.match(source,/recentPort\?\.subscribe\(\(\) => \{\s*render\(\);/);
  assert.doesNotMatch(source,/let (?:projectSnapshot|recentSnapshot)\s*=/);
  assert.doesNotMatch(source,/(?:projectSnapshot|recentSnapshot)\s*=\s*validate\w+Snapshot\(snapshot\)/);
});
test("Home pending re-reads real unread notifications and Sync queue counts on every repaint",async()=>{
  const source=await readFile(new URL("home-pending.mjs",ui),"utf8");
  const render=source.slice(source.indexOf("  const render = () => {"),source.indexOf("  const unsubscribeNotifications ="));
  assert.match(render,/const notificationsSnapshot = notificationsPort\?\.getSnapshot\(\) \?\? null;/);
  assert.match(render,/const syncSnapshot = syncPort\?\.getSnapshot\(\) \?\? null;/);
  assert.match(source,/validateNotificationsSnapshot\(notifications\)/);
  assert.match(source,/validateSyncRuntimeSnapshot\(syncRuntime\)/);
  assert.match(render,/notifications: notificationsSnapshot/);
  assert.match(render,/syncRuntime: syncSnapshot/);
  assert.match(source,/notificationsPort\?\.subscribe\(\(\) => \{\s*render\(\);/);
  assert.match(source,/syncPort\?\.subscribe\(\(\) => \{\s*render\(\);/);
  assert.doesNotMatch(source,/let (?:notificationsSnapshot|syncSnapshot)\s*=/);
  assert.doesNotMatch(source,/(?:notificationsSnapshot|syncSnapshot)\s*=\s*validate\w+Snapshot\(snapshot\)/);
});
test("Stale notifications cannot restore removed actions by position or steal focus",async()=>{
  for(const file of ["home-continuation.mjs","home-pending.mjs"]){
    const source=await readFile(new URL(file,ui),"utf8");
    assert.match(source,/const focusedWithin = section\?\.contains\?\.\(activeElement\) === true/);
    assert.match(source,/if \(!presentation\.visible\) \{[\s\S]*?section\?\.remove\(\);[\s\S]*?restoreHomeCollectionFocus\(homePanel, focusedWithin\)/);
    assert.match(source,/restoreHomeCollectionFocus\(homePanel, focusedWithin, target\)/);
    assert.match(source,/if \(destroyed\) return/);
    assert.match(source,/unsubscribe\w+\?\.\(\)/);
    assert.doesNotMatch(source,/localStorage|sessionStorage|fetch\(/);
  }
});
test("Existing OS-owned presentation still controls real items and empty state",async()=>{
  const continuation=await readFile(new URL("home-continuation.mjs",ui),"utf8");
  const pending=await readFile(new URL("home-pending.mjs",ui),"utf8");
  for(const code of [continuation,pending]){
    assert.match(code,/visible: (?:false|boundedItems\.length > 0)/);
    assert.match(code,/section\?\.remove\(\)/);
  }
  assert.match(continuation,/const items = \[\.\.\.projectItems, \.\.\.recentItems\]/);
  assert.match(pending,/notificationsSnapshot\?\.unreadCount > 0/);
  assert.match(pending,/syncSnapshot\?\.pendingMutationCount > 0/);
  assert.match(continuation,/button\.dataset\.appTarget = item\.target/);
  assert.match(pending,/button\.dataset\.quickPanelToggle = item\.panel/);
});
