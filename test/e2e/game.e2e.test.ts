import { describe, expect, it } from "vitest";

// Base URL of the deployed stage, e.g. the `ApiUrl` stack output:
// API_URL=https://abc123.execute-api.eu-central-1.amazonaws.com/v1/ npm run test:e2e
// A trailing slash is added if missing so that `new URL("guess", API_URL)` keeps the /v1 segment.
const API_URL = process.env.API_URL ? process.env.API_URL.replace(/\/?$/, "/") : undefined;

interface ApiResponse {
  status: number;
  contentType: string | null;
  body: Record<string, unknown>;
}

async function post(path: string, body?: string): Promise<ApiResponse> {
  const response = await fetch(new URL(path, API_URL), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body }),
  });
  return {
    status: response.status,
    contentType: response.headers.get("content-type"),
    body: (await response.json()) as Record<string, unknown>,
  };
}

const guess = (gameId: string, value: unknown) =>
  post("guess", JSON.stringify({ gameId, guess: value }));

describe.skipIf(!API_URL)("deployed API", () => {
  it("plays a full game and rejects guesses after it is won", async () => {
    const started = await post("start-game");
    expect(started.status).toBe(201);
    expect(started.contentType).toContain("application/json");
    expect(started.body.message).toBe("Game started. Make a guess between 1 and 100.");
    const gameId = started.body.gameId as string;

    // Binary search finds any number in 1..100 within 7 guesses.
    let low = 1;
    let high = 100;
    let won = false;
    for (let attempt = 0; attempt < 7 && !won; attempt++) {
      const value = Math.floor((low + high) / 2);
      const response = await guess(gameId, value);
      expect(response.status).toBe(200);

      if (response.body.message === "Too low. Try again!") low = value + 1;
      else if (response.body.message === "Too high. Try again!") high = value - 1;
      else {
        expect(response.body.message).toBe("Correct! You've guessed the number.");
        won = true;
      }
    }
    expect(won).toBe(true);

    const afterWin = await guess(gameId, 50);
    expect(afterWin.status).toBe(409);
    expect(afterWin.body.message).toBe("This game has already been won. Start a new game.");
  });

  it("returns 404 for an unknown game", async () => {
    const response = await guess("00000000-0000-4000-8000-000000000000", 50);
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: "Game not found." });
  });

  it.each([
    ["an out-of-range guess", JSON.stringify({ gameId: crypto.randomUUID(), guess: 101 })],
    ["a non-integer guess", JSON.stringify({ gameId: crypto.randomUUID(), guess: 50.5 })],
    ["a string guess", JSON.stringify({ gameId: crypto.randomUUID(), guess: "50" })],
    ["an invalid gameId", JSON.stringify({ gameId: "not-a-uuid", guess: 50 })],
    ["a missing field", JSON.stringify({ guess: 50 })],
    ["malformed JSON", "{"],
  ])("returns 400 for %s", async (_name, body) => {
    const response = await post("guess", body);
    expect(response.status).toBe(400);
    expect(response.contentType).toContain("application/json");
    expect(response.body.message).toEqual(expect.any(String));
  });
});
