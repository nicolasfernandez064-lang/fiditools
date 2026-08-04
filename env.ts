import { NextRequest, NextResponse } from "next/server";
import { clearSession } from "@/lib/session";
import { getValidMeliSession, meliFetch, MeliApiError } from "@/lib/meli";
import type { MeliOrdersSearch, MeliUser } from "@/types/meli";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getValidMeliSession();
    if (!session) {
      return NextResponse.json({ connected: false, error: "La cuenta todavía no está conectada." }, { status: 401 });
    }

    const requestedLimit = Number(request.nextUrl.searchParams.get("limit") || 20);
    const limit = Math.min(50, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 20));
    const user = await meliFetch<MeliUser>("/users/me", session);

    const params = new URLSearchParams({
      seller: String(user.id),
      "order.status": "paid",
      sort: "date_desc",
      limit: String(limit)
    });
    const orders = await meliFetch<MeliOrdersSearch>(`/orders/search?${params.toString()}`, session);

    return NextResponse.json({
      connected: true,
      user: {
        id: user.id,
        nickname: user.nickname,
        site_id: user.site_id,
        first_name: user.first_name,
        last_name: user.last_name
      },
      orders
    });
  } catch (error) {
    if (error instanceof MeliApiError && error.status === 401) {
      await clearSession();
      return NextResponse.json({ connected: false, error: "Mercado Libre rechazó la sesión. Volvé a conectar la cuenta." }, { status: 401 });
    }

    const message = error instanceof Error ? error.message : "No se pudo consultar Mercado Libre.";
    return NextResponse.json({ connected: false, error: message }, { status: 500 });
  }
}
