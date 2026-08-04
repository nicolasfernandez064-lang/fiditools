import { getRequiredEnv } from "@/lib/env";
import { readSession, writeSession, type MeliSession } from "@/lib/session";

const API_BASE = "https://api.mercadolibre.com";

interface TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in: number;
  scope?: string;
  user_id: number;
  refresh_token: string;
}

export class MeliApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.name = "MeliApiError";
    this.status = status;
    this.details = details;
  }
}

async function tokenRequest(body: Record<string, string>) {
  const response = await fetch(`${API_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(body),
    cache: "no-store"
  });

  const data = (await response.json().catch(() => ({}))) as Partial<TokenResponse> & {
    error?: string;
    error_description?: string;
    message?: string;
  };

  if (!response.ok || !data.access_token || !data.refresh_token || !data.user_id) {
    throw new MeliApiError(
      data.error_description || data.message || data.error || "No se pudo obtener el token de Mercado Libre.",
      response.status,
      data
    );
  }

  return data as TokenResponse;
}

function normalizeToken(data: TokenResponse): MeliSession {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    userId: data.user_id,
    scope: data.scope || "",
    expiresAt: Date.now() + Number(data.expires_in || 0) * 1000
  };
}

export async function exchangeAuthorizationCode(code: string) {
  const data = await tokenRequest({
    grant_type: "authorization_code",
    client_id: getRequiredEnv("MELI_CLIENT_ID"),
    client_secret: getRequiredEnv("MELI_CLIENT_SECRET"),
    code,
    redirect_uri: getRequiredEnv("MELI_REDIRECT_URI")
  });
  return normalizeToken(data);
}

export async function refreshMeliSession(session: MeliSession) {
  const data = await tokenRequest({
    grant_type: "refresh_token",
    client_id: getRequiredEnv("MELI_CLIENT_ID"),
    client_secret: getRequiredEnv("MELI_CLIENT_SECRET"),
    refresh_token: session.refreshToken
  });
  const renewed = normalizeToken(data);
  await writeSession(renewed);
  return renewed;
}

export async function getValidMeliSession() {
  const session = await readSession();
  if (!session?.accessToken) return null;

  // Mercado Libre rota el refresh token. Renovamos solo cerca del vencimiento.
  if (session.expiresAt <= Date.now() + 2 * 60 * 1000) {
    return refreshMeliSession(session);
  }

  return session;
}

export async function meliFetch<T>(path: string, session: MeliSession, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${session.accessToken}`,
      ...(init.headers || {})
    },
    cache: "no-store"
  });

  const data = (await response.json().catch(() => null)) as T | { message?: string; error?: string } | null;
  if (!response.ok) {
    const detail = data as { message?: string; error?: string } | null;
    throw new MeliApiError(
      detail?.message || detail?.error || `Mercado Libre respondió ${response.status}.`,
      response.status,
      data
    );
  }

  return data as T;
}
