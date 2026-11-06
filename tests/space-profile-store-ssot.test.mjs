import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('active Space apps are a read-only projection of the canonical OS and Store', () => {
  const source = read('system/surface/workspace/components/central/space-profile-apps.tsx');
  assert.match(source, /projectSpaceProfileStoreStatus/);
  assert.match(source, /useStoreCatalog/);
  assert.match(source, /useProfileCatalogReader/);
  assert.match(source, /readCatalog\(controller.signal\)/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /!offline && authorized\.ready && identity\.state === 'signed-in'/);
  assert.match(source, /key={`\$\{identity.subjectId\}:\$\{active.id\}:\$\{active.profilePack \?\? ''\}`}/);
  assert.match(source, /'space-inactive'/);
  assert.match(source, /Nenhuma instalação foi presumida/);
  assert.doesNotMatch(source, /(?:fetch\(|requestLifecycle\(|\.install\(|\.activate\(|localStorage|sessionStorage|service_role)/);
});

test('Space composition uses the shared Store status vocabulary, without a second Profile screen', () => {
  const space = read('system/surface/workspace/components/central/space-profile-apps.tsx');
  const labels = read('system/surface/workspace/components/store/app-status-labels.ts');
  assert.match(space, /storeAppStatusLabel\(app.status\)/);
  for (const status of ['unknown','not-listed','installed','update-available','blocked','failed-retained','in-progress','unavailable']) {
    assert.ok(labels.includes(status), status);
  }
});

test('Spaces shows only the verified account view and its official profile/member composition', () => {
  const page = read('system/surface/workspace/components/central/spaces-experience.tsx');
  assert.match(page, /const \{ authorized, identity, catalog, offline \} = useWebAccount\(\)/);
  assert.match(page, /\{children\}[\s\S]*?<SpaceProfileAppsPanel\/>[\s\S]*?<SpaceMembersPanel\/>/);
  assert.match(page, /authorized\.ready \? 'Catálogo confirmado pelo serviço da conta\.'/);
  assert.doesNotMatch(page, /mountSpacesPresentation|SpacesPresentation|Ver exemplos completos|mode==='examples'|Dados fictícios|setVisited/);
  assert.doesNotMatch(page, /fetch\(|localStorage|sessionStorage/);
});

test("Spaces is the sole user-facing destination for Profile composition in Native and Meridian", async () => {
  const fs = await import("node:fs/promises");
  const [account, desktop, home, profileApps] = await Promise.all([
    fs.readFile(new URL("../system/surface/ui/account-overview-controls.mjs", import.meta.url), "utf8"),
    fs.readFile(new URL("../system/surface/workspace/components/central/desktop.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../system/surface/workspace/components/central/meridian-home.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../system/surface/workspace/components/central/space-profile-apps.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(account, /id: "profiles", messageId:/);
  assert.match(account, /const initialTarget = lifecycle.getAppTarget\("account"\)/);
  assert.match(account, /renderProfiles\(advanced\)/);
  assert.match(account, /spaceCreate = null/);
  assert.match(account, /assertSpaceCreatePort\(spaceCreate\)/);
  assert.doesNotMatch(account, /adapters\/desktop\/space-create/);
  assert.match(account, /spaceCreatePort\.create\(intent\)/);
  assert.match(account, /await spacesPort\.refresh\(\)/);
  assert.match(account, /authorized\.visibleSpaces\.find\(space =>/);
  assert.match(account, /spaceCreatePort\?\.dispose\(\)/);
  assert.doesNotMatch(desktop, /ProfileCatalogPanel|title === 'Perfis profissionais'/);
  assert.doesNotMatch(home, /name:'Perfis profissionais'/);
  assert.match(home, /target:'Espaços'/);
  assert.match(profileApps, /export function SpaceProfileAppsPanel/);
});

test("uncertain Space creation retries the exact same intent and UUID", () => {
  const account = read("system/surface/ui/account-overview-controls.mjs");
  const handler = account.slice(account.indexOf("  const onSubmit = (event) => {"), account.indexOf("  const onClick = (event) => {"));
  assert.ok(handler.length > 0, "Space creation submit handler must exist");
  assert.match(handler, /createIdempotencyKey = crypto\.randomUUID\(\)/);
  assert.match(handler, /idempotencyKey: createIdempotencyKey/);
  assert.match(handler, /await spacesPort\.refresh\(\)/);
  const success = handler.slice(handler.indexOf('createMessage = t("account.spaces.create.createdPending")'));
  assert.match(success, /createUnconfirmed = false;\s*createNameDraft = "";\s*createIdempotencyKey = null;/);
  const failure = handler.slice(handler.indexOf('} catch {'), handler.indexOf('} finally {'));
  assert.match(failure, /createUnconfirmed = true;/);
  assert.doesNotMatch(failure, /createIdempotencyKey = null/);

  // A retry stays possible, but a user cannot change the payload of an
  // operation whose first result could have succeeded remotely.
  assert.match(account, /nameInput\.disabled = createPending \|\| createUnconfirmed;/);
  assert.match(account, /typeInput\.disabled = createPending \|\| createUnconfirmed;/);
  assert.match(account, /control\.matches\("\[data-account-space-create-type\]"\) && !createPending && !createUnconfirmed/);
  assert.match(account, /input\.matches\("\[data-account-space-create-name\]"\) && !createPending && !createUnconfirmed/);
  assert.match(account, /createOrdinal \+= 1;\s*createPending = false;\s*createIdempotencyKey = null;\s*createUnconfirmed = false;/);
});


test("Account Space form retains focus and text selection through authoritative refresh", () => {
  const account = read("system/surface/ui/account-overview-controls.mjs");
  assert.match(account, /element\.hasAttribute\("data-account-space-create-name"\)/);
  assert.match(account, /element\.hasAttribute\("data-account-space-create-type"\)/);
  assert.match(account, /slot\.querySelectorAll\("button, input, select"\)/);
  assert.match(account, /const focusedText = activeInside && activeElement\?\.matches\?\.\(/);
  assert.match(account, /\[data-account-space-create-name\], \[data-account-credential-password\], \[data-account-close-password\]/);
  assert.match(account, /start: focusedText\.selectionStart,\s*end: focusedText\.selectionEnd,\s*direction: focusedText\.selectionDirection/);
  assert.match(account, /focus: activeInside \? focusIdentity\(activeElement\) : null,\s*caret,/);
  assert.match(account, /target\.focus\(\{ preventScroll: true \}\);/);
  assert.match(account, /\["space-create-name", "credential-password", "close-password"\]\.includes\(snapshot\.focus\?\.kind\)/);
  assert.match(account, /target\.setSelectionRange\(snapshot\.caret\.start, snapshot\.caret\.end, snapshot\.caret\.direction\)/);
  assert.match(account, /force && slot === mountedSlot \? captureInteractionState\(slot\) : null/);
  assert.match(account, /restoreInteractionState\(slot, interaction\)/);
});

test("Profile mutation results cannot repaint a different account or selected Space", () => {
  const account = read("system/surface/ui/account-overview-controls.mjs");
  const start = account.indexOf('const profileButton = event.target.closest("[data-account-profile-action]")');
  const end = account.indexOf('const closeButton = event.target.closest("[data-account-close-action]")');
  assert.ok(start !== -1 && end > start);
  const flow = account.slice(start, end);
  assert.match(flow, /const ordinal = \+\+profileOrdinal;/);
  assert.match(flow, /pendingProfileSpaceId = selectedSpace\.id;/);
  assert.match(flow, /!destroyed\s*&& ordinal === profileOrdinal\s*&& sessionSnapshot\.state === "signed-in"/);
  assert.match(flow, /sessionSnapshot\.subjectId === actingSubjectId/);
  assert.match(flow, /authorizedSpaces\(\)\.activeSpace\?\.id === selectedSpace\.id/);
  assert.match(flow, /authorizedSpaces\(\)\.activeSpace\?\.kind === selectedSpace\.kind/);
  assert.equal((flow.match(/if \(!isCurrentProfileContext\(\)\) return;/g) ?? []).length, 3);
  assert.match(flow, /if \(isCurrentProfileContext\(\)\) \{\s*profileMessage = t\("account\.profiles\.failed"\);\s*profileMessageTone = "attention";\s*\}/);
  assert.match(flow, /if \(ordinal === profileOrdinal\) \{\s*pendingProfileAction = null;\s*pendingProfileSpaceId = null;/);
  assert.match(account, /profileOrdinal \+= 1;\s*pendingProfileAction = null;\s*pendingProfileSpaceId = null;\s*profileMessage = "";/);
  assert.match(account, /const unsubscribeSpaceSelection = spaceSelectionPort\?\.subscribe\(\(snapshot\) => \{\s*spaceSelectionSnapshot = validateSpaceSelectionSnapshot\(snapshot\);\s*if \(pendingProfileSpaceId !== null/);
  assert.match(account, /\/\/ Old Profile Pack completions must not write into the next account\.\s*profileOrdinal \+= 1;/);
});


test("Native Space picker uses the OS authorization SSOT for both visibility and selection", () => {
  const switcher = read("system/surface/ui/space-switcher-controls.mjs");
  const account = read("system/surface/ui/account-overview-controls.mjs");
  const projection = switcher.slice(
    switcher.indexOf("export function deriveSpaceSwitcherView("),
    switcher.indexOf("export function mountSpaceSwitcherControls("),
  );
  assert.match(projection, /const \{ ready, visibleSpaces, activeSpace: active \} = deriveAuthorizedSpaces\(/);
  assert.match(projection, /return Object\.freeze\(\{\s*ready,\s*visibleSpaces,\s*active,/);
  assert.match(switcher, /const \{ ready, active, visibleSpaces: spacesVisible, activeProfile, profilesBySpace \} =\s*deriveSpaceSwitcherView\(/);
  assert.match(switcher, /else if \(!ready\) \{/);
  const action = switcher.slice(
    switcher.indexOf('const action = event.target.closest("[data-space-switcher-select]")'),
    switcher.indexOf("  const originatedInside ="),
  );
  assert.match(action, /const authorized = deriveAuthorizedSpaces\(identity, catalog, selection\)/);
  assert.match(action, /if \(!authorized\.ready\) return;/);
  assert.match(action, /authorized\.visibleSpaces\.find\(\(space\) =>/);
  assert.match(action, /if \(!match \|\| match\.state !== "active"\) return;/);
  assert.doesNotMatch(action, /catalog\.spaces\.find|selection\.subjectId !== identity\.subjectId|catalog\.state !== "ready"/);
  assert.match(account, /const authorizedSpaces = \(\) => deriveAuthorizedSpaces\(/);
});


test("Space member UI discards async results outside its committed account and port scope", () => {
  const members = read("system/surface/workspace/components/central/space-members-panel.tsx");
  assert.match(members, /import \{ useLayoutEffect, useRef, useState \} from 'react'/);
  assert.match(members, /const currentContext = useRef\(\{ subjectId, spaceId, offline, members, actorCapability, membershipActions \}\)/);
  assert.match(members, /currentContext\.current = \{ subjectId, spaceId, offline, members, actorCapability, membershipActions \}/);
  assert.doesNotMatch(members, /currentSpace\.current/);

  const page = members.slice(members.indexOf("async function readPage("), members.indexOf("async function readCapability("));
  assert.match(page, /current\.subjectId === subjectId/);
  assert.match(page, /current\.spaceId === targetSpaceId/);
  assert.match(page, /!current\.offline/);
  assert.match(page, /current\.members === members/);
  assert.match(page, /membersReadGeneration\.current === generation/);
  assert.equal((page.match(/if \(!isCurrent\(\)\) return/g) ?? []).length, 2);
  assert.match(page, /if \(isCurrent\(\)\) membersReadInFlight\.current = null/);

  const capability = members.slice(members.indexOf("async function readCapability("), members.indexOf("async function reloadRemoteState("));
  assert.match(capability, /current\.subjectId === subjectId/);
  assert.match(capability, /current\.spaceId === targetSpaceId/);
  assert.match(capability, /!current\.offline/);
  assert.match(capability, /current\.actorCapability === actorCapability/);
  assert.match(capability, /capabilityReadGeneration\.current === generation/);
  assert.equal((capability.match(/if \(!isCurrent\(\)\) return/g) ?? []).length, 2);

  const action = members.slice(members.indexOf("async function runAction("), members.indexOf("// A lost connection is not a sign-out"));
  assert.match(action, /current\.subjectId === subjectId/);
  assert.match(action, /current\.spaceId === spaceId/);
  assert.match(action, /!current\.offline/);
  assert.match(action, /current\.membershipActions === membershipActions/);
  assert.match(action, /actionGeneration\.current === generation/);
  assert.match(action, /if \(isCurrent\(\)\) \{\s*await reloadRemoteState\(/);
  assert.match(action, /if \(isCurrent\(\)\) \{\s*setActionError/);
  assert.match(action, /if \(isCurrent\(\)\) \{\s*pendingAction\.current = false/);
  assert.match(members, /\[spaceId, subjectId, offline, members, actorCapability, membershipActions\]/);
});
