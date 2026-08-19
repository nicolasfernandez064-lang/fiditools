export interface PublicationCostHistoryEntry {
  cost: number;
  costUsd?: number;
  exchangeRate?: number;
  ivaNonRecoverable: number;
  changedAt: string;
}

export interface PublicationCostRecord {
  itemId: string;
  cost: number;
  costUsd?: number;
  exchangeRate?: number;
  supplier: string;
  ivaNonRecoverable: number;
  notes: string;
  updatedAt: string;
  history: PublicationCostHistoryEntry[];
}

export type PublicationCostMap = Record<string, PublicationCostRecord>;

export interface PublicationCostState {
  costs: PublicationCostMap;
  usdRate: number;
}

const PREFIX = "fiditools:publication-costs";
const FX_PREFIX = "fiditools:usd-rate";

function storageKey(sellerId: number) {
  return `${PREFIX}:${sellerId}`;
}

function fxStorageKey(sellerId: number) {
  return `${FX_PREFIX}:${sellerId}`;
}

export function readPublicationCosts(sellerId: number): PublicationCostMap {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(storageKey(sellerId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PublicationCostMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function readUsdRate(sellerId: number) {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(fxStorageKey(sellerId));
  const value = Number(raw || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function cacheUsdRate(sellerId: number, value: number) {
  if (typeof window === "undefined") return 0;
  const normalized = Number(value || 0);
  if (!Number.isFinite(normalized) || normalized <= 0) return 0;
  window.localStorage.setItem(fxStorageKey(sellerId), String(normalized));
  return normalized;
}

export function cachePublicationCost(sellerId: number, record: PublicationCostRecord) {
  if (typeof window === "undefined") return record;
  const all = readPublicationCosts(sellerId);
  all[record.itemId] = record;
  window.localStorage.setItem(storageKey(sellerId), JSON.stringify(all));
  return record;
}

export function removeCachedPublicationCost(sellerId: number, itemId: string) {
  if (typeof window === "undefined") return;
  const all = readPublicationCosts(sellerId);
  delete all[itemId];
  window.localStorage.setItem(storageKey(sellerId), JSON.stringify(all));
}

export function currentCostArs(record: PublicationCostRecord | undefined, usdRate: number) {
  if (!record) return 0;
  const usd = Number(record.costUsd || 0);
  if (usd > 0 && usdRate > 0) return usd * usdRate;
  return Number(record.cost || 0);
}

async function apiRequest<T>(body?: unknown, method = "GET") {
  const response = await fetch("/api/publication-costs", {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store"
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "No se pudo acceder a la base de datos.");
  }
  return payload;
}

export async function fetchPublicationCostState(): Promise<PublicationCostState> {
  const payload = await apiRequest<{ costs: PublicationCostMap; usdRate: number }>();
  return {
    costs: payload.costs || {},
    usdRate: Number(payload.usdRate || 0)
  };
}

export async function saveUsdRateRemote(sellerId: number, usdRate: number) {
  const payload = await apiRequest<{ usdRate: number }>(
    { action: "save-usd-rate", usdRate },
    "POST"
  );
  const saved = Number(payload.usdRate || usdRate);
  cacheUsdRate(sellerId, saved);
  return saved;
}

export async function savePublicationCostRemote({
  sellerId,
  itemId,
  title,
  sku,
  costUsd,
  costArs,
  costMode = "usd",
  usdRate,
  supplier,
  ivaNonRecoverable,
  notes
}: {
  sellerId: number;
  itemId: string;
  title: string;
  sku?: string | null;
  costUsd?: number;
  costArs?: number;
  costMode?: "usd" | "ars";
  usdRate: number;
  supplier: string;
  ivaNonRecoverable: number;
  notes: string;
}) {
  const payload = await apiRequest<{ record: PublicationCostRecord }>(
    {
      action: "save-cost",
      itemId,
      title,
      sku,
      costUsd: Number(costUsd || 0),
      costArs: Number(costArs || 0),
      costMode,
      usdRate,
      supplier,
      ivaNonRecoverable,
      notes
    },
    "POST"
  );
  if (!payload.record) throw new Error("La base de datos no devolvió el costo guardado.");
  cachePublicationCost(sellerId, payload.record);
  return payload.record;
}

export async function deletePublicationCostRemote(sellerId: number, itemId: string) {
  await apiRequest({ action: "delete-cost", itemId }, "POST");
  removeCachedPublicationCost(sellerId, itemId);
}
