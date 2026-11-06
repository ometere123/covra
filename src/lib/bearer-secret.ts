import { timingSafeEqual } from "node:crypto";

export function matchesBearerSecret(header: string | null, expected: string | undefined): boolean {
  if (!header || !expected || !/^Bearer\s+/i.test(header)) return false;
  const supplied = Buffer.from(header.replace(/^Bearer\s+/i, ""));
  const secret = Buffer.from(expected);
  return supplied.length === secret.length && timingSafeEqual(supplied, secret);
}
