import { describe, expect, it } from "vitest";
import {
  evaluateGuess,
  generateSecretNumber,
  MAX_GUESS,
  MIN_GUESS,
} from "../../../src/domain/game";

describe("generateSecretNumber", () => {
  it("returns integers within the inclusive game range", () => {
    for (let i = 0; i < 1000; i++) {
      const secret = generateSecretNumber();
      expect(Number.isInteger(secret)).toBe(true);
      expect(secret).toBeGreaterThanOrEqual(MIN_GUESS);
      expect(secret).toBeLessThanOrEqual(MAX_GUESS);
    }
  });
});

describe("evaluateGuess", () => {
  it.each([
    { guess: 1, secret: 50, expected: "TOO_LOW" },
    { guess: 49, secret: 50, expected: "TOO_LOW" },
    { guess: 51, secret: 50, expected: "TOO_HIGH" },
    { guess: 100, secret: 50, expected: "TOO_HIGH" },
    { guess: 50, secret: 50, expected: "CORRECT" },
    { guess: 1, secret: 1, expected: "CORRECT" },
    { guess: 100, secret: 100, expected: "CORRECT" },
  ] as const)("guess $guess vs secret $secret -> $expected", ({ guess, secret, expected }) => {
    expect(evaluateGuess(guess, secret)).toBe(expected);
  });
});
