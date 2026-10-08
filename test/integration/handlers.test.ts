import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createGuessHandler } from "../../src/handlers/guess";
import { createStartGameHandler } from "../../src/handlers/start-game";
import { DynamoDbGameRepository } from "../../src/repository/game-repository";
import { apiGatewayEvent } from "../support/api-gateway-event";
import { createTestTable, type TestTable } from "./dynamodb-local";

describe("handlers against DynamoDB Local", () => {
  let table: TestTable;
  let startGame: ReturnType<typeof createStartGameHandler>;
  let guess: ReturnType<typeof createGuessHandler>;

  beforeAll(async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    table = await createTestTable();
    const repository = new DynamoDbGameRepository(table.client, table.tableName);
    startGame = createStartGameHandler({ repository });
    guess = createGuessHandler({ repository });
  });

  afterAll(async () => {
    await table.destroy();
  });

  const makeGuess = async (gameId: string, value: number) => {
    const response = await guess(
      apiGatewayEvent("/guess", JSON.stringify({ gameId, guess: value })),
    );
    return {
      statusCode: response.statusCode,
      message: (JSON.parse(response.body) as { message: string }).message,
    };
  };

  it("plays a full game: binary search to the secret, then 409 on further guesses", async () => {
    const started = await startGame(apiGatewayEvent("/start-game"));
    expect(started.statusCode).toBe(201);
    const { gameId } = JSON.parse(started.body) as { gameId: string };

    let low = 1;
    let high = 100;
    let attempts = 0;
    for (;;) {
      attempts++;
      const value = Math.floor((low + high) / 2);
      const { statusCode, message } = await makeGuess(gameId, value);
      expect(statusCode).toBe(200);
      if (message === "Correct! You've guessed the number.") break;
      if (message === "Too low. Try again!") low = value + 1;
      else if (message === "Too high. Try again!") high = value - 1;
      else throw new Error(`Unexpected message: ${message}`);
    }
    expect(attempts).toBeLessThanOrEqual(7);

    expect(await makeGuess(gameId, 50)).toEqual({
      statusCode: 409,
      message: "This game has already been won. Start a new game.",
    });
  });

  it("returns 404 for a game that does not exist", async () => {
    expect(await makeGuess("00000000-0000-4000-8000-000000000000", 50)).toEqual({
      statusCode: 404,
      message: "Game not found.",
    });
  });
});
