import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/database";
import { clearSession } from "@/lib/session";
import { getValidMeliSession, meliFetch, MeliApiError } from "@/lib/meli";
import type { MeliOrder, MeliOrdersSearch, MeliUser } from "@/types/meli";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const MAX_ORDERS = 1000;

type CostRow = {
  id: number;
  meli_item_id: string;
  title: string;
  current_cost_ars: number;
  current_cost_usd: number;
  current_usd_rate: number;
  updated_at: string;
};

type HistoryRow = {
  product_id: number;
  cost_ars: number;
  cost_usd: number;
  usd_rate: number;
  created_at: string;
};

type ProductAggregate = {
  itemId: string;
  title: string;
  units: number;
  sales: number;
  fees: number;
  cost: number;
  contribution: number;
  margin: number;
  hasCost: boolean;
};

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDate(input: string | null, fallback: Date) {
  if (!input) return fallback;
  const match = /^\d{4}-\d{2}-\d{2}$/.test(input);
  if (!match) return fallback;
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
  return `${yyyy}-${mm}-${dd}T23:00:00.000-03:00`;
}

function historicalCostForDate(
  product: CostRow | undefined,
  history: HistoryRow[] | undefined,
  orderDate: string | undefined
) {
  if (!product) return 0;
  if (!orderDate) return numberValue(product.current_cost_ars);
  const orderTimestamp = new Date(orderDate).getTime();
  if (!Number.isFinite(orderTimestamp)) return numberValue(product.current_cost_ars);

  const rows = [...(history || [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const nextChange = rows.find((entry) => new Date(entry.created_at).getTime() > orderTimestamp);
  return nextChange ? numberValue(nextChange.cost_ars) : numberValue(product.current_cost_ars);
}

async function fetchOrders(
  sellerId: number,
  fromIso: string,
  toIso: string,
  session: Awaited<ReturnType<typeof getValidMeliSession>>
) {
  if (!session) return { orders: [] as MeliOrder[], total: 0, capped: false };

  const orders: MeliOrder[] = [];
  let offset = 0;
  let total = 0;

  while (orders.length < MAX_ORDERS) {
    const params = new URLSearchParams({
      seller: String(sellerId),
      "order.status": "paid",
      "order.date_created.from": fromIso,
      "order.date_created.to": toIso,
      sort: "date_desc",
      limit: String(PAGE_SIZE),
      offset: String(offset)
    });

    const page = await meliFetch<MeliOrdersSearch>(`/orders/search?${params.toString()}`, session);
    const results = page.results || [];
    total = numberValue(page.paging?.total);
    orders.push(...results);

    if (results.length < PAGE_SIZE || orders.length >= total) break;
    offset += PAGE_SIZE;
  }

  return {
    orders: orders.slice(0, MAX_ORDERS),
    total,
    capped: total > MAX_ORDERS
  };
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

    if (from.getTime() > to.getTime()) {
      return NextResponse.json({ error: "La fecha desde no puede ser posterior a la fecha hasta." }, { status: 400 });
    }

    const user = await meliFetch<MeliUser>("/users/me", session);
    const { orders, total, capped } = await fetchOrders(user.id, startOfDayIso(from), endOfDayIso(to), session);

    const sql = getSql();
    const sellerId = String(user.id);

    const products = (await sql`
      SELECT id, meli_item_id, title, current_cost_ars, current_cost_usd,
             current_usd_rate, updated_at
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

    let sales = 0;
    let units = 0;
    let fees = 0;
    let coveredUnits = 0;
    let coveredSales = 0;
    let coveredFees = 0;
    let merchandiseCost = 0;
    const byProduct = new Map<string, ProductAggregate>();
    const missing = new Map<string, { itemId: string; title: string; units: number; sales: number }>();

    for (const order of orders) {
      sales += numberValue(order.total_amount);
      const orderDate = order.date_closed || order.date_created;

      for (const row of order.order_items || []) {
        const itemId = String(row.item?.id || "");
        if (!itemId) continue;
        const quantity = Math.max(0, numberValue(row.quantity));
        const rowSales = numberValue(row.unit_price) * quantity;
        const rowFee = numberValue(row.sale_fee);
        const title = row.item?.title || itemId;
        units += quantity;
        fees += rowFee;

        const product = productByItem.get(itemId);
        const unitCost = historicalCostForDate(product, product ? historyByProduct.get(Number(product.id)) : undefined, orderDate);
        const hasCost = unitCost > 0;
        const rowCost = hasCost ? unitCost * quantity : 0;

        if (hasCost) {
          coveredUnits += quantity;
          coveredSales += rowSales;
          coveredFees += rowFee;
          merchandiseCost += rowCost;
        } else {
          const prior = missing.get(itemId) || { itemId, title, units: 0, sales: 0 };
          prior.units += quantity;
          prior.sales += rowSales;
          missing.set(itemId, prior);
        }

        const aggregate = byProduct.get(itemId) || {
          itemId,
          title,
          units: 0,
          sales: 0,
          fees: 0,
          cost: 0,
          contribution: 0,
          margin: 0,
          hasCost
        };
        aggregate.units += quantity;
        aggregate.sales += rowSales;
        aggregate.fees += rowFee;
        aggregate.cost += rowCost;
        aggregate.hasCost = aggregate.hasCost || hasCost;
        byProduct.set(itemId, aggregate);
      }
    }

    const productsReport = Array.from(byProduct.values())
      .map((row) => {
        const contribution = row.hasCost ? row.sales - row.fees - row.cost : 0;
        return {
          ...row,
          contribution,
          margin: row.hasCost && row.sales > 0 ? (contribution / row.sales) * 100 : 0
        };
      })
      .sort((a, b) => b.sales - a.sales);

    const knownContribution = coveredSales - coveredFees - merchandiseCost;
    const coverage = units > 0 ? (coveredUnits / units) * 100 : 0;

    return NextResponse.json({
      connected: true,
      user: {
        id: user.id,
        nickname: user.nickname,
        site_id: user.site_id
      },
      period: {
        from: request.nextUrl.searchParams.get("from") || startOfDayIso(from).slice(0, 10),
        to: request.nextUrl.searchParams.get("to") || endOfDayIso(to).slice(0, 10)
      },
      summary: {
        sales,
        orders: orders.length,
        units,
        fees,
        coveredUnits,
        coveredSales,
        coveredFees,
        merchandiseCost,
        knownContribution,
        knownMargin: coveredSales > 0 ? (knownContribution / coveredSales) * 100 : 0,
        coverage
      },
      products: productsReport,
      missingCosts: Array.from(missing.values()).sort((a, b) => b.sales - a.sales),
      paging: {
        apiTotal: total,
        scanned: orders.length,
        capped
      },
      notes: [
        "El resultado conocido usa solamente ventas con costo cargado.",
        "Todavía no descuenta envíos, IIBB, percepciones ni efecto neto de IVA.",
        "Para ventas anteriores a un cambio de costo, FidiTools intenta usar el costo histórico vigente en esa fecha."
      ]
    });
  } catch (error) {
    if (error instanceof MeliApiError && error.status === 401) {
      await clearSession();
      return NextResponse.json({ connected: false, error: "Mercado Libre rechazó la sesión. Volvé a conectar la cuenta." }, { status: 401 });
    }

    const message = error instanceof Error ? error.message : "No se pudo generar el reporte.";
    return NextResponse.json({ connected: true, error: message }, { status: 500 });
  }
}
