import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { evaluateGuess, OUTCOME_MESSAGES } from "../domain/game";
import { errorResponse, jsonResponse } from "../http/responses";
import { parseGuessRequest } from "../http/validation";
import { logger } from "../logger";
import { GameAlreadyWonError, type GameRepository } from "../repository/game-repository";

interface Dependencies {
  repository: GameRepository;
}

const GAME_ALREADY_WON_MESSAGE = "This game has already been won. Start a new game.";

/** POST /guess — compares a guess with the game's secret number. */
export function createGuessHandler({ repository }: Dependencies) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const log = { route: "POST /guess", requestId: event.requestContext.requestId };

    const request = parseGuessRequest(event.body);
    if (!request.success) {
      logger.info("Invalid request", { ...log, statusCode: 400, reason: request.error });
      return errorResponse(400, request.error);
    }
    const { gameId, guess } = request.data;

    try {
      const game = await repository.get(gameId);
      if (!game) {
        logger.info("Game not found", { ...log, gameId, statusCode: 404 });
        return errorResponse(404, "Game not found.");
      }
      if (game.status === "WON") {
        logger.info("Game already won", { ...log, gameId, statusCode: 409 });
        return errorResponse(409, GAME_ALREADY_WON_MESSAGE);
      }

      const outcome = evaluateGuess(guess, game.secretNumber);
      if (outcome === "CORRECT") {
        // Conditional write: if a concurrent request already won the game, this one loses.
        await repository.markWon(gameId);
      }

      logger.info("Guess evaluated", { ...log, gameId, outcome, statusCode: 200 });
      return jsonResponse(200, { message: OUTCOME_MESSAGES[outcome] });
    } catch (error) {
      if (error instanceof GameAlreadyWonError) {
        logger.info("Game already won", { ...log, gameId, statusCode: 409 });
        return errorResponse(409, GAME_ALREADY_WON_MESSAGE);
      }
      logger.error("Failed to evaluate guess", error, { ...log, gameId, statusCode: 500 });
      return errorResponse(500, "Internal server error.");
    }
  };
}
