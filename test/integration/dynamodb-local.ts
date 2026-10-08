import { randomUUID } from "node:crypto";
import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const ENDPOINT = process.env.DYNAMODB_ENDPOINT ?? "http://localhost:8000";

export interface TestTable {
  client: DynamoDBDocumentClient;
  tableName: string;
  destroy: () => Promise<void>;
}

/** Creates a uniquely named table on DynamoDB Local with the same key schema as the CDK stack. */
export async function createTestTable(): Promise<TestTable> {
  const rawClient = new DynamoDBClient({
    endpoint: ENDPOINT,
    region: "eu-central-1",
    credentials: { accessKeyId: "local", secretAccessKey: "local" },
  });
  const tableName = `games-test-${randomUUID()}`;

  await rawClient.send(
    new CreateTableCommand({
      TableName: tableName,
      KeySchema: [{ AttributeName: "gameId", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "gameId", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
  await waitUntilTableExists({ client: rawClient, maxWaitTime: 30 }, { TableName: tableName });

  return {
    client: DynamoDBDocumentClient.from(rawClient),
    tableName,
    destroy: async () => {
      await rawClient.send(new DeleteTableCommand({ TableName: tableName }));
      rawClient.destroy();
    },
  };
}
