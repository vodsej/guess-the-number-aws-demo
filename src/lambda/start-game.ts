// Lambda entry point. Dependencies are created once per execution environment (cold start)
// and reused across invocations, so the DynamoDB client keeps its HTTP connections alive.
import { createStartGameHandler } from "../handlers/start-game";
import { createDynamoDbGameRepository } from "../repository/game-repository";

export const handler = createStartGameHandler({ repository: createDynamoDbGameRepository() });
