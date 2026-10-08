import { App, type CfnElement } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import type { IConstruct } from "constructs";
import { beforeAll, describe, expect, it } from "vitest";
import { GuessGameStack } from "../../lib/guess-game-stack";

describe("GuessGameStack", () => {
  let stack: GuessGameStack;
  let template: Template;

  const logicalId = (construct: IConstruct) =>
    stack.getLogicalId(construct.node.defaultChild as CfnElement);

  beforeAll(() => {
    stack = new GuessGameStack(new App(), "TestStack");
    template = Template.fromStack(stack);
  });

  describe("DynamoDB table", () => {
    it("uses gameId as the partition key with on-demand billing and PITR", () => {
      template.resourceCountIs("AWS::DynamoDB::Table", 1);
      template.hasResourceProperties("AWS::DynamoDB::Table", {
        KeySchema: [{ AttributeName: "gameId", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "gameId", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST",
        PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
      });
    });
  });

  describe("Lambda functions", () => {
    it("deploys one function per endpoint on Node.js 22 / arm64 with the table name", () => {
      const functions = template.findResources("AWS::Lambda::Function");
      for (const fn of [stack.startGameFunction, stack.guessFunction]) {
        expect(functions[logicalId(fn)]).toMatchObject({
          Properties: {
            Runtime: "nodejs22.x",
            Architectures: ["arm64"],
            MemorySize: 256,
            Timeout: 5,
            Environment: {
              Variables: { TABLE_NAME: { Ref: logicalId(stack.table) } },
            },
          },
        });
      }
    });

    it("keeps logs for one week", () => {
      template.resourcePropertiesCountIs("AWS::Logs::LogGroup", { RetentionInDays: 7 }, 2);
    });

    it.each([
      { name: "start-game", fn: () => stack.startGameFunction, actions: "dynamodb:PutItem" },
      {
        name: "guess",
        fn: () => stack.guessFunction,
        actions: ["dynamodb:GetItem", "dynamodb:UpdateItem"],
      },
    ])("grants $name only the DynamoDB actions it needs", ({ fn, actions }) => {
      // NodejsFunction always creates a role when none is passed in.
      const roleId = logicalId(fn().role as IConstruct);
      const policies = template.findResources("AWS::IAM::Policy", {
        Properties: { Roles: [{ Ref: roleId }] },
      });
      const statements = Object.values(policies).flatMap(
        (policy) =>
          (policy as { Properties: { PolicyDocument: { Statement: unknown[] } } }).Properties
            .PolicyDocument.Statement,
      );

      expect(statements).toEqual([
        {
          Effect: "Allow",
          Action: actions,
          Resource: [{ "Fn::GetAtt": [logicalId(stack.table), "Arn"] }],
        },
      ]);
    });
  });

  describe("API Gateway", () => {
    it("exposes POST /start-game and POST /guess backed by Lambda proxy integrations", () => {
      template.resourceCountIs("AWS::ApiGateway::Method", 2);
      for (const path of ["start-game", "guess"]) {
        template.hasResourceProperties("AWS::ApiGateway::Resource", { PathPart: path });
      }
      template.hasResourceProperties("AWS::ApiGateway::Method", {
        HttpMethod: "POST",
        Integration: { Type: "AWS_PROXY" },
      });
    });

    it("validates the /guess body against a JSON schema model", () => {
      template.hasResourceProperties("AWS::ApiGateway::RequestValidator", {
        ValidateRequestBody: true,
        ValidateRequestParameters: false,
      });
      template.hasResourceProperties("AWS::ApiGateway::Model", {
        ContentType: "application/json",
        Schema: Match.objectLike({
          type: "object",
          required: ["gameId", "guess"],
          properties: {
            gameId: Match.objectLike({ type: "string" }),
            guess: { type: "integer", minimum: 1, maximum: 100 },
          },
        }),
      });
      template.hasResourceProperties("AWS::ApiGateway::Method", {
        HttpMethod: "POST",
        RequestValidatorId: Match.anyValue(),
        RequestModels: { "application/json": Match.anyValue() },
      });
    });

    it("returns JSON errors for bodies rejected by the validator", () => {
      template.hasResourceProperties("AWS::ApiGateway::GatewayResponse", {
        ResponseType: "BAD_REQUEST_BODY",
        StatusCode: "400",
        ResponseTemplates: { "application/json": Match.stringLikeRegexp('^\\{"message":') },
      });
    });

    it("answers unknown routes and methods with 404 instead of 403", () => {
      template.hasResourceProperties("AWS::ApiGateway::GatewayResponse", {
        ResponseType: "MISSING_AUTHENTICATION_TOKEN",
        StatusCode: "404",
        ResponseTemplates: { "application/json": '{"message":"Not found."}' },
      });
    });

    it("throttles the stage", () => {
      template.hasResourceProperties("AWS::ApiGateway::Stage", {
        StageName: "v1",
        MethodSettings: [
          Match.objectLike({
            HttpMethod: "*",
            ResourcePath: "/*",
            ThrottlingRateLimit: 20,
            ThrottlingBurstLimit: 40,
          }),
        ],
      });
    });

    it("outputs the API URL", () => {
      template.hasOutput("ApiUrl", {});
    });
  });
});
