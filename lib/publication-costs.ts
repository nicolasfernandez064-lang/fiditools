export interface PublicationCostHistoryEntry {
  cost: number;
  costUsd?: number;
  exchangeRate?: number;
  ivaNonRecoverable: number;
  changedAt: string;
}

export interface PublicationCostRecord {
  itemId: string;
  /** Legacy/current ARS snapshot kept for backwards compatibility. */
  cost: number;
  /** Source cost entered by the user. New FidiTools flow uses USD. */
  costUsd?: number;
  /** USD/ARS rate that was active when this cost was last edited. */
  exchangeRate?: number;
  supplier: string;
  ivaNonRecoverable: number;
  notes: string;
  updatedAt: string;
  history: PublicationCostHistoryEntry[];
}

export type PublicationCostMap = Record<string, PublicationCostRecord>;

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

export function writeUsdRate(sellerId: number, value: number) {
  if (typeof window === "undefined") return 0;
  const normalized = Number(value || 0);
  if (!Number.isFinite(normalized) || normalized <= 0) return 0;
  window.localStorage.setItem(fxStorageKey(sellerId), String(normalized));
  return normalized;
}

export function currentCostArs(record: PublicationCostRecord | undefined, usdRate: number) {
  if (!record) return 0;
  const usd = Number(record.costUsd || 0);
  if (usd > 0 && usdRate > 0) return usd * usdRate;
  return Number(record.cost || 0);
}

export function writePublicationCost(
  sellerId: number,
  input: Omit<PublicationCostRecord, "updatedAt" | "history" | "cost"> & { cost?: number },
  current?: PublicationCostRecord
) {
  if (typeof window === "undefined") return null;

  const all = readPublicationCosts(sellerId);
  const changedAt = new Date().toISOString();
  const nextUsd = Number(input.costUsd || 0);
  const nextFx = Number(input.exchangeRate || 0);
  const nextArs = nextUsd > 0 && nextFx > 0 ? nextUsd * nextFx : Number(input.cost || 0);

  const costChanged = Boolean(
    current &&
      (Number(current.costUsd || 0) !== nextUsd ||
        Number(current.cost || 0) !== nextArs ||
        Number(current.ivaNonRecoverable) !== Number(input.ivaNonRecoverable))
  );

  const history = [...(current?.history || [])];
  if (costChanged && current) {
    history.unshift({
      cost: Number(current.cost || 0),
      costUsd: Number(current.costUsd || 0) || undefined,
      exchangeRate: Number(current.exchangeRate || 0) || undefined,
      ivaNonRecoverable: Number(current.ivaNonRecoverable || 0),
      changedAt: current.updatedAt || changedAt
    });
  }

  const next: PublicationCostRecord = {
    ...input,
    cost: nextArs,
    costUsd: nextUsd || undefined,
    exchangeRate: nextFx || undefined,
    ivaNonRecoverable: Number(input.ivaNonRecoverable || 0),
    supplier: input.supplier.trim(),
    notes: input.notes.trim(),
    updatedAt: changedAt,
    history: history.slice(0, 30)
  };

  all[input.itemId] = next;
  window.localStorage.setItem(storageKey(sellerId), JSON.stringify(all));
  return next;
}

export function removePublicationCost(sellerId: number, itemId: string) {
  if (typeof window === "undefined") return;
  const all = readPublicationCosts(sellerId);
  delete all[itemId];
  window.localStorage.setItem(storageKey(sellerId), JSON.stringify(all));
}
