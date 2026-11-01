import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { captureSectionNavigationScroll, restoreSectionNavigationScroll } from "../system/surface/ui/section-navigation.mjs";

const read = name => readFile(new URL("../system/surface/ui/" + name, import.meta.url), "utf8");

function railFixture({ width=180, content=420, position=0, itemLeft=282, itemRight=365 }={}) {
  const rail = {
    scrollLeft:position, clientWidth:width, scrollWidth:content,
    getBoundingClientRect(){return {left:0,right:width};},
    querySelector(selector){
      assert.equal(selector,'.ordax-section-navigation-item[aria-current="page"]');
      return {getBoundingClientRect:()=>({left:itemLeft-rail.scrollLeft,right:itemRight-rail.scrollLeft})};
    },
  };
  return {rail,slot:{querySelector(selector){
    assert.equal(selector,'.ordax-section-navigation');
    return rail;
  }}};
}

test("Store navigation preserves manual horizontal scroll across catalog updates", () => {
  const initial=railFixture({position:113});
  const saved=captureSectionNavigationScroll(initial.slot);
  const repaint=railFixture();
  restoreSectionNavigationScroll(repaint.slot,saved,true);
  assert.equal(repaint.rail.scrollLeft,113);
});

test("Switching Store category reveals active destination without scrolling application body", () => {
  const next=railFixture();
  restoreSectionNavigationScroll(next.slot,0,false);
  assert.equal(next.rail.scrollLeft,193);
});

test("Official Store reuses section navigation and preserves search caret across live updates", async () => {
  const code=await read("store-overview-controls.mjs");
  const css=await read("store.css");
  assert.match(code,/import \{ captureSectionNavigationScroll, restoreSectionNavigationScroll \} from "\.\/section-navigation\.mjs"/);
  assert.match(code,/ordax-store-nav ordax-section-navigation/);
  assert.match(code,/ordax-store-nav-item ordax-section-navigation-item/);
  assert.match(code,/previousActiveView = slot\.querySelector\('/);
  assert.match(code,/restoreSectionNavigationScroll\(slot, previousNavigationScroll, previousActiveView === activeView\)/);
  assert.match(code,/searchSelection/);
  assert.match(code,/restored\.setSelectionRange\(/);
  assert.match(css,/@container \(max-width: 800px\)/);
  assert.match(css,/\.ordax-store-nav \{[^}]*flex-wrap: nowrap;[^}]*overflow-x: auto;/s);
  assert.match(css,/\.ordax-store-nav-item \{[^}]*min-height: 44px;/s);
  assert.match(css,/\.ordax-store-action \{\s*min-height: 44px;/);
  assert.match(css,/\.ordax-store-details-link,\s*\.ordax-store-back \{[^}]*min-height: 44px;/s);
  assert.doesNotMatch(code,/const \w+Catalog\s*=\s*\[/);
});
