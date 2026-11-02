import postgres from "postgres";

let singleton: ReturnType<typeof postgres> | undefined;

export function hasDatabase(): boolean {
  const value = process.env.DATABASE_URL;
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "postgres:" || parsed.protocol === "postgresql:";
  } catch {
    return false;
  }
}

export function database(): ReturnType<typeof postgres> {
  const url = process.env.DATABASE_URL;
  if (!url || !hasDatabase()) throw new Error("DATABASE_URL is missing or malformed; write operations are disabled until it is corrected.");
  if (!singleton) singleton = postgres(url, { max: 5, prepare: false, idle_timeout: 10 });
  return singleton;
}

export function requireLiveDatabase(): void {
  if (!hasDatabase()) throw new Error("Database not configured");
}
