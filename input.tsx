import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getRequiredEnv } from "@/lib/env";
import { writeOAuthState } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const state = randomBytes(24).toString("hex");
    await writeOAuthState(state);

    const url = new URL("https://auth.mercadolibre.com.ar/authorization");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", getRequiredEnv("MELI_CLIENT_ID"));
    url.searchParams.set("redirect_uri", getRequiredEnv("MELI_REDIRECT_URI"));
    url.searchParams.set("state", state);

    return NextResponse.redirect(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo iniciar la conexión.";
    const redirect = new URL("/dashboard", request.url);
    redirect.searchParams.set("meli_error", message);
    return NextResponse.redirect(redirect);
  }
}
