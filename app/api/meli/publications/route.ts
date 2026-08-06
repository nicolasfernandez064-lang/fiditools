import { NextRequest, NextResponse } from "next/server";
import { getValidMeliSession, MeliApiError, meliFetch } from "@/lib/meli";
import type {
  MeliItem,
  MeliItemAttribute,
  MeliItemVariation,
  MeliItemsSearch,
  MeliMultiGetItem,
  MeliPublication
} from "@/types/meli";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = new Set(["active", "paused", "closed"]);
const ITEM_ATTRIBUTES = [
  "id",
  "title",
  "price",
  "currency_id",
  "available_quantity",
  "sold_quantity",
  "status",
  "thumbnail",
  "secure_thumbnail",
  "permalink",
  "listing_type_id",
  "catalog_listing",
  "seller_custom_field",
  "attributes",
  "variations",
  "last_updated"
].join(",");

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function chunk<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function attributeValue(attributes: MeliItemAttribute[] | undefined, id: string) {
  return attributes?.find((attribute) => attribute.id === id)?.value_name?.trim() || null;
}

function variationSku(variations: MeliItemVariation[] | undefined) {
  const values = new Set<string>();

  for (const variation of variations || []) {
    const value =
      variation.seller_custom_field?.trim() ||
      attributeValue(variation.attributes, "SELLER_SKU");
    if (value) values.add(value);
  }

  if (values.size === 1) return [...values][0];
  if (values.size > 1) return `${values.size} SKU de variantes`;
  return null;
}

function normalizeImage(value: string | undefined) {
  if (!value) return "";
  return value.replace(/^http:\/\//i, "https://");
}

function normalizeItem(item: MeliItem): MeliPublication | null {
  if (!item.id) return null;

  const sellerSku =
    item.seller_custom_field?.trim() ||
    attributeValue(item.attributes, "SELLER_SKU") ||
    variationSku(item.variations);

  return {
    id: item.id,
    title: item.title || "Publicación sin título",
    price: Number(item.price || 0),
    currencyId: item.currency_id || "ARS",
    availableQuantity: Number(item.available_quantity || 0),
    soldQuantity: Number(item.sold_quantity || 0),
    status: item.status || "unknown",
    thumbnail: normalizeImage(item.secure_thumbnail || item.thumbnail),
    permalink: item.permalink || "",
    sellerSku,
    variationCount: item.variations?.length || 0,
    listingTypeId: item.listing_type_id || "",
    catalogListing: Boolean(item.catalog_listing),
    lastUpdated: item.last_updated || null
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getValidMeliSession();
    if (!session) {
      return NextResponse.json(
        { connected: false, error: "La cuenta de Mercado Libre no está conectada." },
        { status: 401 }
      );
    }

    const statusParam = request.nextUrl.searchParams.get("status") || "active";
    const status = ALLOWED_STATUSES.has(statusParam) ? statusParam : "active";
    const offset = clamp(Number(request.nextUrl.searchParams.get("offset") || 0) || 0, 0, 100_000);
    const limit = clamp(Number(request.nextUrl.searchParams.get("limit") || 50) || 50, 10, 100);

    const search = await meliFetch<MeliItemsSearch>(
      `/users/${session.userId}/items/search?status=${encodeURIComponent(status)}&offset=${offset}&limit=${limit}`,
      session
    );

    const ids = search.results || [];
    const batches = chunk(ids, 20);
    const responses = await Promise.all(
      batches.map((batch) =>
        meliFetch<MeliMultiGetItem[]>(
          `/items?ids=${encodeURIComponent(batch.join(","))}&attributes=${encodeURIComponent(ITEM_ATTRIBUTES)}`,
          session
        )
      )
    );

    const byId = new Map<string, MeliPublication>();
    for (const row of responses.flat()) {
      if (row.code && row.code >= 400) continue;
      const normalized = row.body ? normalizeItem(row.body) : null;
      if (normalized) byId.set(normalized.id, normalized);
    }

    const results = ids.map((id) => byId.get(id)).filter((item): item is MeliPublication => Boolean(item));

    return NextResponse.json({
      connected: true,
      sellerId: session.userId,
      status,
      paging: {
        total: Number(search.paging?.total || results.length),
        offset: Number(search.paging?.offset ?? offset),
        limit: Number(search.paging?.limit ?? limit)
      },
      results
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudieron cargar las publicaciones.";
    const status = error instanceof MeliApiError ? error.status : 500;
    return NextResponse.json({ connected: true, error: message }, { status });
  }
}
