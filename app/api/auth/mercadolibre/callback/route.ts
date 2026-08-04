import { NextRequest, NextResponse } from "next/server";
import { exchangeAuthorizationCode } from "@/lib/meli";
import { consumeOAuthState, writeSession } from "@/lib/session";

export const runtime = "nodejs";

function dashboardRedirect(request: NextRequest, key: string, value: string) {
  const url = new URL("/dashboard", request.url);
  url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const error = request.nextUrl.searchParams.get("error");
  const errorDescription = request.nextUrl.searchParams.get("error_description");
  if (error) return dashboardRedirect(request, "meli_error", errorDescription || error);

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const validState = await consumeOAuthState(state);

  if (!validState) return dashboardRedirect(request, "meli_error", "La validación de seguridad OAuth no coincidió. Volvé a conectar la cuenta.");
  if (!code) return dashboardRedirect(request, "meli_error", "Mercado Libre no devolvió el código de autorización.");

  try {
    const session = await exchangeAuthorizationCode(code);
    await writeSession(session);
    return dashboardRedirect(request, "connected", "1");
  } catch (exchangeError) {
    const message = exchangeError instanceof Error ? exchangeError.message : "No se pudo completar la autorización.";
    return dashboardRedirect(request, "meli_error", message);
  }
}
