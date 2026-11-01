import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { mountNativeSidebarFit } from "../system/surface/ui/sidebar-layout.mjs";

test("Web navigation uses the Native fit engine with one DOM group per section", async () => {
  const web = await readFile(new URL("../system/surface/workspace/components/central/meridian-navigation.tsx", import.meta.url), "utf8");
  const shared = await readFile(new URL("../system/surface/ui/sidebar-layout.mjs", import.meta.url), "utf8");
  assert.match(web, /mountNativeSidebarFit\(host,measure\)/);
  assert.match(web, /fit\.destroy\(\)/);
  assert.match(web, /data-nav-group="principal"/);
  assert.match(web, /data-nav-group="ecossistema"/);
  assert.match(web, /data-nav-menu-more hidden/);
  assert.doesNotMatch(web, /sidebarNavigationCapacity|visibleCount|setVisibleCount/);
  assert.doesNotMatch(shared, /sidebarNavigationCapacity|measuredSidebarHeadings/);
});

function fixture(initialHeight) {
  let height = initialHeight;
  let resize;
  const document = {
    activeElement: null,
    defaultView: {
      getComputedStyle: () => ({
        height: String(height) + "px",
        boxSizing: "border-box",
        paddingBottom: "0px",
        borderBottomWidth: "0px",
      }),
      ResizeObserver: class {
        constructor(callback) { resize = callback; }
        observe() {}
        disconnect() {}
      },
    },
  };
  const destinations = Array.from({length:6},()=>({
    hidden:false,
    getBoundingClientRect() {
      return {bottom:destinations.filter(item=>!item.hidden).length * 48};
    },
  }));
  const buttons = destinations.map(destination => ({
    hidden:false,
    closest() { return destination; },
    focus() { document.activeElement = this; },
  }));
  const groups = [
    { members:destinations.slice(0,3) },
    { members:destinations.slice(3) },
  ].map(group=>({
    hidden:false,
    querySelector() { return group.members.find(item=>!item.hidden)??null; },
  }));
  const more = {
    hidden:true,
    getBoundingClientRect() {
      return {bottom:destinations.filter(item=>!item.hidden).length*48+(this.hidden?0:44)};
    },
    focus() { document.activeElement = this; },
  };
  const nav = {
    ownerDocument: document,
    querySelectorAll(selector) {
      if (selector === ".meridian-nav-destination button") return buttons;
      if (selector === "[data-nav-group]") return groups;
      throw Error("Unexpected selector: "+selector);
    },
    querySelector(selector) {
      if (selector === "[data-nav-menu-more]") return more;
      throw Error("Unexpected selector: "+selector);
    },
    getBoundingClientRect() { return {height,bottom:height}; },
  };
  return {nav,buttons,destinations,groups,more,document,
    resize(nextHeight) { height=nextHeight; resize(); }};
}

test("short rails hide overflow without losing the keyboard destination", () => {
  const x=fixture(150);
  x.document.activeElement=x.buttons[5];
  let measurements=0;
  const fit=mountNativeSidebarFit(x.nav,()=>{measurements++;});
  assert.equal(x.more.hidden,false);
  assert.ok(x.buttons.filter(item=>!item.hidden).length<6);
  assert.equal(x.document.activeElement,x.more,"focus moves to More when active destination is hidden");
  assert.ok(x.groups.some(item=>item.hidden),"empty destination sections must collapse");
  x.resize(500);
  assert.ok(x.buttons.every(item=>!item.hidden),"reopening the rail restores all destinations");
  assert.equal(x.more.hidden,true);
  assert.equal(x.document.activeElement,x.buttons[5],"focus can return to the restored destination");
  assert.equal(measurements,2);
  fit.destroy();
});
