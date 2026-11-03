import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { recoverMessageAddress, isAddress } from "viem";
import { database } from "./db";

const SESSION_COOKIE = "covra_session";
const NONCE_COOKIE = "covra_nonce";

function secretKey() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET must be a randomly generated secret of at least 32 characters.");
  return new TextEncoder().encode(value);
}

export function createChallenge(wallet: string, origin: string) {
  if (!isAddress(wallet)) throw new Error("Invalid wallet address");
  const nonce = randomBytes(16).toString("hex");
  const createdAt = new Date().toISOString();
  const message = [
    "COVRA account access", "Sign to access the coverage console.",
    "Domain: " + new URL(origin).host,
    "Wallet: " + wallet.toLowerCase(),
    "Nonce: " + nonce, "Issued At: " + createdAt,
    "Chain: Base Sepolia (84532)", "No transaction or gas fee is required.",
  ].join("\n");
  return { nonce, message, wallet: wallet.toLowerCase(), createdAt, origin };
}

export async function setNonceCookie(payload: ReturnType<typeof createChallenge>) {
  const sql = database();
  const nonceDigest = createHash("sha256").update(payload.nonce).digest("hex");
  const messageDigest = createHash("sha256").update(payload.message).digest("hex");
  await sql`insert into auth_challenges(nonce_digest,wallet,message_digest,origin,expires_at)
    values(${nonceDigest},${payload.wallet},${messageDigest},${payload.origin},now()+interval '10 minutes')`;
  const jar = await cookies();
  jar.set(NONCE_COOKIE, Buffer.from(JSON.stringify(payload)).toString("base64url"), {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 600,
  });
}

export async function verifyLogin(wallet: string, message: string, signature: `0x${string}`, origin: string) {
  const jar = await cookies();
  const value = jar.get(NONCE_COOKIE)?.value;
  if (!value) throw new Error("Login challenge expired");
  jar.delete(NONCE_COOKIE);
  let challenge: ReturnType<typeof createChallenge>;
  try {
    challenge = JSON.parse(Buffer.from(value, "base64url").toString("utf-8"));
  } catch {
    throw new Error("Invalid challenge encoding");
  }
  if (!isAddress(wallet) || challenge.wallet !== wallet.toLowerCase() ||
      challenge.message !== message || challenge.origin !== origin ||
      !/^[0-9a-f]{32}$/.test(challenge.nonce) ||
      !Number.isFinite(Date.parse(challenge.createdAt)) ||
      Date.parse(challenge.createdAt) > Date.now() + 30_000 ||
      Date.now() - Date.parse(challenge.createdAt) > 600_000) {
    throw new Error("Login challenge does not match");
  }
  const signer = await recoverMessageAddress({ message, signature });
  if (signer.toLowerCase() !== wallet.toLowerCase()) throw new Error("Invalid wallet signature");
  const sql = database();
  const nonceDigest = createHash("sha256").update(challenge.nonce).digest("hex");
  const messageDigest = createHash("sha256").update(message).digest("hex");
  const consumed = await sql`update auth_challenges set consumed_at=now()
    where nonce_digest=${nonceDigest} and wallet=${wallet.toLowerCase()}
      and message_digest=${messageDigest} and origin=${origin}
      and consumed_at is null and expires_at>now() returning nonce_digest`;
  if (!consumed.length) throw new Error("Login challenge expired, unissued or already consumed");
  const token = await new SignJWT({ wallet: wallet.toLowerCase(), role: "user" })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(secretKey());
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 7 * 86400,
  });
  return { wallet: wallet.toLowerCase() };
}

export async function walletSession(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return typeof payload.wallet === "string" && isAddress(payload.wallet) ? payload.wallet : null;
  } catch {
    return null;
  }
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(NONCE_COOKIE);
}

export function hashKey(key: string) {
  const pepper = process.env.AGENT_API_KEY_PEPPER;
  if (!pepper || pepper.length < 32) throw new Error("AGENT_API_KEY_PEPPER is not configured.");
  return createHash("sha256").update(pepper).update(":").update(key).digest("hex");
}

export function newAgentKey() {
  return "cvra_" + randomBytes(32).toString("base64url");
}
