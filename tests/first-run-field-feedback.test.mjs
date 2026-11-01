import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {markSurfaceFeedback} from "../system/surface/ui/surface-feedback.mjs";
test("Shared feedback marks statuses atomically",()=>{
 const attributes=new Map();
 const el={dataset:{},setAttribute:(k,v)=>attributes.set(k,v)};
 assert.equal(markSurfaceFeedback(el,"attention"),el);
 assert.equal(attributes.get("aria-live"),"polite");
 assert.equal(attributes.get("aria-atomic"),"true");
 assert.equal(attributes.get("role"),"status");
 assert.equal(el.dataset.surfaceFeedbackTone,"attention");
});
test("First Run has linked feedback for all three credential families",async()=>{
 const s=await readFile(new URL("../system/surface/ui/first-run.mjs",import.meta.url),"utf8");
 for(const type of ["network","local","identity"]) {
   assert.ok(s.includes('status.id = "ordax-first-run-'+type+'-feedback"'));
   assert.ok(s.includes('aria-describedby", "ordax-first-run-'+type+'-feedback"'));
 }
 assert.match(s,/networkValidationInvalid = true;/);
 assert.match(s,/localSessionValidationInvalid = true;/);
 assert.match(s,/identityFeedbackTone = result\?\.confirmationRequired === true \? "information" : "attention"/);
 assert.ok(s.includes('"Cadastro recebido. Confirme seu e-mail para entrar."'));
});
test("Local validation errors are not inferred from remote network failures",async()=>{
 const s=await readFile(new URL("../system/surface/ui/first-run.mjs",import.meta.url),"utf8");
 const block=s.slice(s.indexOf("  const connectNetwork = async ("),s.indexOf("  const continueSecurity = async () => {"));
 assert.match(block,/networkValidationInvalid = false/);
 assert.doesNotMatch(block,/networkValidationInvalid = true/);
 assert.match(block,/networkFeedbackTone = "attention"/);
 assert.match(s,/draft\.accountMode = "local-only"/);
});
test("Editing and retrying cannot retain a stale invalid flag",async()=>{
 const s=await readFile(new URL("../system/surface/ui/first-run.mjs",import.meta.url),"utf8");
 const css=await readFile(new URL("../system/surface/ui/first-run.css",import.meta.url),"utf8");
 assert.match(s,/overlay\.querySelector\("#ordax-first-run-network-feedback"\)\?\.remove\(\)/);
 assert.match(s,/overlay\.querySelector\("#ordax-first-run-local-feedback"\)\?\.remove\(\)/);
 assert.match(s,/overlay\.querySelector\("#ordax-first-run-identity-feedback"\)\?\.remove\(\)/);
 assert.match(s,/input\.removeAttribute\("aria-invalid"\)/);
 assert.match(css,/\.ordax-first-run-status\[data-surface-feedback-tone="attention"\]/);
 assert.match(css,/\.ordax-first-run-field input\[aria-invalid="true"\]/);
 assert.match(css,/var\(--md-danger-soft\)/);
});
