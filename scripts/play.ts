// Interactive terminal client for a deployed API: `npm run local:play`, or
// API_URL=https://abc123.execute-api.eu-central-1.amazonaws.com/v1/ npx tsx scripts/play.ts
import { createInterface } from "node:readline/promises";

// A trailing slash is added if missing so that `new URL("guess", API_URL)` keeps the /v1 segment.
const API_URL = process.env.API_URL?.replace(/\/?$/, "/");
if (!API_URL) {
  console.error("API_URL is not set. Run `npm run local:up` first, then `npm run local:play`.");
  process.exit(1);
}

const bold = (text: string) => `\x1b[1m${text}\x1b[0m`;
const dim = (text: string) => `\x1b[2m${text}\x1b[0m`;
const red = (text: string) => `\x1b[31m${text}\x1b[0m`;
const green = (text: string) => `\x1b[32m${text}\x1b[0m`;

async function post(
  path: string,
  body?: unknown,
): Promise<{ status: number; message: string; gameId?: string }> {
  const response = await fetch(new URL(path, API_URL), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = (await response.json()) as { message: string; gameId?: string };
  return { status: response.status, ...json };
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const closed = new AbortController();
rl.on("SIGINT", () => {
  rl.close();
});
rl.on("close", () => {
  closed.abort();
});

// Resolves to undefined once the user closes the prompt (Ctrl+C / Ctrl+D).
async function ask(query: string): Promise<string | undefined> {
  try {
    return (await rl.question(query, { signal: closed.signal })).trim();
  } catch {
    return undefined;
  }
}

async function playGame(): Promise<"won" | "quit"> {
  const started = await post("start-game");
  if (started.status !== 201 || !started.gameId)
    throw new Error(`start-game failed: ${started.message}`);
  const gameId = started.gameId;
  let low = 1;
  let high = 100;
  const history: string[] = [];
  let notice = "";

  for (;;) {
    console.clear();
    console.log(bold("Guess the Number") + dim(`  game ${gameId.slice(0, 8)}`));
    console.log(
      `Attempts: ${String(history.length)}   Range: ${bold(`${String(low)}..${String(high)}`)}\n`,
    );
    for (const line of history) console.log(`  ${line}`);
    if (notice) console.log(`\n${notice}`);

    const input = await ask("\nYour guess (1-100, q to quit): ");
    if (input === undefined || input.toLowerCase() === "q") return "quit";
    const guess = Number(input);
    if (!/^\d+$/.test(input) || guess < 1 || guess > 100) {
      notice = red(`"${input}" is not a whole number between 1 and 100.`);
      continue;
    }

    const result = await post("guess", { gameId, guess });
    if (result.status !== 200) {
      notice = red(`Server said ${String(result.status)}: ${result.message}`);
      continue;
    }
    notice = "";
    if (result.message.startsWith("Too low")) {
      history.push(`${String(guess)} ↑ too low`);
      low = Math.max(low, guess + 1);
    } else if (result.message.startsWith("Too high")) {
      history.push(`${String(guess)} ↓ too high`);
      high = Math.min(high, guess - 1);
    } else {
      console.log(
        green(`\n${String(guess)} is correct! You won in ${String(history.length + 1)} attempts.`),
      );
      return "won";
    }
  }
}

try {
  while ((await playGame()) === "won") {
    const again = await ask("Play again? (y/n) ");
    if (again?.toLowerCase() !== "y") break;
  }
} catch (error) {
  console.error(red(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
} finally {
  rl.close();
}
