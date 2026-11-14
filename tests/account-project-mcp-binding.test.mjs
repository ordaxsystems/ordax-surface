import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL("../"+path, import.meta.url), "utf8");

test("Account Project MCP binding is explicit local consent over an injected OS port", async () => {
  const source = await read("system/surface/ui/account-overview-controls.mjs");
  assert.match(source, /assertProjectBindingReviewPort/);
  assert.match(source, /projectBindingPort\.link\(localProjectId, cloudProjectId\)/);
  assert.match(source, /data-account-project-binding-cloud/);
  assert.match(source, /data-account-project-binding-local/);
  assert.match(source, /project\.nextState === "needs_device_binding"/);
  assert.doesNotMatch(source, /projectBindingPort\.link\([^\n]*(?:path|cwd|repositoryFullName)/);
});

test("Project MCP binding presentation remains fail-closed when the OS port is absent", async () => {
  const source = await read("system/surface/ui/account-overview-controls.mjs");
  assert.match(source, /if \(!projectBindingPort \|\| !projectBindingSnapshot\) return;/);
  assert.match(source, /account\.projects\.mcp\.unavailable/);
  assert.match(source, /pendingProjectBinding !== null/);
});
