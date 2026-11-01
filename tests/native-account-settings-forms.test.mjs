import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const read = path => readFile(new URL("../"+path,import.meta.url),"utf8");

test("Account restores keyboard focus across policy and form repaints without capturing secrets",async()=>{
  const s=await read("system/surface/ui/account-overview-controls.mjs");
  for(const [attr,kind] of [
    ["data-account-credential-email","credential-email"],
    ["data-account-credential-password","credential-password"],
    ["data-account-registration-legal-acceptance","registration-legal"],
    ["data-account-close-password","close-password"],
    ["data-account-close-confirmation","close-confirmation"],
  ]) assert.ok(s.includes('["'+attr+'", "'+kind+'"]'),attr);
  assert.match(s,/\["space-create-name", "credential-password", "close-password"\]\.includes\(snapshot\.focus\?\.kind\)/);
  assert.match(s,/target\.setSelectionRange\(snapshot\.caret\.start, snapshot\.caret\.end, snapshot\.caret\.direction\)/);
  const captured=s.slice(s.indexOf("  const captureInteractionState = (slot) => {"),s.indexOf("  const restoreInteractionState = (slot, snapshot) => {"));
  assert.doesNotMatch(captured,/credentialPasswordDraft|closePasswordDraft|localStorage|sessionStorage/);
  assert.match(s,/credentialPasswordDraft = "";/);
  assert.match(s,/closePasswordDraft = "";/);
});

test("Account uses Meridian sizing, keyboard focus and window-width responsive forms",async()=>{
  const c=await read("system/surface/ui/account.css");
  assert.match(c,/container: account-viewport \/ inline-size/);
  assert.match(c,/@container account-viewport \(max-width: 540px\)/);
  assert.match(c,/@container account-viewport \(max-width: 360px\)/);
  assert.match(c,/\.ordax-account-credential-form/);
  assert.match(c,/\.ordax-account-space-create-form/);
  assert.match(c,/\.ordax-account-field :is\(input, select\):focus-visible/);
  assert.match(c,/\.ordax-account-field input,[\s\S]*?min-height: 44px;/);
  assert.match(c,/\n\.ordax-account-action \{\s*min-height: 44px;/);
});

test("Settings local password fields have real accessible labels and linked validation feedback",async()=>{
  const s=await read("system/surface/ui/settings-overview-controls.mjs");
  for (const [v,key] of [["secret","new"],["confirm","confirm"],["current","current"]]) {
    assert.ok(s.includes(v+'.setAttribute("aria-label", t("settings.security.placeholder.'+key+'"))'));
  }
  assert.equal((s.match(/"ordax-settings-local-session-feedback"/g)??[]).length,4);
  assert.match(s,/message\.id = "ordax-settings-local-session-feedback"/);
  assert.match(s,/localSessionMessageId === "settings.security.message.validation"/);
  assert.match(s,/"settings.security.message.currentRequired", "settings.security.message.incorrect"/);
  assert.match(s,/networkManagementMessageId === "network.quick.passwordRequired"/);
  assert.match(s,/message\.id = "ordax-settings-network-feedback"/);
});

test("Settings security and Wi-Fi inputs remain accessible at narrow app widths",async()=>{
  const c=await read("system/surface/ui/settings.css");
  assert.match(c,/@container settings-viewport \(max-width: 540px\)/);
  assert.match(c,/\.ordax-settings-security-form,[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(c,/\.ordax-settings-security-form input \{\s*min-width: 0;\s*height: 44px;/);
  assert.match(c,/\.ordax-settings-wifi-password \{\s*width: 100%;\s*min-width: 0;\s*height: 44px;/);
  assert.match(c,/\.ordax-settings-security-form input\[aria-invalid="true"\]/);
  assert.match(c,/var\(--ordax-warning-bg\)/);
});
