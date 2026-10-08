import * as path from "node:path";
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, type NodejsFunctionProps } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";
import { MAX_GUESS, MIN_GUESS } from "../src/domain/game";

const UUID_PATTERN =
  "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";

export class GuessGameStack extends Stack {
  readonly table: dynamodb.Table;
  readonly startGameFunction: NodejsFunction;
  readonly guessFunction: NodejsFunction;
  readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.table = new dynamodb.Table(this, "GamesTable", {
      partitionKey: { name: "gameId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      // Demo stack: `cdk destroy` removes the data. Use RETAIN for anything real.
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.startGameFunction = this.createFunction("StartGame", "start-game.ts");
    this.guessFunction = this.createFunction("Guess", "guess.ts");

    // Least privilege: each function gets exactly the DynamoDB actions it calls.
    this.table.grant(this.startGameFunction, "dynamodb:PutItem");
    this.table.grant(this.guessFunction, "dynamodb:GetItem", "dynamodb:UpdateItem");

    this.api = new apigateway.RestApi(this, "GuessGameApi", {
      restApiName: "guess-the-number",
      description: "Guess the Number game",
      endpointTypes: [apigateway.EndpointType.REGIONAL],
      deployOptions: {
        stageName: "v1",
        // Applies to every method; protects DynamoDB and the account's Lambda concurrency.
        throttlingRateLimit: 20,
        throttlingBurstLimit: 40,
      },
    });

    this.api.root
      .addResource("start-game")
      .addMethod("POST", new apigateway.LambdaIntegration(this.startGameFunction));

    this.api.root
      .addResource("guess")
      .addMethod("POST", new apigateway.LambdaIntegration(this.guessFunction), {
        // Rejects malformed bodies before a Lambda is invoked; the handler validates again.
        requestValidator: this.api.addRequestValidator("GuessBodyValidator", {
          validateRequestBody: true,
          validateRequestParameters: false,
        }),
        requestModels: { "application/json": this.createGuessRequestModel() },
      });

    this.api.addGatewayResponse("BadRequestBody", {
      type: apigateway.ResponseType.BAD_REQUEST_BODY,
      statusCode: "400",
      // Static text on purpose: $context.error.validationErrorString contains unescaped
      // double quotes and would produce invalid JSON.
      templates: {
        "application/json": JSON.stringify({
          message: `Request body must be a JSON object with a UUID gameId and an integer guess between ${String(MIN_GUESS)} and ${String(MAX_GUESS)}.`,
        }),
      },
    });

    // REST APIs answer unmatched routes/methods with 403 "Missing Authentication Token".
    // This API has no authorizers, so that response only ever means "no such route".
    this.api.addGatewayResponse("NotFound", {
      type: apigateway.ResponseType.MISSING_AUTHENTICATION_TOKEN,
      statusCode: "404",
      templates: { "application/json": JSON.stringify({ message: "Not found." }) },
    });

    new CfnOutput(this, "ApiUrl", { value: this.api.url, description: "Base URL of the API" });
    new CfnOutput(this, "TableName", { value: this.table.tableName });
  }

  private createFunction(id: string, entryFile: string): NodejsFunction {
    const props: NodejsFunctionProps = {
      entry: path.join(import.meta.dirname, "../src/lambda", entryFile),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(5),
      environment: {
        TABLE_NAME: this.table.tableName,
        NODE_OPTIONS: "--enable-source-maps",
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: "node22",
      },
      logGroup: new logs.LogGroup(this, `${id}Logs`, {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    };
    return new NodejsFunction(this, `${id}Function`, props);
  }

  private createGuessRequestModel(): apigateway.Model {
    return this.api.addModel("GuessRequestModel", {
      contentType: "application/json",
      modelName: "GuessRequest",
      schema: {
        schema: apigateway.JsonSchemaVersion.DRAFT4,
        title: "GuessRequest",
        type: apigateway.JsonSchemaType.OBJECT,
        required: ["gameId", "guess"],
        properties: {
          gameId: { type: apigateway.JsonSchemaType.STRING, pattern: UUID_PATTERN },
          guess: {
            type: apigateway.JsonSchemaType.INTEGER,
            minimum: MIN_GUESS,
            maximum: MAX_GUESS,
          },
        },
      },
    });
  }
}
