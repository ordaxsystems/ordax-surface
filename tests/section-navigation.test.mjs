import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { captureSectionNavigationScroll, restoreSectionNavigationScroll } from "../system/surface/ui/section-navigation.mjs";

function fixture({ width=180, content=500, position=0, left=270, right=360 } = {}) {
  const rail={
    clientWidth:width,scrollWidth:content,scrollLeft:position,
    getBoundingClientRect(){return {left:0,right:width};},
    querySelector(selector) {
      assert.equal(selector,'.ordax-section-navigation-item[aria-current="page"]');
      return {getBoundingClientRect:()=>({left:left-rail.scrollLeft,right:right-rail.scrollLeft})};
    },
  };
  const slot={querySelector(selector) {
    assert.equal(selector,".ordax-section-navigation");
    return rail;
  }};
  return {rail,slot};
}

test("section refresh preserves deliberate horizontal scroll", () => {
  const old=fixture({position:142});
  const captured=captureSectionNavigationScroll(old.slot);
  const next=fixture();
  restoreSectionNavigationScroll(next.slot,captured,true);
  assert.equal(next.rail.scrollLeft,142);
});

test("section changes reveal the selected item in a scrollable rail", () => {
  const x=fixture();
  restoreSectionNavigationScroll(x.slot,0,false);
  assert.equal(x.rail.scrollLeft,188);
  const left=fixture({position:190,left:196,right:256});
  restoreSectionNavigationScroll(left.slot,190,false);
  assert.equal(left.rail.scrollLeft,188);
});

test("reveal clamps to available range and ignores a nonoverflow rail", () => {
  const x=fixture({width:180,content:250,left:230,right:280});
  restoreSectionNavigationScroll(x.slot,null,false);
  assert.equal(x.rail.scrollLeft,70);
  const noOverflow=fixture({width:180,content:180});
  restoreSectionNavigationScroll(noOverflow.slot,null,false);
  assert.equal(noOverflow.rail.scrollLeft,0);
  assert.equal(captureSectionNavigationScroll(null),null);
});

test("Account, Settings and System integrate the one shared UI behavior", async () => {
  for(const kind of ["account","settings","system"]){
    const source=await readFile(new URL("../system/surface/ui/"+kind+"-overview-controls.mjs",import.meta.url),"utf8");
    assert.match(source,/from "\.\/section-navigation\.mjs"/);
    assert.ok(source.includes("ordax-"+kind+"-navigation ordax-section-navigation"));
    assert.ok(source.includes("ordax-"+kind+"-navigation-item ordax-section-navigation-item"));
    assert.match(source,/captureSectionNavigationScroll\(slot\)/);
    assert.match(source,/restoreSectionNavigationScroll\(slot,/);
  }
  const css=await readFile(new URL("../system/surface/ui/meridian.css",import.meta.url),"utf8");
  assert.match(css,/\.ordax-section-navigation \.ordax-section-navigation-item \{\s*min-height: 44px;/);
});
