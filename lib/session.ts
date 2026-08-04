import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

const SESSION_COOKIE = "fiditools_meli_session";
const STATE_COOKIE = "fiditools_meli_state";

export interface MeliSession {
  accessToken: string;
  refreshToken: string;
  userId: number;
  scope: string;
  expiresAt: number;
}

function getKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET debe tener al menos 32 caracteres.");
  }
  return createHash("sha256").update(secret).digest();
}

function encode(value: Buffer) {
  return value.toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url");
}

export function sealSession(payload: MeliSession) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${encode(iv)}.${encode(tag)}.${encode(encrypted)}`;
}

export function unsealSession(value: string): MeliSession | null {
  try {
    const [ivValue, tagValue, encryptedValue] = value.split(".");
    if (!ivValue || !tagValue || !encryptedValue) return null;
    const decipher = createDecipheriv("aes-256-gcm", getKey(), decode(ivValue));
    decipher.setAuthTag(decode(tagValue));
    const clear = Buffer.concat([decipher.update(decode(encryptedValue)), decipher.final()]).toString("utf8");
    return JSON.parse(clear) as MeliSession;
  } catch {
    return null;
  }
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge
  };
}

export async function readSession() {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  return raw ? unsealSession(raw) : null;
}

export async function writeSession(session: MeliSession) {
  const store = await cookies();
  store.set(SESSION_COOKIE, sealSession(session), cookieOptions(60 * 60 * 24 * 180));
}

export async function clearSession() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", cookieOptions(0));
}

export async function writeOAuthState(state: string) {
  const store = await cookies();
  store.set(STATE_COOKIE, state, cookieOptions(60 * 10));
}

export async function consumeOAuthState(receivedState: string | null) {
  const store = await cookies();
  const expectedState = store.get(STATE_COOKIE)?.value;
  store.set(STATE_COOKIE, "", cookieOptions(0));
  return Boolean(expectedState && receivedState && expectedState === receivedState);
}
