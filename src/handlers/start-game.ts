import { randomUUID } from "node:crypto";
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { GAME_STARTED_MESSAGE, generateSecretNumber, type Game } from "../domain/game";
import { errorResponse, jsonResponse } from "../http/responses";
import { logger } from "../logger";
import type { GameRepository } from "../repository/game-repository";

/** POST /start-game — creates a new game and returns its id (the secret number stays server-side). */
export function createStartGameHandler(repository: GameRepository) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const log = { route: "POST /start-game", requestId: event.requestContext.requestId };

    try {
      const game: Game = {
        gameId: randomUUID(),
        secretNumber: generateSecretNumber(),
        status: "IN_PROGRESS",
        createdAt: new Date().toISOString(),
      };
      await repository.create(game);

      logger.info("Game started", { ...log, gameId: game.gameId, statusCode: 201 });
      return jsonResponse(201, { gameId: game.gameId, message: GAME_STARTED_MESSAGE });
    } catch (error) {
      logger.error("Failed to start game", error, { ...log, statusCode: 500 });
      return errorResponse(500, "Internal server error.");
    }
  };
}
