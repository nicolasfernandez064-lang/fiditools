export interface PublicationCostHistoryEntry {
  cost: number;
  ivaNonRecoverable: number;
  changedAt: string;
}

export interface PublicationCostRecord {
  itemId: string;
  cost: number;
  supplier: string;
  ivaNonRecoverable: number;
  notes: string;
  updatedAt: string;
  history: PublicationCostHistoryEntry[];
}

export type PublicationCostMap = Record<string, PublicationCostRecord>;

const PREFIX = "fiditools:publication-costs";

function storageKey(sellerId: number) {
  return `${PREFIX}:${sellerId}`;
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

export function writePublicationCost(
  sellerId: number,
  input: Omit<PublicationCostRecord, "updatedAt" | "history">,
  current?: PublicationCostRecord
) {
  if (typeof window === "undefined") return null;

  const all = readPublicationCosts(sellerId);
  const changedAt = new Date().toISOString();
  const costChanged = Boolean(
    current &&
      (Number(current.cost) !== Number(input.cost) ||
        Number(current.ivaNonRecoverable) !== Number(input.ivaNonRecoverable))
  );

  const history = [...(current?.history || [])];
  if (costChanged && current) {
    history.unshift({
      cost: Number(current.cost || 0),
      ivaNonRecoverable: Number(current.ivaNonRecoverable || 0),
      changedAt: current.updatedAt || changedAt
    });
  }

  const next: PublicationCostRecord = {
    ...input,
    cost: Number(input.cost || 0),
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
