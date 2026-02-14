import { describe, expect, it } from "vitest";

import {
  runForcedAllInScenario,
  runRandomizedSimulation,
} from "../../scripts/verify-hand-engine";

describe("Hand Engine Settlement", () => {
  it.each([1, 5, 11, 17, 25])("randomized seed %s maintains invariants", (seed) => {
    expect(() => runRandomizedSimulation(seed)).not.toThrow();
  });

  it.each([1, 9, 17, 25])("forced all-in seed %s settles correctly", (seed) => {
    expect(() => runForcedAllInScenario(seed)).not.toThrow();
  });
});
