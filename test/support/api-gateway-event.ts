import type { APIGatewayProxyEvent } from "aws-lambda";

/** Minimal REST API (v1) proxy event; handlers only read `body` and `requestContext.requestId`. */
export function apiGatewayEvent(path: string, body: string | null = null): APIGatewayProxyEvent {
  return {
    httpMethod: "POST",
    path,
    resource: path,
    body,
    isBase64Encoded: false,
    headers: { "Content-Type": "application/json" },
    requestContext: { requestId: "test-request-id" },
  } as unknown as APIGatewayProxyEvent;
}
