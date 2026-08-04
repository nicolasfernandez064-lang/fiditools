import { NextResponse } from "next/server";
import { getEnvironmentStatus } from "@/lib/env";

export const dynamic = "force-dynamic";

export function GET() {
  const environment = getEnvironmentStatus();
  return NextResponse.json({
    ok: Object.values(environment).every(Boolean),
    environment
  });
}
