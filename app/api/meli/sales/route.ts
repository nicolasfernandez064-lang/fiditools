import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/database";
import { clearSession } from "@/lib/session";
import { getValidMeliSession, meliFetch, MeliApiError } from "@/lib/meli";
import type { MeliOrder, MeliOrdersSearch, MeliUser } from "@/types/meli";
import { coreProfitability, numberValue } from "@/lib/profitability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_PAGE_SIZE = 50;
const MAX_ORDERS = 1000;

type CostRow = {
  id: number;
  meli_item_id: string;
  title: string;
  current_cost_ars: number;
  current_cost_usd: number;
  current_usd_rate: number;
  iva_nr: number;
  updated_at: string;
};

type HistoryRow = {
  product_id: number;
  cost_ars: number;
  cost_usd: number;
  usd_rate: number;
  created_at: string;
};

function normalizeDate(input: string | null, fallback: Date) {
  if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return fallback;
  const parsed = new Date(`${input}T12:00:00-03:00`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function startOfDayIso(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T00:00:00.000-03:00`;
}

function endOfDayIso(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T23:59:59.999-03:00`;
}

function historicalCostForDate(product: CostRow | undefined, history: HistoryRow[] | undefined, orderDate?: string) {
  if (!product) return { costArs: 0, costUsd: 0, usdRate: 0, source: "missing" as const };

  const current = {
    costArs: numberValue(product.current_cost_ars),
    costUsd: numberValue(product.current_cost_usd),
    usdRate: numberValue(product.current_usd_rate),
    source: "current" as const
  };

  if (!orderDate) return current;
  const orderTimestamp = new Date(orderDate).getTime();
  if (!Number.isFinite(orderTimestamp)) return current;

  const rows = [...(history || [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const nextChange = rows.find((entry) => new Date(entry.created_at).getTime() > orderTimestamp);
  if (!nextChange) return current;

  return {
    costArs: numberValue(nextChange.cost_ars),
    costUsd: numberValue(nextChange.cost_usd),
    usdRate: numberValue(nextChange.usd_rate),
    source: "history" as const
  };
}

async function fetchOrders(
  sellerId: number,
  fromIso: string,
  toIso: string,
  status: string,
  session: NonNullable<Awaited<ReturnType<typeof getValidMeliSession>>>
) {
  const orders: MeliOrder[] = [];
  let offset = 0;
  let total = 0;

  while (orders.length < MAX_ORDERS) {
    const params = new URLSearchParams({
      seller: String(sellerId),
      "order.date_created.from": fromIso,
      "order.date_created.to": toIso,
      sort: "date_desc",
      limit: String(API_PAGE_SIZE),
      offset: String(offset)
    });
    if (status && status !== "all") params.set("order.status", status);

    const page = await meliFetch<MeliOrdersSearch>(`/orders/search?${params.toString()}`, session);
    const results = page.results || [];
    total = numberValue(page.paging?.total);
    orders.push(...results);

    if (results.length < API_PAGE_SIZE || orders.length >= total) break;
    offset += API_PAGE_SIZE;
  }

  return { orders: orders.slice(0, MAX_ORDERS), total, capped: total > MAX_ORDERS };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getValidMeliSession();
    if (!session) {
      return NextResponse.json({ connected: false, error: "La cuenta todavía no está conectada." }, { status: 401 });
    }

    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 29);
    const from = normalizeDate(request.nextUrl.searchParams.get("from"), defaultFrom);
    const to = normalizeDate(request.nextUrl.searchParams.get("to"), now);
    const status = request.nextUrl.searchParams.get("status") || "paid";

    if (from.getTime() > to.getTime()) {
      return NextResponse.json({ error: "La fecha desde no puede ser posterior a la fecha hasta." }, { status: 400 });
    }

    const user = await meliFetch<MeliUser>("/users/me", session);
    const fetched = await fetchOrders(user.id, startOfDayIso(from), endOfDayIso(to), status, session);

    const sql = getSql();
    const sellerId = String(user.id);
    const products = (await sql`
      SELECT id, meli_item_id, title, current_cost_ars, current_cost_usd,
             current_usd_rate, iva_nr, updated_at
      FROM products
      WHERE seller_id = ${sellerId}
    `) as unknown as CostRow[];

    const historyRows = (await sql`
      SELECT h.product_id, h.cost_ars, h.cost_usd, h.usd_rate, h.created_at
      FROM product_cost_history h
      INNER JOIN products p ON p.id = h.product_id
      WHERE p.seller_id = ${sellerId}
      ORDER BY h.created_at ASC
    `) as unknown as HistoryRow[];

    const productByItem = new Map(products.map((row) => [String(row.meli_item_id), row]));
    const historyByProduct = new Map<number, HistoryRow[]>();
    for (const row of historyRows) {
      const bucket = historyByProduct.get(Number(row.product_id)) || [];
      bucket.push(row);
      historyByProduct.set(Number(row.product_id), bucket);
    }

    const rows = fetched.orders.flatMap((order) => {
      const orderDate = order.date_closed || order.date_created || "";
      return (order.order_items || []).map((item, index) => {
        const itemId = String(item.item?.id || "");
        const quantity = Math.max(0, numberValue(item.quantity));
        const unitPrice = numberValue(item.unit_price);
        const sale = unitPrice * quantity;
        const fee = numberValue(item.sale_fee);
        const product = productByItem.get(itemId);
        const cost = historicalCostForDate(product, product ? historyByProduct.get(Number(product.id)) : undefined, orderDate);
        const hasCost = cost.costArs > 0;
        const merchandiseCost = hasCost ? cost.costArs * quantity : 0;
        const unitIvaNonRecoverable = hasCost ? numberValue(product?.iva_nr) : 0;
        const ivaNonRecoverable = unitIvaNonRecoverable * quantity;
        const profitability = hasCost
          ? coreProfitability({ sales: sale, fees: fee, merchandiseCost, ivaNonRecoverable })
          : null;
        const knownResult = profitability?.result ?? 0;
        const margin = profitability?.margin ?? 0;

        return {
          rowId: `${order.id}-${itemId}-${index}`,
          orderId: order.id,
          date: orderDate,
          status: order.status || "",
          buyerNickname: order.buyer?.nickname || "",
          itemId,
          sku: item.item?.seller_sku || "",
          title: item.item?.title || itemId || "Producto",
          quantity,
          unitPrice,
          sale,
          fee,
          costUsd: cost.costUsd,
          usdRate: cost.usdRate,
          unitCostArs: cost.costArs,
          merchandiseCost,
          unitIvaNonRecoverable,
          ivaNonRecoverable,
          knownResult,
          margin,
          hasCost,
          costSource: cost.source
        };
      });
    });

    const summary = rows.reduce(
      (acc, row) => {
        acc.sales += row.sale;
        acc.units += row.quantity;
        acc.fees += row.fee;
        if (row.hasCost) {
          acc.coveredSales += row.sale;
          acc.coveredUnits += row.quantity;
          acc.merchandiseCost += row.merchandiseCost;
          acc.ivaNonRecoverable += row.ivaNonRecoverable;
          acc.knownResult += row.knownResult;
        }
        return acc;
      },
      { sales: 0, units: 0, fees: 0, coveredSales: 0, coveredUnits: 0, merchandiseCost: 0, ivaNonRecoverable: 0, knownResult: 0 }
    );

    return NextResponse.json({
      connected: true,
      user: { id: user.id, nickname: user.nickname, site_id: user.site_id },
      period: { from: request.nextUrl.searchParams.get("from") || startOfDayIso(from).slice(0, 10), to: request.nextUrl.searchParams.get("to") || endOfDayIso(to).slice(0, 10) },
      filter: { status },
      summary: {
        ...summary,
        orders: fetched.orders.length,
        knownMargin: summary.coveredSales > 0 ? (summary.knownResult / summary.coveredSales) * 100 : 0,
        coverage: summary.units > 0 ? (summary.coveredUnits / summary.units) * 100 : 0
      },
      rows,
      paging: { apiTotal: fetched.total, scannedOrders: fetched.orders.length, capped: fetched.capped }
    });
  } catch (error) {
    if (error instanceof MeliApiError && error.status === 401) {
      await clearSession();
      return NextResponse.json({ connected: false, error: "Mercado Libre rechazó la sesión. Volvé a conectar la cuenta." }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : "No se pudieron cargar las ventas.";
    return NextResponse.json({ connected: true, error: message }, { status: 500 });
  }
}
