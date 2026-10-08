import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { Game, GameStatus } from "../domain/game";

export interface GameRepository {
  create(game: Game): Promise<void>;
  get(gameId: string): Promise<Game | undefined>;
  /**
   * Atomically moves a game from IN_PROGRESS to WON.
   * @throws {GameAlreadyWonError} if the game is not in progress (e.g. a concurrent winning guess).
   */
  markWon(gameId: string): Promise<void>;
}

export class GameAlreadyWonError extends Error {
  constructor(gameId: string) {
    super(`Game ${gameId} is not in progress`);
    this.name = "GameAlreadyWonError";
  }
}

const IN_PROGRESS: GameStatus = "IN_PROGRESS";
const WON: GameStatus = "WON";

export class DynamoDbGameRepository implements GameRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async create(game: Game): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: game,
        // Never silently overwrite an existing game (guards against an ID collision).
        ConditionExpression: "attribute_not_exists(gameId)",
      }),
    );
  }

  async get(gameId: string): Promise<Game | undefined> {
    const { Item } = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { gameId },
        // A guess may arrive right after /start-game; an eventually consistent read could miss it.
        ConsistentRead: true,
      }),
    );
    // Items are only ever written by this repository, so they always have the Game shape.
    return Item as Game | undefined;
  }

  async markWon(gameId: string): Promise<void> {
    try {
      await this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { gameId },
          UpdateExpression: "SET #status = :won",
          // Fails for a game that is already won and for a missing item (no upsert).
          ConditionExpression: "#status = :inProgress",
          // "status" is a DynamoDB reserved word, hence the placeholder.
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: { ":won": WON, ":inProgress": IN_PROGRESS },
        }),
      );
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        throw new GameAlreadyWonError(gameId);
      }
      throw error;
    }
  }
}

/** Repository wired to the table named by the TABLE_NAME environment variable (set by CDK). */
export function createDynamoDbGameRepository(): DynamoDbGameRepository {
  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    throw new Error("TABLE_NAME environment variable is not set");
  }
  return new DynamoDbGameRepository(DynamoDBDocumentClient.from(new DynamoDBClient()), tableName);
}
