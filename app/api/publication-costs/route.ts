import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/database";
import { getValidMeliSession } from "@/lib/meli";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SaveCostPayload = {
  action: "save-cost";
  itemId: string;
  title: string;
  sku?: string | null;
  costUsd: number;
  usdRate: number;
  supplier?: string;
  ivaNonRecoverable?: number;
  notes?: string;
};

type SaveUsdPayload = {
  action: "save-usd-rate";
  usdRate: number;
};

type DeleteCostPayload = {
  action: "delete-cost";
  itemId: string;
};

type Payload = SaveCostPayload | SaveUsdPayload | DeleteCostPayload;

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRow(row: Record<string, unknown>, history: Record<string, unknown>[] = []) {
  return {
    itemId: String(row.meli_item_id || ""),
    cost: numberValue(row.current_cost_ars),
    costUsd: numberValue(row.current_cost_usd) || undefined,
    exchangeRate: numberValue(row.current_usd_rate) || undefined,
    supplier: String(row.supplier || ""),
    ivaNonRecoverable: numberValue(row.iva_nr),
    notes: String(row.notes || ""),
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : new Date().toISOString(),
    history: history.map((entry) => ({
      cost: numberValue(entry.cost_ars),
      costUsd: numberValue(entry.cost_usd) || undefined,
      exchangeRate: numberValue(entry.usd_rate) || undefined,
      ivaNonRecoverable: 0,
      changedAt: entry.created_at ? new Date(String(entry.created_at)).toISOString() : new Date().toISOString()
    }))
  };
}

async function requireSession() {
  const session = await getValidMeliSession();
  if (!session) return null;
  return session;
}

export async function GET() {
  try {
    const session = await requireSession();
    if (!session) {
      return NextResponse.json({ connected: false, error: "La cuenta de Mercado Libre no está conectada." }, { status: 401 });
    }

    const sellerId = String(session.userId);
    const sql = getSql();

    const products = (await sql`
      SELECT id, seller_id, meli_item_id, sku, title, supplier,
             current_cost_usd, current_usd_rate, current_cost_ars,
             iva_nr, notes, created_at, updated_at
      FROM products
      WHERE seller_id = ${sellerId}
      ORDER BY updated_at DESC
    `) as Record<string, unknown>[];

    const historyRows = (await sql`
      SELECT h.id, h.product_id, h.cost_usd, h.usd_rate, h.cost_ars, h.created_at
      FROM product_cost_history h
      INNER JOIN products p ON p.id = h.product_id
      WHERE p.seller_id = ${sellerId}
      ORDER BY h.created_at DESC
    `) as Record<string, unknown>[];

    const historyByProduct = new Map<string, Record<string, unknown>[]>();
    for (const row of historyRows) {
      const key = String(row.product_id || "");
      const current = historyByProduct.get(key) || [];
      if (current.length < 30) current.push(row);
      historyByProduct.set(key, current);
    }

    const costs: Record<string, ReturnType<typeof normalizeRow>> = {};
    for (const row of products) {
      const itemId = String(row.meli_item_id || "");
      if (!itemId) continue;
      costs[itemId] = normalizeRow(row, historyByProduct.get(String(row.id || "")) || []);
    }

    const settings = (await sql`
      SELECT usd_rate
      FROM settings
      WHERE seller_id = ${sellerId}
      LIMIT 1
    `) as Record<string, unknown>[];

    return NextResponse.json({
      connected: true,
      sellerId: session.userId,
      usdRate: numberValue(settings[0]?.usd_rate),
      costs
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudieron leer los costos.";
    return NextResponse.json({ connected: true, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) {
      return NextResponse.json({ connected: false, error: "La cuenta de Mercado Libre no está conectada." }, { status: 401 });
    }

    const payload = (await request.json()) as Payload;
    const sellerId = String(session.userId);
    const sql = getSql();

    if (payload.action === "save-usd-rate") {
      const usdRate = numberValue(payload.usdRate);
      if (usdRate <= 0) {
        return NextResponse.json({ error: "La cotización debe ser mayor a cero." }, { status: 400 });
      }

      await sql`
        INSERT INTO settings (seller_id, usd_rate, updated_at)
        VALUES (${sellerId}, ${usdRate}, NOW())
        ON CONFLICT (seller_id)
        DO UPDATE SET usd_rate = EXCLUDED.usd_rate, updated_at = NOW()
      `;

      return NextResponse.json({ ok: true, usdRate });
    }

    if (payload.action === "delete-cost") {
      if (!payload.itemId) {
        return NextResponse.json({ error: "Falta el ID de la publicación." }, { status: 400 });
      }
      await sql`
        DELETE FROM products
        WHERE seller_id = ${sellerId} AND meli_item_id = ${payload.itemId}
      `;
      return NextResponse.json({ ok: true });
    }

    if (payload.action === "save-cost") {
      const itemId = String(payload.itemId || "").trim();
      const title = String(payload.title || "").trim() || "Publicación Mercado Libre";
      const costUsd = numberValue(payload.costUsd);
      const usdRate = numberValue(payload.usdRate);
      const costArs = costUsd * usdRate;
      const ivaNr = Math.max(0, numberValue(payload.ivaNonRecoverable));
      const supplier = String(payload.supplier || "").trim();
      const notes = String(payload.notes || "").trim();
      const sku = payload.sku ? String(payload.sku).trim() : null;

      if (!itemId || costUsd <= 0 || usdRate <= 0) {
        return NextResponse.json({ error: "Publicación, costo USD y cotización son obligatorios." }, { status: 400 });
      }

      const existing = (await sql`
        SELECT id, current_cost_usd, current_usd_rate, current_cost_ars, iva_nr
        FROM products
        WHERE seller_id = ${sellerId} AND meli_item_id = ${itemId}
        LIMIT 1
      `) as Record<string, unknown>[];

      if (existing[0]) {
        const previous = existing[0];
        const changed =
          numberValue(previous.current_cost_usd) !== costUsd ||
          numberValue(previous.current_usd_rate) !== usdRate ||
          numberValue(previous.current_cost_ars) !== costArs;

        if (changed) {
          await sql`
            INSERT INTO product_cost_history (product_id, cost_usd, usd_rate, cost_ars, created_at)
            VALUES (
              ${numberValue(previous.id)},
              ${numberValue(previous.current_cost_usd)},
              ${numberValue(previous.current_usd_rate)},
              ${numberValue(previous.current_cost_ars)},
              NOW()
            )
          `;
        }
      }

      const savedRows = (await sql`
        INSERT INTO products (
          seller_id, meli_item_id, sku, title, supplier,
          current_cost_usd, current_usd_rate, current_cost_ars,
          iva_nr, notes, created_at, updated_at
        ) VALUES (
          ${sellerId}, ${itemId}, ${sku}, ${title}, ${supplier},
          ${costUsd}, ${usdRate}, ${costArs},
          ${ivaNr}, ${notes}, NOW(), NOW()
        )
        ON CONFLICT (seller_id, meli_item_id)
        DO UPDATE SET
          sku = EXCLUDED.sku,
          title = EXCLUDED.title,
          supplier = EXCLUDED.supplier,
          current_cost_usd = EXCLUDED.current_cost_usd,
          current_usd_rate = EXCLUDED.current_usd_rate,
          current_cost_ars = EXCLUDED.current_cost_ars,
          iva_nr = EXCLUDED.iva_nr,
          notes = EXCLUDED.notes,
          updated_at = NOW()
        RETURNING id, seller_id, meli_item_id, sku, title, supplier,
                  current_cost_usd, current_usd_rate, current_cost_ars,
                  iva_nr, notes, created_at, updated_at
      `) as Record<string, unknown>[];

      const productId = numberValue(savedRows[0]?.id);
      const history = productId
        ? ((await sql`
            SELECT cost_usd, usd_rate, cost_ars, created_at
            FROM product_cost_history
            WHERE product_id = ${productId}
            ORDER BY created_at DESC
            LIMIT 30
          `) as Record<string, unknown>[])
        : [];

      return NextResponse.json({ ok: true, record: normalizeRow(savedRows[0], history) });
    }

    return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo guardar el costo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
