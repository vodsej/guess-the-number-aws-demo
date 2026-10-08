import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Game } from "../../src/domain/game";
import { DynamoDbGameRepository, GameAlreadyWonError } from "../../src/repository/game-repository";
import { createTestTable, type TestTable } from "./dynamodb-local";

const newGame = (overrides: Partial<Game> = {}): Game => ({
  gameId: randomUUID(),
  secretNumber: 42,
  status: "IN_PROGRESS",
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe("DynamoDbGameRepository", () => {
  let table: TestTable;
  let repository: DynamoDbGameRepository;

  beforeAll(async () => {
    table = await createTestTable();
    repository = new DynamoDbGameRepository(table.client, table.tableName);
  });

  afterAll(async () => {
    await table.destroy();
  });

  it("stores a game and reads it back", async () => {
    const game = newGame();
    await repository.create(game);

    expect(await repository.get(game.gameId)).toEqual(game);
  });

  it("returns undefined for an unknown game", async () => {
    expect(await repository.get(randomUUID())).toBeUndefined();
  });

  it("refuses to overwrite an existing game", async () => {
    const game = newGame();
    await repository.create(game);

    await expect(repository.create({ ...game, secretNumber: 7 })).rejects.toThrow();
    expect(await repository.get(game.gameId)).toEqual(game);
  });

  it("marks an in-progress game as won", async () => {
    const game = newGame();
    await repository.create(game);

    await repository.markWon(game.gameId);

    expect(await repository.get(game.gameId)).toEqual({ ...game, status: "WON" });
  });

  it("throws GameAlreadyWonError when the game is already won", async () => {
    const game = newGame({ status: "WON" });
    await repository.create(game);

    await expect(repository.markWon(game.gameId)).rejects.toBeInstanceOf(GameAlreadyWonError);
  });

  it("lets exactly one of two concurrent winning updates succeed", async () => {
    const game = newGame();
    await repository.create(game);

    const results = await Promise.allSettled([
      repository.markWon(game.gameId),
      repository.markWon(game.gameId),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(GameAlreadyWonError);
  });

  it("does not create a game when marking an unknown id as won", async () => {
    const gameId = randomUUID();

    await expect(repository.markWon(gameId)).rejects.toBeInstanceOf(GameAlreadyWonError);
    expect(await repository.get(gameId)).toBeUndefined();
  });
});
