import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Game } from "../../../src/domain/game";
import { createGuessHandler } from "../../../src/handlers/guess";
import { GameAlreadyWonError } from "../../../src/repository/game-repository";
import { apiGatewayEvent } from "../../support/api-gateway-event";
import { InMemoryGameRepository } from "../../support/in-memory-game-repository";

const SECRET = 42;

describe("guess handler", () => {
  let repository: InMemoryGameRepository;
  let game: Game;
  let handler: ReturnType<typeof createGuessHandler>;

  /** Strings and null are sent verbatim; anything else is JSON-encoded. */
  const guess = async (body: unknown) => {
    const raw = body === null || typeof body === "string" ? body : JSON.stringify(body);
    const response = await handler(apiGatewayEvent("/guess", raw));
    return {
      statusCode: response.statusCode,
      headers: response.headers,
      body: JSON.parse(response.body) as unknown,
    };
  };

  beforeEach(async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    repository = new InMemoryGameRepository();
    game = {
      gameId: randomUUID(),
      secretNumber: SECRET,
      status: "IN_PROGRESS",
      createdAt: new Date().toISOString(),
    };
    await repository.create(game);
    handler = createGuessHandler({ repository });
  });

  it.each([
    { value: 1, message: "Too low. Try again!" },
    { value: 41, message: "Too low. Try again!" },
    { value: 43, message: "Too high. Try again!" },
    { value: 100, message: "Too high. Try again!" },
  ])("returns 200 '$message' for $value", async ({ value, message }) => {
    expect(await guess({ gameId: game.gameId, guess: value })).toEqual({
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: { message },
    });
    expect(repository.games.get(game.gameId)?.status).toBe("IN_PROGRESS");
  });

  it("returns 200 'Correct!' and marks the game as won", async () => {
    expect(await guess({ gameId: game.gameId, guess: SECRET })).toMatchObject({
      statusCode: 200,
      body: { message: "Correct! You've guessed the number." },
    });
    expect(repository.games.get(game.gameId)?.status).toBe("WON");
  });

  it("returns 409 for any guess on a game that is already won", async () => {
    await guess({ gameId: game.gameId, guess: SECRET });

    for (const value of [1, SECRET, 100]) {
      expect(await guess({ gameId: game.gameId, guess: value })).toMatchObject({
        statusCode: 409,
        body: { message: "This game has already been won. Start a new game." },
      });
    }
  });

  it("returns 409 when a concurrent request wins the game first", async () => {
    vi.spyOn(repository, "markWon").mockRejectedValue(new GameAlreadyWonError(game.gameId));

    expect(await guess({ gameId: game.gameId, guess: SECRET })).toMatchObject({
      statusCode: 409,
      body: { message: "This game has already been won. Start a new game." },
    });
  });

  it("returns 404 for an unknown game", async () => {
    expect(await guess({ gameId: randomUUID(), guess: 50 })).toEqual({
      statusCode: 404,
      headers: { "Content-Type": "application/json" },
      body: { message: "Game not found." },
    });
  });

  it.each([
    { name: "a missing body", body: null, message: "Request body is required." },
    { name: "malformed JSON", body: "{", message: "Request body must be valid JSON." },
    {
      name: "an invalid guess",
      body: { gameId: randomUUID(), guess: 101 },
      message: "guess must be an integer between 1 and 100.",
    },
    {
      name: "an invalid gameId",
      body: { gameId: "nope", guess: 5 },
      message: "gameId must be a valid UUID.",
    },
  ])("returns 400 for $name", async ({ body, message }) => {
    expect(await guess(body)).toMatchObject({ statusCode: 400, body: { message } });
  });

  it("returns 500 when the repository fails", async () => {
    vi.spyOn(repository, "get").mockRejectedValue(new Error("DynamoDB unavailable"));

    expect(await guess({ gameId: game.gameId, guess: 50 })).toMatchObject({
      statusCode: 500,
      body: { message: "Internal server error." },
    });
    expect(console.error).toHaveBeenCalledOnce();
  });

  it("never logs the secret number", async () => {
    await guess({ gameId: game.gameId, guess: 10 });
    await guess({ gameId: game.gameId, guess: SECRET });

    const logged = vi.mocked(console.log).mock.calls.flat().join("\n");
    expect(logged).not.toContain("secret");
    expect(logged).not.toContain(`:${String(SECRET)}`);
  });
});
