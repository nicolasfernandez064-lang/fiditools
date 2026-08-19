"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Archive,
  Box,
  Boxes,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleDollarSign,
  Download,
  ExternalLink,
  History,
  ImageOff,
  LoaderCircle,
  PackageCheck,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Store,
  Trash2,
  X
} from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  currentCostArs,
  readPublicationCosts,
  readUsdRate,
  removePublicationCost,
  writePublicationCost,
  writeUsdRate,
  type PublicationCostMap,
  type PublicationCostRecord
} from "@/lib/publication-costs";
import type { MeliPublication, MeliPublicationsResponse } from "@/types/meli";

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0
});
const integer = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" });

const STATUS_OPTIONS = [
  { value: "active", label: "Activas" },
  { value: "paused", label: "Pausadas" },
  { value: "closed", label: "Finalizadas" }
] as const;

const COST_OPTIONS = [
  { value: "all", label: "Todos los costos" },
  { value: "with", label: "Con costo" },
  { value: "without", label: "Sin costo" }
] as const;

type LoadState =
  | { status: "loading"; data: null; error: string }
  | { status: "disconnected"; data: null; error: string }
  | { status: "error"; data: null; error: string }
  | { status: "connected"; data: MeliPublicationsResponse; error: string };

type CostFilter = (typeof COST_OPTIONS)[number]["value"];

export function Publications() {
  const [status, setStatus] = useState("active");
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(50);
  const [query, setQuery] = useState("");
  const [costFilter, setCostFilter] = useState<CostFilter>("all");
  const [state, setState] = useState<LoadState>({ status: "loading", data: null, error: "" });
  const [costs, setCosts] = useState<PublicationCostMap>({});
  const [usdRate, setUsdRate] = useState(0);
  const [usdRateDraft, setUsdRateDraft] = useState("");
  const [selected, setSelected] = useState<MeliPublication | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading", data: null, error: "" });

    try {
      const params = new URLSearchParams({
        status,
        offset: String(offset),
        limit: String(limit)
      });
      const response = await fetch(`/api/meli/publications?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as MeliPublicationsResponse;

      if (response.status === 401 || !payload.connected) {
        setState({
          status: "disconnected",
          data: null,
          error: payload.error || "Conectá Mercado Libre para ver tus publicaciones."
        });
        return;
      }

      if (!response.ok || !payload.results) {
        throw new Error(payload.error || "No se pudieron cargar las publicaciones.");
      }

      setCosts(readPublicationCosts(payload.sellerId));
      const storedUsdRate = readUsdRate(payload.sellerId);
      setUsdRate(storedUsdRate);
      setUsdRateDraft(storedUsdRate ? String(storedUsdRate) : "");
      setState({ status: "connected", data: payload, error: "" });
    } catch (error) {
      setState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Error inesperado."
      });
    }
  }, [limit, offset, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const publications = state.status === "connected" ? state.data.results : [];
  const sellerId = state.status === "connected" ? state.data.sellerId : 0;

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es");

    return publications.filter((publication) => {
      const cost = costs[publication.id];
      const hasCost = currentCostArs(cost, usdRate) > 0;
      const matchesCost = costFilter === "all" || (costFilter === "with" ? hasCost : !hasCost);
      if (!matchesCost) return false;
      if (!normalizedQuery) return true;

      return [publication.title, publication.id, publication.sellerSku || ""]
        .join(" ")
        .toLocaleLowerCase("es")
        .includes(normalizedQuery);
    });
  }, [costFilter, costs, publications, query, usdRate]);

  const visibleSummary = useMemo(() => {
    return publications.reduce(
      (acc, publication) => {
        acc.stock += publication.availableQuantity;
        acc.sold += publication.soldQuantity;
        if (currentCostArs(costs[publication.id], usdRate) <= 0) acc.withoutCost += 1;
        return acc;
      },
      { stock: 0, sold: 0, withoutCost: 0 }
    );
  }, [costs, publications, usdRate]);

  const paging = state.status === "connected" ? state.data.paging : { total: 0, offset, limit };
  const page = Math.floor(paging.offset / paging.limit) + 1;
  const totalPages = Math.max(1, Math.ceil(paging.total / paging.limit));
  const canGoBack = paging.offset > 0;
  const canGoNext = paging.offset + paging.limit < paging.total;

  function updateCost(record: PublicationCostRecord | null, itemId: string) {
    setCosts((current) => {
      const next = { ...current };
      if (record) next[itemId] = record;
      else delete next[itemId];
      return next;
    });
  }

  function changeStatus(nextStatus: string) {
    setStatus(nextStatus);
    setOffset(0);
  }

  function changeLimit(nextLimit: number) {
    setLimit(nextLimit);
    setOffset(0);
  }

  function saveUsdRate() {
    if (!sellerId) return;
    const parsed = parseArgentineNumber(usdRateDraft);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const saved = writeUsdRate(sellerId, parsed);
    if (saved) {
      setUsdRate(saved);
      setUsdRateDraft(String(saved));
    }
  }

  function exportVisibleCsv() {
    if (!filtered.length) return;

    const rows = [
      ["ID", "Producto", "SKU", "Estado", "Precio", "Stock", "Vendidos", "Costo USD", "USD/ARS", "Costo ARS", "IVA NR", "Proveedor", "Margen antes de ML"],
      ...filtered.map((publication) => {
        const cost = costs[publication.id];
        return [
          publication.id,
          publication.title,
          publication.sellerSku || "",
          publication.status,
          publication.price,
          publication.availableQuantity,
          publication.soldQuantity,
          cost?.costUsd || 0,
          usdRate || cost?.exchangeRate || 0,
          currentCostArs(cost, usdRate),
          cost?.ivaNonRecoverable || 0,
          cost?.supplier || "",
          marginBeforeMeli(publication.price, cost, usdRate)
        ];
      })
    ];

    const csv = rows.map((row) => row.map(csvCell).join(";")).join("\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `fiditools-publicaciones-${status}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title="Publicaciones"
        description="Publicaciones reales de Mercado Libre, costos propios y una primera lectura de margen por producto."
        actions={
          state.status === "connected" ? (
            <>
              <Button variant="secondary" onClick={() => void load()}>
                <RefreshCw /> Actualizar
              </Button>
              <Button variant="outline" onClick={exportVisibleCsv} disabled={!filtered.length}>
                <Download /> Exportar CSV
              </Button>
            </>
          ) : undefined
        }
      />

      {state.status === "loading" ? <LoadingState /> : null}
      {state.status === "disconnected" ? <DisconnectedState message={state.error} /> : null}
      {state.status === "error" ? <ErrorState message={state.error} retry={() => void load()} /> : null}

      {state.status === "connected" ? (
        <>
          <div className="mb-5 rounded-2xl border border-amber-400/[0.16] bg-amber-500/[0.055] p-4 text-sm text-amber-100/90">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" />
              <div>
                <strong className="font-semibold text-amber-200">Primera versión de costos.</strong>{" "}
                Los costos se guardan en este navegador. La próxima etapa los migra a una base de datos para usarlos desde cualquier dispositivo y conservarlos por empresa.
              </div>
            </div>
          </div>

          <UsdRatePanel
            value={usdRateDraft}
            activeRate={usdRate}
            onChange={setUsdRateDraft}
            onSave={saveUsdRate}
          />

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              icon={<PackageCheck />}
              label="Publicaciones del filtro"
              value={integer.format(paging.total)}
              detail={`${statusLabel(status)} en Mercado Libre`}
            />
            <SummaryCard
              icon={<Boxes />}
              label="Stock visible"
              value={integer.format(visibleSummary.stock)}
              detail={`${publications.length} publicaciones cargadas`}
            />
            <SummaryCard
              icon={<Box />}
              label="Unidades vendidas"
              value={integer.format(visibleSummary.sold)}
              detail="Acumulado informado por las publicaciones visibles"
            />
            <SummaryCard
              icon={<CircleDollarSign />}
              label="Sin costo cargado"
              value={integer.format(visibleSummary.withoutCost)}
              detail="En la página actual"
              warning={visibleSummary.withoutCost > 0}
            />
          </section>

          <Card className="mt-5">
            <CardHeader className="gap-4 border-b border-white/[0.08]">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <CardTitle>Catálogo de Mercado Libre</CardTitle>
                  <CardDescription>La información comercial viene de Mercado Libre; el costo y los datos internos los administra FidiTools.</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{filtered.length} visibles</Badge>
                  <Badge className="border-violet-400/[0.15] bg-violet-500/[0.08] text-violet-200">
                    Página {page} de {totalPages}
                  </Badge>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(280px,1fr)_180px_180px_130px]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-600" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar por producto, ID o SKU"
                    className="pl-9"
                  />
                </label>

                <Select value={status} onChange={(value) => changeStatus(value)} ariaLabel="Estado de la publicación">
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>

                <Select value={costFilter} onChange={(value) => setCostFilter(value as CostFilter)} ariaLabel="Estado del costo">
                  {COST_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>

                <Select value={String(limit)} onChange={(value) => changeLimit(Number(value))} ariaLabel="Resultados por página">
                  <option value="25">25 por página</option>
                  <option value="50">50 por página</option>
                  <option value="100">100 por página</option>
                </Select>
              </div>
            </CardHeader>

            <CardContent className="p-0 sm:p-0">
              {filtered.length === 0 ? (
                <EmptyState hasPublications={publications.length > 0} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1280px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.08] text-[11px] uppercase tracking-[0.12em] text-slate-600">
                        <th className="px-5 py-4 sm:px-6">Producto</th>
                        <th className="px-4 py-4">SKU / ID</th>
                        <th className="px-4 py-4 text-right">Precio</th>
                        <th className="px-4 py-4 text-right">Stock</th>
                        <th className="px-4 py-4 text-right">Vendidos</th>
                        <th className="px-4 py-4 text-right">Costo USD</th>
                        <th className="px-4 py-4 text-right">Costo ARS</th>
                        <th className="px-4 py-4 text-right">Margen antes de ML</th>
                        <th className="px-5 py-4 text-right sm:px-6">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((publication) => (
                        <PublicationRow
                          key={publication.id}
                          publication={publication}
                          cost={costs[publication.id]}
                          sellerId={sellerId}
                          usdRate={usdRate}
                          onCostSave={(record) => updateCost(record, publication.id)}
                          onEdit={() => setSelected(publication)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-col gap-3 border-t border-white/[0.08] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p className="text-xs text-slate-600">
                  Mostrando {paging.total === 0 ? 0 : paging.offset + 1}–{Math.min(paging.offset + publications.length, paging.total)} de {integer.format(paging.total)}.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canGoBack}
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                  >
                    <ChevronLeft /> Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canGoNext}
                    onClick={() => setOffset(offset + limit)}
                  >
                    Siguiente <ChevronRight />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      {selected && sellerId ? (
        <CostEditor
          publication={selected}
          sellerId={sellerId}
          current={costs[selected.id]}
          usdRate={usdRate}
          onClose={() => setSelected(null)}
          onSave={(record) => {
            updateCost(record, selected.id);
            setSelected(null);
          }}
          onDelete={() => {
            removePublicationCost(sellerId, selected.id);
            updateCost(null, selected.id);
            setSelected(null);
          }}
        />
      ) : null}
    </>
  );
}

function UsdRatePanel({
  value,
  activeRate,
  onChange,
  onSave
}: {
  value: string;
  activeRate: number;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <Card className="mb-5 overflow-hidden border-cyan-400/[0.14]">
      <CardContent className="p-0 sm:p-0">
        <div className="flex flex-col gap-4 bg-gradient-to-r from-cyan-500/[0.08] via-blue-500/[0.06] to-violet-500/[0.08] p-5 lg:flex-row lg:items-center lg:justify-between sm:p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-300">Cotización global</p>
            <h3 className="mt-1 text-lg font-black text-white">USD → ARS</h3>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
              Cambiá este valor una sola vez y FidiTools pesifica automáticamente todos los costos cargados en USD.
            </p>
          </div>
          <div className="flex w-full max-w-md items-end gap-2">
            <Field label="Valor del USD">
              <Input
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onSave();
                }}
                inputMode="decimal"
                placeholder="Ej.: 1570"
              />
            </Field>
            <Button onClick={onSave} className="mb-0 h-11 shrink-0"><Save /> Aplicar</Button>
          </div>
        </div>
        {activeRate ? (
          <div className="border-t border-white/[0.06] px-5 py-3 text-xs text-slate-500 sm:px-6">
            Cotización activa: <strong className="text-cyan-200">$ {integer.format(activeRate)} por USD</strong>. Los costos ARS y márgenes de toda la tabla usan este valor.
          </div>
        ) : (
          <div className="border-t border-amber-400/[0.10] bg-amber-500/[0.04] px-5 py-3 text-xs text-amber-200 sm:px-6">
            Cargá una cotización para empezar a ingresar costos en USD.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QuickUsdCost({
  publication,
  sellerId,
  usdRate,
  current,
  onSave
}: {
  publication: MeliPublication;
  sellerId: number;
  usdRate: number;
  current?: PublicationCostRecord;
  onSave: (record: PublicationCostRecord) => void;
}) {
  const [value, setValue] = useState(current?.costUsd ? String(current.costUsd) : "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(current?.costUsd ? String(current.costUsd) : "");
  }, [current?.costUsd]);

  function save() {
    const parsed = parseArgentineNumber(value);
    if (!usdRate || !Number.isFinite(parsed) || parsed <= 0) return;
    if (Number(current?.costUsd || 0) === parsed) return;

    setSaving(true);
    const saved = writePublicationCost(
      sellerId,
      {
        itemId: publication.id,
        costUsd: parsed,
        exchangeRate: usdRate,
        supplier: current?.supplier || "",
        ivaNonRecoverable: Number(current?.ivaNonRecoverable || 0),
        notes: current?.notes || ""
      },
      current
    );
    if (saved) onSave(saved);
    setSaving(false);
  }

  return (
    <div className="ml-auto w-[116px]">
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-600">USD</span>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          disabled={!usdRate || saving}
          inputMode="decimal"
          placeholder={usdRate ? "0" : "USD?"}
          className="h-9 w-full rounded-lg border border-white/[0.10] bg-slate-950/[0.65] pl-9 pr-2 text-right text-xs font-bold text-slate-100 outline-none transition placeholder:text-slate-700 focus:border-cyan-400/[0.55] focus:ring-2 focus:ring-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-45"
          title={!usdRate ? "Primero cargá la cotización USD/ARS" : "Editá y presioná Enter o hacé clic afuera para guardar"}
        />
      </div>
      {current?.costUsd ? <span className="mt-1 block text-[10px] text-slate-700">Enter para guardar</span> : null}
    </div>
  );
}

function PublicationRow({
  publication,
  cost,
  sellerId,
  usdRate,
  onCostSave,
  onEdit
}: {
  publication: MeliPublication;
  cost?: PublicationCostRecord;
  sellerId: number;
  usdRate: number;
  onCostSave: (record: PublicationCostRecord) => void;
  onEdit: () => void;
}) {
  const costArs = currentCostArs(cost, usdRate);
  const margin = marginBeforeMeli(publication.price, cost, usdRate);
  const hasCost = costArs > 0;

  return (
    <tr className="border-b border-white/[0.06] text-slate-300 last:border-0 hover:bg-white/[0.025]">
      <td className="px-5 py-4 sm:px-6">
        <div className="flex min-w-[300px] items-center gap-3">
          <PublicationImage publication={publication} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="block max-w-[360px] truncate font-semibold text-slate-100">{publication.title}</span>
              {publication.catalogListing ? (
                <Badge className="shrink-0 border-cyan-400/[0.15] bg-cyan-500/[0.08] text-[10px] text-cyan-200">Catálogo</Badge>
              ) : null}
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
              <StatusDot status={publication.status} /> {statusLabel(publication.status)}
              {publication.variationCount ? <span>· {publication.variationCount} variantes</span> : null}
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-4">
        <span className="block max-w-[180px] truncate text-xs font-semibold text-slate-300">{publication.sellerSku || "Sin SKU"}</span>
        <span className="mt-1 block font-mono text-[11px] text-slate-600">{publication.id}</span>
      </td>
      <td className="px-4 py-4 text-right font-bold text-white">{money.format(publication.price)}</td>
      <td className="px-4 py-4 text-right">
        <span className={publication.availableQuantity <= 2 ? "font-bold text-amber-300" : "text-slate-300"}>
          {integer.format(publication.availableQuantity)}
        </span>
      </td>
      <td className="px-4 py-4 text-right text-slate-400">{integer.format(publication.soldQuantity)}</td>
      <td className="px-4 py-4 text-right">
        <QuickUsdCost
          publication={publication}
          sellerId={sellerId}
          usdRate={usdRate}
          current={cost}
          onSave={onCostSave}
        />
      </td>
      <td className="px-4 py-4 text-right">
        {hasCost ? (
          <div>
            <span className="font-bold text-slate-100">{money.format(costArs)}</span>
            {cost?.ivaNonRecoverable ? <small className="mt-1 block text-[10px] text-slate-600">+ {money.format(cost.ivaNonRecoverable)} IVA NR</small> : null}
          </div>
        ) : (
          <span className="text-slate-700">—</span>
        )}
      </td>
      <td className="px-4 py-4 text-right">
        {hasCost ? (
          <span className={margin >= 20 ? "font-bold text-emerald-300" : margin >= 10 ? "font-bold text-amber-300" : "font-bold text-red-300"}>
            {formatPercent(margin)}
          </span>
        ) : (
          <span className="text-slate-700">—</span>
        )}
      </td>
      <td className="px-5 py-4 text-right sm:px-6">
        <div className="flex justify-end gap-2">
          {publication.permalink ? (
            <Button variant="ghost" size="icon" asChild title="Abrir en Mercado Libre">
              <a href={publication.permalink} target="_blank" rel="noreferrer">
                <ExternalLink />
              </a>
            </Button>
          ) : null}
          <Button variant={hasCost ? "outline" : "secondary"} size="sm" onClick={onEdit}>
            <Pencil /> {hasCost ? "Editar" : "Cargar costo"}
          </Button>
        </div>
      </td>
    </tr>
  );
}

function CostEditor({
  publication,
  sellerId,
  current,
  usdRate,
  onClose,
  onSave,
  onDelete
}: {
  publication: MeliPublication;
  sellerId: number;
  current?: PublicationCostRecord;
  usdRate: number;
  onClose: () => void;
  onSave: (record: PublicationCostRecord) => void;
  onDelete: () => void;
}) {
  const [costUsd, setCostUsd] = useState(current?.costUsd ? String(current.costUsd) : "");
  const [supplier, setSupplier] = useState(current?.supplier || "");
  const [ivaNonRecoverable, setIvaNonRecoverable] = useState(current?.ivaNonRecoverable ? String(current.ivaNonRecoverable) : "");
  const [notes, setNotes] = useState(current?.notes || "");
  const [error, setError] = useState("");

  const parsedCostUsd = parseArgentineNumber(costUsd);
  const parsedCost = parsedCostUsd > 0 && usdRate > 0 ? parsedCostUsd * usdRate : 0;
  const parsedIva = parseArgentineNumber(ivaNonRecoverable);
  const previewMargin = publication.price > 0 && parsedCost > 0
    ? ((publication.price - parsedCost - parsedIva) / publication.price) * 100
    : null;

  function submit() {
    if (!usdRate) {
      setError("Primero cargá la cotización USD/ARS en la parte superior de Publicaciones.");
      return;
    }
    if (!Number.isFinite(parsedCostUsd) || parsedCostUsd <= 0) {
      setError("Ingresá un costo en USD mayor a cero.");
      return;
    }
    if (!Number.isFinite(parsedIva) || parsedIva < 0) {
      setError("El IVA no recuperable no puede ser negativo.");
      return;
    }

    const saved = writePublicationCost(
      sellerId,
      {
        itemId: publication.id,
        costUsd: parsedCostUsd,
        exchangeRate: usdRate,
        supplier,
        ivaNonRecoverable: parsedIva,
        notes
      },
      current
    );

    if (!saved) {
      setError("No se pudo guardar el costo en este navegador.");
      return;
    }

    onSave(saved);
  }

  return (
    <div className="fixed inset-0 z-[70]">
      <button className="absolute inset-0 bg-black/[0.72] backdrop-blur-sm" onClick={onClose} aria-label="Cerrar editor" />
      <aside className="absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto border-l border-white/[0.10] bg-[#090d18] shadow-2xl shadow-black/60">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-white/[0.08] bg-[#090d18]/95 p-5 backdrop-blur-xl sm:p-6">
          <div className="pr-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-300">Costo de publicación</p>
            <h2 className="mt-2 text-xl font-black text-white">{publication.title}</h2>
            <p className="mt-1 font-mono text-xs text-slate-600">{publication.id}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <X />
          </Button>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <div className="grid grid-cols-3 gap-3">
            <MiniMetric label="Precio" value={money.format(publication.price)} />
            <MiniMetric label="Stock" value={integer.format(publication.availableQuantity)} />
            <MiniMetric label="Vendidos" value={integer.format(publication.soldQuantity)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Datos internos</CardTitle>
              <CardDescription>Mercado Libre no conoce estos datos. FidiTools los asocia a la publicación.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Costo del producto (USD)" required>
                <Input value={costUsd} onChange={(event) => setCostUsd(event.target.value)} inputMode="decimal" placeholder="Ej.: 161" />
                <p className="mt-2 text-xs text-slate-600">Cotización actual: {usdRate ? money.format(usdRate).replace("ARS", "").trim() : "sin cargar"} por USD · Costo pesificado: {parsedCost > 0 ? money.format(parsedCost) : "—"}</p>
              </Field>

              <Field label="Proveedor">
                <Input value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Ej.: MacPower" />
              </Field>

              <Field label="IVA no recuperable">
                <Input
                  value={ivaNonRecoverable}
                  onChange={(event) => setIvaNonRecoverable(event.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                />
              </Field>

              <Field label="Notas">
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={4}
                  placeholder="Lote, garantía, condición de compra u observaciones"
                  className="w-full resize-y rounded-xl border border-white/[0.10] bg-slate-950/[0.65] px-3 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-violet-400/[0.70] focus:ring-2 focus:ring-violet-500/15"
                />
              </Field>

              {error ? <p className="rounded-xl border border-red-400/[0.15] bg-red-500/[0.08] p-3 text-sm text-red-200">{error}</p> : null}
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardContent className="p-0 sm:p-0">
              <div className="bg-gradient-to-br from-violet-600/[0.20] via-blue-600/[0.12] to-cyan-500/[0.08] p-5 sm:p-6">
                <p className="text-xs font-semibold text-slate-400">Margen preliminar antes de comisión, cuotas, envío e impuestos</p>
                <strong className={`mt-2 block text-3xl font-black ${previewMargin === null ? "text-slate-500" : previewMargin >= 20 ? "text-emerald-300" : previewMargin >= 10 ? "text-amber-300" : "text-red-300"}`}>
                  {previewMargin === null ? "Cargá el costo" : formatPercent(previewMargin)}
                </strong>
                <p className="mt-2 text-xs leading-5 text-slate-500">Este indicador sirve como control rápido. La rentabilidad real se calculará con la comisión de cada venta, logística e impuestos.</p>
              </div>
            </CardContent>
          </Card>

          {current?.history?.length ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><History className="size-4 text-violet-300" /> Historial de costos</CardTitle>
                <CardDescription>Últimos cambios guardados para esta publicación.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {current.history.slice(0, 5).map((entry, index) => (
                  <div key={`${entry.changedAt}-${index}`} className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                    <div>
                      <strong className="text-sm text-slate-200">{entry.costUsd ? `USD ${formatUsd(entry.costUsd)}` : money.format(entry.cost)}</strong>
                      {entry.costUsd ? <p className="mt-1 text-xs text-slate-500">{money.format(entry.cost)}</p> : null}
                      {entry.ivaNonRecoverable ? <p className="mt-1 text-xs text-slate-600">IVA NR {money.format(entry.ivaNonRecoverable)}</p> : null}
                    </div>
                    <time className="text-xs text-slate-600">{safeDate(entry.changedAt)}</time>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-white/[0.08] bg-[#090d18]/95 p-5 backdrop-blur-xl sm:flex-row sm:justify-between sm:p-6">
          <div>
            {current ? (
              <Button variant="danger" onClick={onDelete}>
                <Trash2 /> Eliminar costo
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={submit}><Save /> Guardar costo</Button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function LoadingState() {
  return (
    <Card>
      <CardContent className="grid min-h-80 place-items-center">
        <div className="text-center">
          <LoaderCircle className="mx-auto size-9 animate-spin text-violet-300" />
          <p className="mt-3 text-sm text-slate-500">Consultando tus publicaciones en Mercado Libre…</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DisconnectedState({ message }: { message: string }) {
  return (
    <Card className="border-violet-400/[0.15]">
      <CardContent className="grid min-h-[420px] place-items-center p-8 text-center">
        <div className="max-w-xl">
          <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-violet-500/[0.10] text-violet-200"><Store className="size-8" /></span>
          <h2 className="mt-5 text-2xl font-black text-white">Conectá Mercado Libre</h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">Necesitamos una sesión activa para consultar las publicaciones de tu cuenta.</p>
          {message ? <p className="mt-3 text-xs text-amber-200">{message}</p> : null}
          <Button asChild className="mt-6"><a href="/api/auth/mercadolibre/login">Conectar Mercado Libre</a></Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return (
    <Card className="border-red-400/[0.15]">
      <CardContent className="grid min-h-80 place-items-center p-8 text-center">
        <div>
          <CircleAlert className="mx-auto size-9 text-red-300" />
          <h2 className="mt-3 text-lg font-bold text-white">No pudimos cargar las publicaciones</h2>
          <p className="mt-2 max-w-xl text-sm text-slate-400">{message}</p>
          <Button variant="secondary" className="mt-5" onClick={retry}><RefreshCw /> Reintentar</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ hasPublications }: { hasPublications: boolean }) {
  return (
    <div className="grid min-h-72 place-items-center p-8 text-center">
      <div>
        {hasPublications ? <Search className="mx-auto size-9 text-slate-600" /> : <Archive className="mx-auto size-9 text-slate-600" />}
        <h3 className="mt-3 font-bold text-slate-200">{hasPublications ? "No hay coincidencias" : "No hay publicaciones en este estado"}</h3>
        <p className="mt-2 text-sm text-slate-500">{hasPublications ? "Probá con otro texto o filtro de costo." : "Cambiá el estado para consultar otro grupo."}</p>
      </div>
    </div>
  );
}

function PublicationImage({ publication }: { publication: MeliPublication }) {
  return (
    <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.04]">
      {publication.thumbnail ? (
        // La miniatura proviene directamente de Mercado Libre y puede cambiar de dominio.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={publication.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <ImageOff className="size-5 text-slate-700" />
      )}
    </span>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  detail,
  warning = false
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  warning?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <span className={`grid size-10 place-items-center rounded-xl [&_svg]:size-4 ${warning ? "bg-amber-500/[0.10] text-amber-300" : "bg-violet-500/[0.10] text-violet-300"}`}>{icon}</span>
        <p className="mt-5 text-xs font-semibold text-slate-500">{label}</p>
        <strong className={`mt-1 block text-2xl font-black tracking-tight ${warning ? "text-amber-200" : "text-white"}`}>{value}</strong>
        <p className="mt-2 text-xs text-slate-600">{detail}</p>
      </CardContent>
    </Card>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">{label}</p>
      <strong className="mt-1 block truncate text-sm text-slate-200">{value}</strong>
    </div>
  );
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-slate-400">{label}{required ? <span className="ml-1 text-violet-300">*</span> : null}</span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  ariaLabel,
  children
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={ariaLabel}
      className="h-11 w-full rounded-xl border border-white/[0.10] bg-slate-950/[0.65] px-3 text-sm text-slate-100 outline-none transition focus:border-violet-400/[0.70] focus:ring-2 focus:ring-violet-500/15"
    >
      {children}
    </select>
  );
}

function StatusDot({ status }: { status: string }) {
  const className = status === "active" ? "bg-emerald-400" : status === "paused" ? "bg-amber-400" : "bg-slate-500";
  return <span className={`size-1.5 rounded-full ${className}`} />;
}

function marginBeforeMeli(price: number, cost: PublicationCostRecord | undefined, usdRate: number) {
  const ars = currentCostArs(cost, usdRate);
  if (!price || !ars) return 0;
  return ((price - ars - Number(cost?.ivaNonRecoverable || 0)) / price) * 100;
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)}%`;
}

function statusLabel(status: string) {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label || status;
}

function parseArgentineNumber(value: string) {
  const clean = value.trim().replace(/[$\s]/g, "").replace(/[^0-9,.-]/g, "");
  if (!clean) return 0;

  let normalized = clean;
  const hasComma = clean.includes(",");
  const hasDot = clean.includes(".");

  if (hasComma && hasDot) {
    normalized = clean.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    normalized = clean.replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(clean)) {
    normalized = clean.replace(/\./g, "");
  }

  const number = Number(normalized);
  return Number.isFinite(number) ? number : Number.NaN;
}

function safeDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : dateTime.format(parsed);
}

function csvCell(value: unknown) {
  const text = String(value ?? "").replace(/"/g, '""');
  return `"${text}"`;
}
