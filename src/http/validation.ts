// zod/mini is the tree-shakeable build: ~16 KB in the Lambda bundle instead of ~450 KB.
import * as z from "zod/mini";
import { MAX_GUESS, MIN_GUESS } from "../domain/game";

const GAME_ID_ERROR = "gameId must be a valid UUID.";
const GUESS_ERROR = `guess must be an integer between ${String(MIN_GUESS)} and ${String(MAX_GUESS)}.`;

const guessRequestSchema = z.object(
  {
    gameId: z.uuid({ error: GAME_ID_ERROR }),
    guess: z
      .int({ error: GUESS_ERROR })
      .check(
        z.minimum(MIN_GUESS, { error: GUESS_ERROR }),
        z.maximum(MAX_GUESS, { error: GUESS_ERROR }),
      ),
  },
  { error: "Request body must be a JSON object." },
);

export type GuessRequest = z.infer<typeof guessRequestSchema>;

export type ParseResult<T> = { success: true; data: T } | { success: false; error: string };

/** Parses and validates the raw API Gateway body of a POST /guess request. */
export function parseGuessRequest(body: string | null | undefined): ParseResult<GuessRequest> {
  if (!body) {
    return { success: false, error: "Request body is required." };
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { success: false, error: "Request body must be valid JSON." };
  }

  const result = guessRequestSchema.safeParse(json);
  if (!result.success) {
    // De-duplicate: an out-of-range float fails several checks with the same message.
    const messages = new Set(result.error.issues.map((issue) => issue.message));
    return { success: false, error: [...messages].join(" ") };
  }
  return { success: true, data: result.data };
}
