import { describe, expect, it } from "vitest";

import {
  assertNoReplayDrift,
  runDeterministicSimulation,
} from "../../scripts/verify-determinism";

describe("Replay Determinism", () => {
  const scenarios: Array<{ matchSeed: string; policySeed: string }> = [
    { matchSeed: "replay-regression-001", policySeed: "policy-a" },
    { matchSeed: "replay-regression-002", policySeed: "policy-a" },
    { matchSeed: "replay-regression-003", policySeed: "policy-b" },
  ];

  it.each(scenarios)("has no drift for %o", ({ matchSeed, policySeed }) => {
    expect(() => assertNoReplayDrift(matchSeed, policySeed)).not.toThrow();
  });

  it("produces stable simulation metadata", () => {
    const result = runDeterministicSimulation("replay-regression-001", "policy-a");

    expect(result.fingerprint.length).toBe(64);
    expect(result.completedHands).toBeGreaterThan(0);
    expect(result.transcript.length).toBeGreaterThan(0);
    expect(result.remainingSeats).toBeGreaterThanOrEqual(1);
  });
});
