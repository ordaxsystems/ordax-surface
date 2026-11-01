import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { projectHomeSpaceCard } from "../system/surface/ui/home-space-card-presentation.mjs";

const translate=id=>"tr:"+id;
const selected=(name,kind="work")=>({state:"selected",selectedSpace:{id:"space-a",name,kind}});
test("Home Space card uses the current selected snapshot, not a prior user label",()=>{
  const active=projectHomeSpaceCard(selected("Projeto novo"),translate);
  assert.deepEqual(active,{
    name:"Projeto novo",kind:"tr:account.spaces.kind.work",
    status:"tr:home.space.stateSelected",state:"ready"
  });
  assert.equal(Object.isFrozen(active),true);
  const revoked=projectHomeSpaceCard({state:"unavailable",selectedSpace:null},translate);
  assert.deepEqual(revoked,{
    name:"tr:home.space.unavailable",kind:"tr:home.space.unavailableDetail",
    status:"tr:home.space.stateUnavailable",state:"unavailable"
  });
  assert.equal(JSON.stringify(revoked).includes("Projeto novo"),false);
});
test("Signed-out or resetting selection never displays a previous Space",()=>{
  const cases=[null,{state:"unavailable"},{state:"selected",selectedSpace:null}];
  for(const value of cases){
    const view=projectHomeSpaceCard(value,translate);
    assert.equal(view.state,"unavailable");
    assert.equal(view.name,"tr:home.space.unavailable");
  }
  const unselected=projectHomeSpaceCard({state:"unselected",selectedSpace:null},translate);
  assert.equal(unselected.state,"partial");
  assert.equal(unselected.name,"tr:home.space.unselected");
});
test("Localization is always resolved from the current localization port",()=>{
  assert.equal(projectHomeSpaceCard(selected("Space real","personal"),
    x=>"novo:"+x).kind,"novo:account.spaces.kind.personal");
  assert.throws(()=>projectHomeSpaceCard(selected("Any"),null),TypeError);
});
test("Home re-reads the validated OS port on render, never uses a stale callback snapshot",async()=>{
  const source=await readFile(
    new URL("../system/surface/ui/home-space-card.mjs",import.meta.url),"utf8");
  assert.match(source,/const selection = selectionPort === null\s*\?\s*null : validateSpaceSelectionSnapshot\(selectionPort\.getSnapshot\(\)\)/);
  assert.match(source,/const unsubscribeSelection = selectionPort\?\.subscribe\(\(\) => \{\s*render\(\);/);
  assert.doesNotMatch(source,/let selection = selectionPort|selection = validateSpaceSelectionSnapshot\(snapshot\)/);
  assert.match(source,/projectHomeSpaceCard\(selection, localization\.translate\)/);
  for(const key of ["name","kind","status","state"]) {
    assert.ok(source.includes("presentation."+key),key);
  }
  assert.match(source,/const unsubscribeLocalization = localization\.subscribe\(render\)/);
  assert.doesNotMatch(source,/localStorage|sessionStorage|fetch\(/);
});
