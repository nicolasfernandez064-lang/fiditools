import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/database";
import { clearSession } from "@/lib/session";
import { getValidMeliSession, meliFetch, MeliApiError } from "@/lib/meli";
import type { MeliOrder, MeliOrdersSearch, MeliUser } from "@/types/meli";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const MAX_ORDERS = 1000;
const DEFAULT_SHIPPING_ARS = 6600;
const DEFAULT_IIBB_RATE = 0.04;
const VAT_RATE = 0.21;
const VAT_FACTOR = VAT_RATE / (1 + VAT_RATE);

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

type ProductAggregate = {
  itemId: string;
  title: string;
  units: number;
  sales: number;
  fees: number;
  cost: number;
  ivaNonRecoverable: number;
  shipping: number;
  iibb: number;
  vatDebit: number;
  vatCreditMerchandise: number;
  vatCreditFees: number;
  vatCreditShipping: number;
  vatBalance: number;
  contribution: number;
  margin: number;
  hasCost: boolean;
};

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function boolValue(value: string | null, fallback: boolean) {
  if (value === null) return fallback;
  return value === "1" || value === "true" || value === "yes";
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

function vatFromGross(gross: number) {
  return gross > 0 ? gross * VAT_FACTOR : 0;
}

function iibbFromSales(grossSales: number, ivaEnabled: boolean, rate: number) {
  if (grossSales <= 0 || rate <= 0) return 0;
  const base = ivaEnabled ? grossSales / (1 + VAT_RATE) : grossSales;
  return base * rate;
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
    const ivaEnabled = boolValue(request.nextUrl.searchParams.get("iva"), true);
    const shippingPerOrder = Math.max(0, numberValue(request.nextUrl.searchParams.get("shipping") || DEFAULT_SHIPPING_ARS));
    const iibbRatePercent = Math.max(0, numberValue(request.nextUrl.searchParams.get("iibb") || DEFAULT_IIBB_RATE * 100));
    const iibbRate = iibbRatePercent / 100;

    if (from.getTime() > to.getTime()) {
      return NextResponse.json({ error: "La fecha desde no puede ser posterior a la fecha hasta." }, { status: 400 });
    }

    const user = await meliFetch<MeliUser>("/users/me", session);
    const { orders, total, capped } = await fetchOrders(user.id, startOfDayIso(from), endOfDayIso(to), session);

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

    let sales = 0;
    let units = 0;
    let fees = 0;
    let coveredUnits = 0;
    let coveredSales = 0;
    let coveredFees = 0;
    let merchandiseCost = 0;
    let ivaNonRecoverable = 0;
    let coveredShipping = 0;
    let coveredOrdersEquivalent = 0;
    const byProduct = new Map<string, ProductAggregate>();
    const missing = new Map<string, { itemId: string; title: string; units: number; sales: number }>();

    for (const order of orders) {
      sales += numberValue(order.total_amount);
      const orderDate = order.date_closed || order.date_created;
      const itemRows = order.order_items || [];
      const orderItemsSales = itemRows.reduce((sum, row) => sum + numberValue(row.unit_price) * Math.max(0, numberValue(row.quantity)), 0);

      const enrichedRows = itemRows.map((row) => {
        const itemId = String(row.item?.id || "");
        const quantity = Math.max(0, numberValue(row.quantity));
        const rowSales = numberValue(row.unit_price) * quantity;
        const rowFee = numberValue(row.sale_fee);
        const title = row.item?.title || itemId;
        const product = itemId ? productByItem.get(itemId) : undefined;
        const unitCost = historicalCostForDate(product, product ? historyByProduct.get(Number(product.id)) : undefined, orderDate);
        const hasCost = unitCost > 0;
        const rowCost = hasCost ? unitCost * quantity : 0;
        const rowIvaNonRecoverable = hasCost ? numberValue(product?.iva_nr) * quantity : 0;
        return { itemId, quantity, rowSales, rowFee, title, hasCost, rowCost, rowIvaNonRecoverable };
      });

      const coveredOrderSales = enrichedRows.filter((row) => row.hasCost).reduce((sum, row) => sum + row.rowSales, 0);
      const coverageRatio = orderItemsSales > 0 ? Math.min(1, coveredOrderSales / orderItemsSales) : 0;
      const orderCoveredShipping = shippingPerOrder * coverageRatio;
      coveredShipping += orderCoveredShipping;
      coveredOrdersEquivalent += coverageRatio;

      for (const row of enrichedRows) {
        if (!row.itemId) continue;
        units += row.quantity;
        fees += row.rowFee;

        const shippingShare = coveredOrderSales > 0 && row.hasCost
          ? orderCoveredShipping * (row.rowSales / coveredOrderSales)
          : 0;

        if (row.hasCost) {
          coveredUnits += row.quantity;
          coveredSales += row.rowSales;
          coveredFees += row.rowFee;
          merchandiseCost += row.rowCost;
          ivaNonRecoverable += row.rowIvaNonRecoverable;
        } else {
          const prior = missing.get(row.itemId) || { itemId: row.itemId, title: row.title, units: 0, sales: 0 };
          prior.units += row.quantity;
          prior.sales += row.rowSales;
          missing.set(row.itemId, prior);
        }

        const rowIibb = row.hasCost ? iibbFromSales(row.rowSales, ivaEnabled, iibbRate) : 0;
        const rowVatDebit = row.hasCost && ivaEnabled ? vatFromGross(row.rowSales) : 0;
        const rowVatCreditMerchandise = row.hasCost && ivaEnabled ? vatFromGross(row.rowCost) : 0;
        const rowVatCreditFees = row.hasCost && ivaEnabled ? vatFromGross(row.rowFee) : 0;
        const rowVatCreditShipping = row.hasCost && ivaEnabled ? vatFromGross(shippingShare) : 0;
        const rowVatBalance = ivaEnabled
          ? rowVatDebit - rowVatCreditMerchandise - rowVatCreditFees - rowVatCreditShipping
          : 0;
        const rowContribution = row.hasCost
          ? row.rowSales - row.rowFee - row.rowCost - row.rowIvaNonRecoverable - shippingShare - rowIibb - rowVatBalance
          : 0;

        const aggregate = byProduct.get(row.itemId) || {
          itemId: row.itemId,
          title: row.title,
          units: 0,
          sales: 0,
          fees: 0,
          cost: 0,
          ivaNonRecoverable: 0,
          shipping: 0,
          iibb: 0,
          vatDebit: 0,
          vatCreditMerchandise: 0,
          vatCreditFees: 0,
          vatCreditShipping: 0,
          vatBalance: 0,
          contribution: 0,
          margin: 0,
          hasCost: row.hasCost
        };
        aggregate.units += row.quantity;
        aggregate.sales += row.rowSales;
        aggregate.fees += row.rowFee;
        aggregate.cost += row.rowCost;
        aggregate.ivaNonRecoverable += row.rowIvaNonRecoverable;
        aggregate.shipping += shippingShare;
        aggregate.iibb += rowIibb;
        aggregate.vatDebit += rowVatDebit;
        aggregate.vatCreditMerchandise += rowVatCreditMerchandise;
        aggregate.vatCreditFees += rowVatCreditFees;
        aggregate.vatCreditShipping += rowVatCreditShipping;
        aggregate.vatBalance += rowVatBalance;
        aggregate.contribution += rowContribution;
        aggregate.hasCost = aggregate.hasCost || row.hasCost;
        byProduct.set(row.itemId, aggregate);
      }
    }

    const iibb = iibbFromSales(coveredSales, ivaEnabled, iibbRate);
    const vatDebit = ivaEnabled ? vatFromGross(coveredSales) : 0;
    const vatCreditMerchandise = ivaEnabled ? vatFromGross(merchandiseCost) : 0;
    const vatCreditFees = ivaEnabled ? vatFromGross(coveredFees) : 0;
    const vatCreditShipping = ivaEnabled ? vatFromGross(coveredShipping) : 0;
    const vatCredits = vatCreditMerchandise + vatCreditFees + vatCreditShipping;
    const vatBalance = ivaEnabled ? vatDebit - vatCredits : 0;
    const knownContribution = coveredSales - coveredFees - merchandiseCost - ivaNonRecoverable - coveredShipping - iibb - vatBalance;
    const coverage = units > 0 ? (coveredUnits / units) * 100 : 0;

    const productsReport = Array.from(byProduct.values())
      .map((row) => ({
        ...row,
        margin: row.hasCost && row.sales > 0 ? (row.contribution / row.sales) * 100 : 0
      }))
      .sort((a, b) => b.sales - a.sales);

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
      taxMode: ivaEnabled ? "ri" : "mono",
      assumptions: {
        ivaEnabled,
        ivaRate: VAT_RATE * 100,
        iibbRate: iibbRatePercent,
        shippingPerOrder,
        coveredOrdersEquivalent
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
        ivaNonRecoverable,
        shipping: coveredShipping,
        iibb,
        vatDebit,
        vatCreditMerchandise,
        vatCreditFees,
        vatCreditShipping,
        vatCredits,
        vatBalance,
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
        "El resultado usa solamente ventas con costo cargado.",
        "El IVA no recuperable cargado manualmente en Publicaciones se trata como un costo económico adicional y no genera crédito fiscal.",
        `Se imputa un envío de $${shippingPerOrder.toLocaleString("es-AR")} por orden pagada y se prorratea si una orden mezcla productos con y sin costo.`,
        ivaEnabled
          ? "Modo Responsable Inscripto: calcula IVA débito sobre ventas e IVA crédito sobre mercadería, comisión y envío, suponiendo importes IVA incluido al 21%."
          : "Modo Monotributo: no calcula IVA débito/crédito y aplica IIBB directamente sobre la venta bruta.",
        `IIBB se estima al ${iibbRatePercent.toFixed(2)}%.`,
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
