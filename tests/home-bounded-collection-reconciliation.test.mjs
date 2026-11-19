import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

test("Native Home consumes only the canonical project reader after CAS cutover", async () => {
  const source = await readFile(
    new URL("../system/surface/ui/home-continuation.mjs", import.meta.url), "utf8",
  );
  assert.match(source, /assertProjectCatalogReader/);
  assert.doesNotMatch(source, /assertProjectCatalogPort/);
  assert.match(source, /projectPort\?\.getSnapshot\(\)/);
  assert.match(source, /projectPort\?\.subscribe\(/);
  assert.doesNotMatch(source, /projectPort\.(?:create|rename|remove|recordOpened)\(/);
});

for (const [file, hasTimeZone] of [
  ["home-continuation.mjs", true],
  ["home-pending.mjs", false],
]) {
  test(file + ": live, bounded collection avoids identical DOM replacements", async () => {
    const source = await readFile(
      new URL("../system/surface/ui/" + file, import.meta.url), "utf8",
    );
    const start = source.indexOf("    const nextSignature = JSON.stringify(");
    const end = source.indexOf("\n    if (!presentation.visible) {", start);
    assert.ok(start > 0 && end > start, "exercise actual render guard");
    const guard = source.slice(start, end);
    let current = { visible: false, items: [] }, reads = 0;
    const harness = runInNewContext([
      'let section = null, renderedSignature = null, paints = 0, locale = "pt-BR";',
      'let timeZone = "America/Bahia"; const homePanel = {};',
      'const localization = { getLocale: () => locale };',
      'const render = () => {',
      '  readOwner();',
      '  const presentation = getProjection();',
      guard,
      '  paints++;',
      '  section = presentation.visible ? { parentNode: homePanel } : null;',
      '  renderedSignature = nextSignature;',
      '};',
      '({ render, stats: () => ({ paints, mounted: section !== null }),',
      '   setLocale(value) { locale = value; }, setZone(value) { timeZone = value; },',
      '   detach() { if (section) section.parentNode = null; },',
      '   translationChanged() { renderedSignature = null; render(); } })',
    ].join("\n"), {
      readOwner: () => { reads++; },
      getProjection: () => current,
    });
    harness.render(); harness.render();
    assert.equal(harness.stats().paints, 1, "empty state does not repaint twice");
    current = { visible: true, items: [{ key: "a", title: "First" }] };
    harness.render(); harness.render();
    assert.equal(harness.stats().paints, 2, "identical cards preserve DOM");
    current = { visible: true, items: [{ key: "a", title: "Updated" }] };
    harness.render();
    assert.equal(harness.stats().paints, 3, "changed card updates DOM");
    harness.detach(); harness.render();
    assert.equal(harness.stats().paints, 4, "detached section is recreated");
    harness.setLocale("en-US"); harness.render();
    assert.equal(harness.stats().paints, 5, "new locale repaints");
    if (hasTimeZone) {
      harness.setZone("UTC"); harness.render();
      assert.equal(harness.stats().paints, 6, "regional time zone repaints");
    }
    const beforeTranslation = harness.stats().paints;
    harness.translationChanged();
    assert.equal(harness.stats().paints, beforeTranslation + 1,
      "same locale translation refresh still repaints");
    current = { visible: false, items: [] };
    harness.render(); const emptyPaints = harness.stats().paints;
    harness.render();
    assert.equal(harness.stats().paints, emptyPaints, "removed cards remain removed");
    assert.equal(harness.stats().mounted, false);
    assert.equal(reads, 10 + Number(hasTimeZone),
      "every port event must still read current OS state");
    assert.match(source, /renderedSignature = null;\s*render\(\);/,
      "localization invalidates projected labels");
    assert.match(source, /restoreHomeCollectionFocus\(homePanel, focusedWithin, target\)/);
  });
}