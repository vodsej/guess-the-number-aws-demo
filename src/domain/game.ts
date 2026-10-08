import { randomInt } from "node:crypto";

export const MIN_GUESS = 1;
export const MAX_GUESS = 100;

export type GameStatus = "IN_PROGRESS" | "WON";

export interface Game {
  gameId: string;
  secretNumber: number;
  status: GameStatus;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

export type GuessOutcome = "TOO_LOW" | "TOO_HIGH" | "CORRECT";

export const GAME_STARTED_MESSAGE = `Game started. Make a guess between ${String(MIN_GUESS)} and ${String(MAX_GUESS)}.`;

export const OUTCOME_MESSAGES: Record<GuessOutcome, string> = {
  TOO_LOW: "Too low. Try again!",
  TOO_HIGH: "Too high. Try again!",
  CORRECT: "Correct! You've guessed the number.",
};

/** Cryptographically secure so the secret cannot be predicted from earlier games. */
export function generateSecretNumber(): number {
  // randomInt's upper bound is exclusive.
  return randomInt(MIN_GUESS, MAX_GUESS + 1);
}

export function evaluateGuess(guess: number, secretNumber: number): GuessOutcome {
  if (guess < secretNumber) return "TOO_LOW";
  if (guess > secretNumber) return "TOO_HIGH";
  return "CORRECT";
}
