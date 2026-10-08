import type { Game } from "../../src/domain/game";
import { GameAlreadyWonError, type GameRepository } from "../../src/repository/game-repository";

/** Test double with the same observable behaviour as DynamoDbGameRepository. */
export class InMemoryGameRepository implements GameRepository {
  readonly games = new Map<string, Game>();

  create(game: Game): Promise<void> {
    if (this.games.has(game.gameId)) {
      return Promise.reject(new Error(`Game ${game.gameId} already exists`));
    }
    this.games.set(game.gameId, { ...game });
    return Promise.resolve();
  }

  get(gameId: string): Promise<Game | undefined> {
    const game = this.games.get(gameId);
    return Promise.resolve(game && { ...game });
  }

  markWon(gameId: string): Promise<void> {
    const game = this.games.get(gameId);
    if (game?.status !== "IN_PROGRESS") {
      return Promise.reject(new GameAlreadyWonError(gameId));
    }
    game.status = "WON";
    return Promise.resolve();
  }
}
