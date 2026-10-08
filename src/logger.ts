/**
 * Minimal structured logger: one JSON object per line, so CloudWatch Logs Insights can
 * filter and aggregate on fields (e.g. `filter statusCode >= 500`).
 */
type Fields = Record<string, unknown>;

export const logger = {
  info(message: string, fields: Fields = {}): void {
    console.log(JSON.stringify({ level: "INFO", message, ...fields }));
  },
  error(message: string, error: unknown, fields: Fields = {}): void {
    const details =
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { message: String(error) };
    console.error(JSON.stringify({ level: "ERROR", message, ...fields, error: details }));
  },
};
