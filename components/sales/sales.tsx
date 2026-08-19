"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  FileSpreadsheet,
  Filter,
  LoaderCircle,
  PackageSearch,
  Percent,
  RefreshCw,
  Search,
  ShoppingBag,
  WalletCards
} from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const integer = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dateTime = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

type SaleRow = {
  rowId: string;
  orderId: number;
  date: string;
  status: string;
  buyerNickname: string;
  itemId: string;
  sku: string;
  title: string;
  quantity: number;
  unitPrice: number;
  sale: number;
  fee: number;
  costUsd: number;
  usdRate: number;
  unitCostArs: number;
  merchandiseCost: number;
  unitIvaNonRecoverable: number;
  ivaNonRecoverable: number;
  knownResult: number;
  margin: number;
  hasCost: boolean;
  costSource: "current" | "history" | "missing";
};

type Payload = {
  connected?: boolean;
  user?: { id: number; nickname: string; site_id: string };
  period?: { from: string; to: string };
  summary?: {
    sales: number;
    units: number;
    fees: number;
    coveredSales: number;
    coveredUnits: number;
    merchandiseCost: number;
    ivaNonRecoverable: number;
    knownResult: number;
    orders: number;
    knownMargin: number;
    coverage: number;
  };
  rows?: SaleRow[];
  paging?: { apiTotal: number; scannedOrders: number; capped: boolean };
  error?: string;
};

type LoadState = "loading" | "ready" | "error" | "disconnected";

function formatDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function defaultPeriod() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return { from: formatDate(from), to: formatDate(to) };
}

function csvEscape(value: string | number) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function Sales() {
  const defaults = useMemo(() => defaultPeriod(), []);
  const didInitialLoad = useRef(false);
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [status, setStatus] = useState("paid");
  const [query, setQuery] = useState("");
  const [costFilter, setCostFilter] = useState("all");
  const [marginFilter, setMarginFilter] = useState("all");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [state, setState] = useState<{ status: LoadState; data: Payload | null; error: string }>({ status: "loading", data: null, error: "" });

  const load = useCallback(async (nextFrom = from, nextTo = to, nextStatus = status) => {
    setState((current) => ({ status: "loading", data: current.data, error: "" }));
    try {
      const params = new URLSearchParams({ from: nextFrom, to: nextTo, status: nextStatus });
      const response = await fetch(`/api/meli/sales?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as Payload;
      if (response.status === 401 || payload.connected === false) {
        setState({ status: "disconnected", data: null, error: payload.error || "Conectá Mercado Libre para ver las ventas." });
        return;
      }
      if (!response.ok || !payload.summary) throw new Error(payload.error || "No se pudieron cargar las ventas.");
      setState({ status: "ready", data: payload, error: "" });
      setPage(1);
    } catch (error) {
      setState({ status: "error", data: null, error: error instanceof Error ? error.message : "Error inesperado." });
    }
  }, [from, to, status]);

  useEffect(() => {
    if (didInitialLoad.current) return;
    didInitialLoad.current = true;
    void load(defaults.from, defaults.to, "paid");
  }, [defaults.from, defaults.to, load]);

  const rows = state.data?.rows || [];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (needle && ![row.title, row.itemId, row.sku, String(row.orderId), row.buyerNickname].some((value) => value.toLowerCase().includes(needle))) return false;
      if (costFilter === "with" && !row.hasCost) return false;
      if (costFilter === "without" && row.hasCost) return false;
      if (marginFilter === "loss" && (!row.hasCost || row.knownResult >= 0)) return false;
      if (marginFilter === "low" && (!row.hasCost || row.margin >= 10 || row.knownResult < 0)) return false;
      if (marginFilter === "healthy" && (!row.hasCost || row.margin < 10)) return false;
      return true;
    });
  }, [rows, query, costFilter, marginFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const summary = state.data?.summary;

  const setPreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    const nextFrom = formatDate(start);
    const nextTo = formatDate(end);
    setFrom(nextFrom);
    setTo(nextTo);
    void load(nextFrom, nextTo, status);
  };

  const setCurrentMonth = () => {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    const nextFrom = formatDate(start);
    const nextTo = formatDate(end);
    setFrom(nextFrom);
    setTo(nextTo);
    void load(nextFrom, nextTo, status);
  };

  const exportCsv = () => {
    if (!filtered.length) return;
    const data = [
      ["Fecha", "Orden", "Estado", "Producto", "MLA", "SKU", "Unidades", "Venta", "Comisión", "Costo USD", "USD/ARS", "Costo ARS", "IVA no recuperable", "Resultado conocido", "Margen %"],
      ...filtered.map((row) => [row.date, row.orderId, row.status, row.title, row.itemId, row.sku, row.quantity, row.sale, row.fee, row.costUsd, row.usdRate, row.merchandiseCost, row.ivaNonRecoverable, row.knownResult, row.margin.toFixed(2)])
    ];
    const csv = data.map((line) => line.map(csvEscape).join(";")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fiditools-ventas-${from}-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        eyebrow="Operaciones"
        title="Ventas"
        description="Ventas reales de Mercado Libre cruzadas con costos de FidiTools para analizar cada operación, detectar pérdidas y encontrar productos sin costo cargado."
        actions={(
          <>
            <Button variant="secondary" onClick={() => void load()} disabled={state.status === "loading"}><RefreshCw />Actualizar</Button>
            <Button variant="secondary" onClick={exportCsv} disabled={!filtered.length}><FileSpreadsheet />Exportar CSV</Button>
          </>
        )}
      />

      <Card className="mb-5">
        <CardContent className="p-4 sm:p-5">
          <div className="grid gap-3 xl:grid-cols-[1fr_auto] xl:items-end">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(250px,1fr)_155px_155px_160px]">
              <label className="space-y-1.5 text-xs font-semibold text-slate-400">
                Buscar
                <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-600" /><Input className="pl-9" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Producto, SKU, MLA u orden..." /></div>
              </label>
              <label className="space-y-1.5 text-xs font-semibold text-slate-400">Desde<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
              <label className="space-y-1.5 text-xs font-semibold text-slate-400">Hasta<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
              <label className="space-y-1.5 text-xs font-semibold text-slate-400">Estado<select className="h-10 w-full rounded-md border border-white/[0.08] bg-slate-950 px-3 text-sm text-slate-200" value={status} onChange={(e) => setStatus(e.target.value)}><option value="paid">Pagadas</option><option value="all">Todos los estados</option></select></label>
            </div>
            <Button onClick={() => void load(from, to, status)} disabled={state.status === "loading"}><Filter />Aplicar filtros</Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPreset(7)}>7 días</Button>
            <Button variant="secondary" size="sm" onClick={() => setPreset(30)}>30 días</Button>
            <Button variant="secondary" size="sm" onClick={setCurrentMonth}>Este mes</Button>
          </div>
        </CardContent>
      </Card>

      {state.status === "loading" && !state.data ? <Loading /> : null}
      {state.status === "disconnected" ? <Message title="Mercado Libre no está conectado" detail={state.error} /> : null}
      {state.status === "error" ? <Message title="No pudimos cargar las ventas" detail={state.error} /> : null}

      {summary ? (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
            <Metric icon={CircleDollarSign} label="Ventas" value={money.format(summary.sales)} />
            <Metric icon={ShoppingBag} label="Órdenes" value={integer.format(summary.orders)} />
            <Metric icon={PackageSearch} label="Unidades" value={integer.format(summary.units)} />
            <Metric icon={WalletCards} label="Comisión ML" value={money.format(summary.fees)} />
            <Metric icon={AlertTriangle} label="IVA no recuperable" value={money.format(summary.ivaNonRecoverable)} tone={summary.ivaNonRecoverable > 0 ? "warn" : "neutral"} />
            <Metric icon={CircleDollarSign} label="Resultado conocido" value={money.format(summary.knownResult)} tone={summary.knownResult >= 0 ? "good" : "bad"} />
            <Metric icon={Percent} label="Margen conocido" value={`${percent.format(summary.knownMargin)}%`} tone={summary.knownMargin >= 10 ? "good" : summary.knownMargin >= 0 ? "warn" : "bad"} />
          </div>

          <Card className="mb-5">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3 text-sm text-slate-300"><CalendarDays className="size-4 text-violet-300" /><span>Cobertura de costos: <strong className="text-white">{percent.format(summary.coverage)}%</strong> de las unidades.</span></div>
              {state.data?.paging?.capped ? <Badge className="border-amber-400/[0.15] bg-amber-500/[0.08] text-amber-200">Período limitado a 1.000 órdenes</Badge> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div><CardTitle>Detalle de operaciones</CardTitle><CardDescription>{filtered.length} líneas de venta después de aplicar filtros locales.</CardDescription></div>
                <div className="flex flex-wrap gap-2">
                  <select className="h-9 rounded-md border border-white/[0.08] bg-slate-950 px-3 text-sm text-slate-300" value={costFilter} onChange={(e) => { setCostFilter(e.target.value); setPage(1); }}><option value="all">Todos los costos</option><option value="with">Con costo</option><option value="without">Sin costo</option></select>
                  <select className="h-9 rounded-md border border-white/[0.08] bg-slate-950 px-3 text-sm text-slate-300" value={marginFilter} onChange={(e) => { setMarginFilter(e.target.value); setPage(1); }}><option value="all">Todos los márgenes</option><option value="loss">Con pérdida</option><option value="low">Margen &lt; 10%</option><option value="healthy">Margen ≥ 10%</option></select>
                  <select className="h-9 rounded-md border border-white/[0.08] bg-slate-950 px-3 text-sm text-slate-300" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}><option value={20}>20 por página</option><option value={50}>50 por página</option><option value={100}>100 por página</option><option value={500}>500 por página</option></select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1150px] border-collapse text-sm">
                  <thead><tr className="border-y border-white/[0.07] bg-white/[0.025] text-left text-[11px] uppercase tracking-wider text-slate-500"><th className="px-4 py-3">Fecha</th><th className="px-3 py-3">Producto</th><th className="px-3 py-3 text-right">Unid.</th><th className="px-3 py-3 text-right">Venta</th><th className="px-3 py-3 text-right">Costo</th><th className="px-3 py-3 text-right">IVA NR</th><th className="px-3 py-3 text-right">Comisión</th><th className="px-3 py-3 text-right">Resultado</th><th className="px-3 py-3 text-right">Margen</th><th className="px-3 py-3">Estado</th><th className="w-10 px-3 py-3" /></tr></thead>
                  <tbody>{paginated.map((row) => <SaleTableRow key={row.rowId} row={row} expanded={expanded === row.rowId} onToggle={() => setExpanded(expanded === row.rowId ? null : row.rowId)} />)}</tbody>
                </table>
              </div>
              {!paginated.length ? <div className="p-10 text-center text-sm text-slate-500">No hay ventas que coincidan con los filtros.</div> : null}
              <div className="flex items-center justify-between border-t border-white/[0.07] px-4 py-3 text-sm text-slate-500"><span>Página {safePage} de {totalPages}</span><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</Button><Button variant="secondary" size="sm" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Siguiente</Button></div></div>
            </CardContent>
          </Card>

          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-400/[0.12] bg-amber-500/[0.05] p-4 text-xs leading-5 text-amber-100/70"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>Resultado conocido = venta − comisión ML − costo de mercadería − IVA no recuperable. Todavía no descuenta envío, IIBB, percepciones ni efecto neto de IVA.</span></div>
        </>
      ) : null}
    </>
  );
}

function Metric({ icon: Icon, label, value, tone = "neutral" }: { icon: typeof CircleDollarSign; label: string; value: string; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const toneClass = tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : tone === "bad" ? "text-rose-300" : "text-white";
  return <Card><CardContent className="p-4"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span><Icon className="size-4 text-violet-300" /></div><div className={`text-xl font-black tracking-tight ${toneClass}`}>{value}</div></CardContent></Card>;
}

function SaleTableRow({ row, expanded, onToggle }: { row: SaleRow; expanded: boolean; onToggle: () => void }) {
  const statusText = row.status === "paid" ? "Pagada" : row.status || "—";
  return (
    <>
      <tr className="border-b border-white/[0.055] text-slate-300 transition hover:bg-white/[0.025]">
        <td className="px-4 py-4 whitespace-nowrap text-xs text-slate-500">{row.date ? dateTime.format(new Date(row.date)) : "—"}</td>
        <td className="px-3 py-4"><div className="max-w-[360px]"><div className="truncate font-semibold text-slate-100">{row.title}</div><div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-600"><span className="font-mono">{row.itemId}</span>{row.sku ? <span>SKU {row.sku}</span> : null}<span>Orden #{row.orderId}</span></div></div></td>
        <td className="px-3 py-4 text-right">{integer.format(row.quantity)}</td>
        <td className="px-3 py-4 text-right font-semibold text-white">{money.format(row.sale)}</td>
        <td className="px-3 py-4 text-right">{row.hasCost ? money.format(row.merchandiseCost) : <Badge className="border-amber-400/[0.15] bg-amber-500/[0.08] text-amber-200">Sin costo</Badge>}</td>
        <td className="px-3 py-4 text-right text-amber-200/80">{row.hasCost ? money.format(row.ivaNonRecoverable) : "—"}</td>
        <td className="px-3 py-4 text-right text-slate-400">{money.format(row.fee)}</td>
        <td className={`px-3 py-4 text-right font-bold ${!row.hasCost ? "text-slate-600" : row.knownResult >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{row.hasCost ? money.format(row.knownResult) : "—"}</td>
        <td className="px-3 py-4 text-right">{row.hasCost ? <MarginBadge value={row.margin} /> : "—"}</td>
        <td className="px-3 py-4"><Badge className="border-emerald-400/[0.15] bg-emerald-500/[0.08] text-emerald-200">{statusText}</Badge></td>
        <td className="px-3 py-4"><Button variant="ghost" size="icon" onClick={onToggle} aria-label="Ver detalle">{expanded ? <ChevronUp /> : <ChevronDown />}</Button></td>
      </tr>
      {expanded ? <tr className="border-b border-white/[0.055] bg-slate-950/50"><td colSpan={11} className="px-5 py-5"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6"><Detail label="Costo USD" value={row.hasCost ? usd.format(row.costUsd) : "Sin costo"} /><Detail label="USD / ARS usado" value={row.hasCost ? money.format(row.usdRate).replace("$", "$") : "—"} /><Detail label="Costo unitario ARS" value={row.hasCost ? money.format(row.unitCostArs) : "—"} /><Detail label="IVA NR unitario" value={row.hasCost ? money.format(row.unitIvaNonRecoverable) : "—"} /><Detail label="IVA NR total" value={row.hasCost ? money.format(row.ivaNonRecoverable) : "—"} /><Detail label="Precio unitario" value={money.format(row.unitPrice)} /><Detail label="Comprador" value={row.buyerNickname || "—"} /><Detail label="Fuente del costo" value={row.costSource === "history" ? "Histórico" : row.costSource === "current" ? "Actual" : "Sin costo"} /></div></td></tr> : null}
    </>
  );
}

function MarginBadge({ value }: { value: number }) {
  const className = value < 0 ? "border-rose-400/[0.18] bg-rose-500/[0.08] text-rose-200" : value < 10 ? "border-amber-400/[0.18] bg-amber-500/[0.08] text-amber-200" : "border-emerald-400/[0.18] bg-emerald-500/[0.08] text-emerald-200";
  return <Badge className={className}>{percent.format(value)}%</Badge>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{label}</div><div className="mt-1 font-semibold text-slate-200">{value}</div></div>;
}

function Loading() {
  return <Card><CardContent className="flex min-h-64 items-center justify-center gap-3 text-sm text-slate-400"><LoaderCircle className="size-5 animate-spin" />Cargando ventas...</CardContent></Card>;
}

function Message({ title, detail }: { title: string; detail: string }) {
  return <Card><CardContent className="flex min-h-64 flex-col items-center justify-center text-center"><AlertTriangle className="mb-4 size-8 text-amber-300" /><div className="font-bold text-white">{title}</div><div className="mt-2 max-w-lg text-sm text-slate-500">{detail}</div></CardContent></Card>;
}
