import { describe, expect, it } from "vitest";
import { parseGuessRequest } from "../../../src/http/validation";

const GAME_ID = "3f2b8c1e-4d5a-4b6c-9e7f-0a1b2c3d4e5f";
const body = (value: unknown) => JSON.stringify(value);

describe("parseGuessRequest", () => {
  it.each([1, 50, 100])("accepts a valid request with guess %d", (guess) => {
    expect(parseGuessRequest(body({ gameId: GAME_ID, guess }))).toEqual({
      success: true,
      data: { gameId: GAME_ID, guess },
    });
  });

  it("normalises an uppercase gameId to the stored lowercase form", () => {
    expect(parseGuessRequest(body({ gameId: GAME_ID.toUpperCase(), guess: 7 }))).toEqual({
      success: true,
      data: { gameId: GAME_ID, guess: 7 },
    });
  });

  it("ignores unknown properties", () => {
    expect(parseGuessRequest(body({ gameId: GAME_ID, guess: 7, extra: true }))).toEqual({
      success: true,
      data: { gameId: GAME_ID, guess: 7 },
    });
  });

  it.each([null, undefined, ""])("rejects a missing body (%j)", (raw) => {
    expect(parseGuessRequest(raw)).toEqual({
      success: false,
      error: "Request body is required.",
    });
  });

  it.each(["{", "not json", "{'gameId': 1}"])("rejects malformed JSON %j", (raw) => {
    expect(parseGuessRequest(raw)).toEqual({
      success: false,
      error: "Request body must be valid JSON.",
    });
  });

  it.each([body(null), body([]), body("text"), body(42)])("rejects non-object JSON %s", (raw) => {
    expect(parseGuessRequest(raw)).toEqual({
      success: false,
      error: "Request body must be a JSON object.",
    });
  });

  it.each([0, 101, -1, 50.5, "50", null, true, 1e9])("rejects guess %j", (guess) => {
    expect(parseGuessRequest(body({ gameId: GAME_ID, guess }))).toEqual({
      success: false,
      error: "guess must be an integer between 1 and 100.",
    });
  });

  it("rejects a missing guess", () => {
    expect(parseGuessRequest(body({ gameId: GAME_ID }))).toEqual({
      success: false,
      error: "guess must be an integer between 1 and 100.",
    });
  });

  it.each(["", "abc", "unique-game-id", 123, null])("rejects gameId %j", (gameId) => {
    expect(parseGuessRequest(body({ gameId, guess: 50 }))).toEqual({
      success: false,
      error: "gameId must be a valid UUID.",
    });
  });

  it("rejects a missing gameId", () => {
    expect(parseGuessRequest(body({ guess: 50 }))).toEqual({
      success: false,
      error: "gameId must be a valid UUID.",
    });
  });

  it("reports every invalid field", () => {
    expect(parseGuessRequest(body({}))).toEqual({
      success: false,
      error: "gameId must be a valid UUID. guess must be an integer between 1 and 100.",
    });
  });
});
