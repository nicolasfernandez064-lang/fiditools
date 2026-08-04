import { NextRequest, NextResponse } from "next/server";
import { clearSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  await clearSession();
  return NextResponse.redirect(new URL("/dashboard", request.url), { status: 303 });
}
