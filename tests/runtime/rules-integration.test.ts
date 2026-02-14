import { describe, expect, it } from "vitest";

import {
  runDeadButtonAndHeadsUpTransitionScenario,
  runMultiwayOpeningOrderScenario,
} from "../../scripts/verify-rules-integration";

describe("Rules Integration", () => {
  it("validates multiway opening order", () => {
    expect(() => runMultiwayOpeningOrderScenario()).not.toThrow();
  });

  it("validates dead-button and heads-up transition behavior", () => {
    expect(() => runDeadButtonAndHeadsUpTransitionScenario()).not.toThrow();
  });
});
