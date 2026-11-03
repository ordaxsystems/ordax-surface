import test from "node:test";
import assert from "node:assert/strict";
import {
  desktopMcpStatusPresentation,
} from "../system/surface/ui/desktop-mcp-status-presentation.mjs";

const baseline = {
  schema: "ordax.product-runtime-supervisor-status/1",
  host: "ordax-desktop", state: "running",
  reason: "dev_remote_attestation_pending", enrolled: true,
  processRunning: true, mcpReady: false,
  centralSessionAttested: false, capabilityDigest: null,
};

test("Desktop status never treats process presence as remote MCP attestation", () => {
  const view = desktopMcpStatusPresentation(baseline);
  assert.equal(view.valueId, "system.overview.mcp.running");
  assert.equal(view.detailId, "system.overview.mcp.runningDetail");
  const trulyAttested = desktopMcpStatusPresentation({
    ...baseline, mcpReady: true, centralSessionAttested: true,
    capabilityDigest: "a".repeat(64),
  });
  assert.equal(trulyAttested.valueId, "system.overview.mcp.attested");
  for (const nonAttested of [
    { ...baseline, mcpReady: true },
    { ...baseline, centralSessionAttested: true },
    { ...baseline, capabilityDigest: "a".repeat(64) },
  ]) {
    assert.equal(desktopMcpStatusPresentation(nonAttested).valueId,
      "system.overview.mcp.running");
  }
});

test("Native identity, unavailable and blocked statuses stay distinguishable", () => {
  assert.equal(desktopMcpStatusPresentation(null, true).valueId,
    "system.overview.mcp.unavailable");
  assert.equal(desktopMcpStatusPresentation(null).valueId,
    "system.overview.mcp.checking");
  assert.equal(desktopMcpStatusPresentation({
    ...baseline, enrolled: false, state: "blocked", processRunning: false,
    reason: "device_not_enrolled",
  }).valueId, "system.overview.mcp.notEnrolled");
  assert.equal(desktopMcpStatusPresentation({
    ...baseline, state: "blocked", processRunning: false,
    reason: "dev_candidate_unavailable",
  }).valueId, "system.overview.mcp.blocked");
  assert.equal(desktopMcpStatusPresentation({
    ...baseline, state: "stopped", processRunning: false,
    reason: "runtime_exited",
  }).valueId, "system.overview.mcp.stopped");
});

test("Native status refuses fake attestation envelopes and malformed digests",()=>{
  const supposed={...baseline,mcpReady:true,centralSessionAttested:true,
    capabilityDigest:"b".repeat(64)};
  assert.equal(desktopMcpStatusPresentation(supposed).valueId,
    "system.overview.mcp.attested");
  for(const spoofed of [
    {...supposed,capabilityDigest:"fake"},
    {...supposed,capabilityDigest:"B".repeat(64)},
    {...supposed,capabilityDigest:"b".repeat(63)},
    {...supposed,capabilityDigest:1234},
    {...supposed,processRunning:false},
    {...supposed,enrolled:null},
    {...supposed,host:"windows-agent"},
    {...supposed,schema:"untrusted"},
    {...supposed,centralSessionAttested:false},
  ]) {
    assert.notEqual(desktopMcpStatusPresentation(spoofed).valueId,
      "system.overview.mcp.attested");
  }
  assert.equal(desktopMcpStatusPresentation(undefined).valueId,
    "system.overview.mcp.checking");
});