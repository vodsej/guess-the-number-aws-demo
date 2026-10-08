import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStartGameHandler } from "../../../src/handlers/start-game";
import { apiGatewayEvent } from "../../support/api-gateway-event";
import { InMemoryGameRepository } from "../../support/in-memory-game-repository";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("start-game handler", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("creates a game and returns 201 with its id", async () => {
    const repository = new InMemoryGameRepository();
    const handler = createStartGameHandler({ repository });

    const response = await handler(apiGatewayEvent("/start-game"));

    expect(response.statusCode).toBe(201);
    expect(response.headers).toEqual({ "Content-Type": "application/json" });
    const body = JSON.parse(response.body) as { gameId: string; message: string };
    expect(body).toEqual({
      gameId: expect.stringMatching(UUID_PATTERN) as unknown,
      message: "Game started. Make a guess between 1 and 100.",
    });

    const stored = repository.games.get(body.gameId);
    expect(stored).toMatchObject({ gameId: body.gameId, status: "IN_PROGRESS" });
    expect(stored?.secretNumber).toBeGreaterThanOrEqual(1);
    expect(stored?.secretNumber).toBeLessThanOrEqual(100);
    expect(Number.isNaN(Date.parse(stored?.createdAt ?? ""))).toBe(false);
  });

  it("does not reveal the secret number", async () => {
    const repository = new InMemoryGameRepository();
    const response = await createStartGameHandler({ repository })(apiGatewayEvent("/start-game"));

    expect(Object.keys(JSON.parse(response.body) as object)).toEqual(["gameId", "message"]);
  });

  it("returns 500 when the game cannot be stored", async () => {
    const repository = new InMemoryGameRepository();
    vi.spyOn(repository, "create").mockRejectedValue(new Error("DynamoDB unavailable"));

    const response = await createStartGameHandler({ repository })(apiGatewayEvent("/start-game"));

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toEqual({ message: "Internal server error." });
    expect(console.error).toHaveBeenCalledOnce();
  });
});
