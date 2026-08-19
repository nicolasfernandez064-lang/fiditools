"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeDollarSign,
  Boxes,
  CalendarDays,
  CircleDollarSign,
  FileSpreadsheet,
  LoaderCircle,
  PackageSearch,
  ReceiptText,
  RefreshCw,
  ShoppingBag,
  Truck
} from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const SHIPPING_ARS = 6600;
const IIBB_RATE = 4;

type Summary = {
  sales: number;
  orders: number;
  units: number;
  fees: number;
  coveredUnits: number;
  coveredSales: number;
  coveredFees: number;
  merchandiseCost: number;
  ivaNonRecoverable: number;
  shipping: number;
  iibb: number;
  vatDebit: number;
  vatCreditMerchandise: number;
  vatCreditFees: number;
  vatCreditShipping: number;
  vatCredits: number;
  vatBalance: number;
  knownContribution: number;
  knownMargin: number;
  coverage: number;
};

type ProductRow = {
  itemId: string;
  title: string;
  units: number;
  sales: number;
  fees: number;
  cost: number;
  ivaNonRecoverable: number;
  shipping: number;
  iibb: number;
  vatBalance: number;
  contribution: number;
  margin: number;
  hasCost: boolean;
};

type MissingCost = {
  itemId: string;
  title: string;
  units: number;
  sales: number;
};

type ReportPayload = {
  connected?: boolean;
  user?: { id: number; nickname: string; site_id: string };
  period?: { from: string; to: string };
  taxMode?: "ri" | "mono";
  assumptions?: { ivaEnabled: boolean; ivaRate: number; iibbRate: number; shippingPerOrder: number; coveredOrdersEquivalent: number };
  summary?: Summary;
  products?: ProductRow[];
  missingCosts?: MissingCost[];
  paging?: { apiTotal: number; scanned: number; capped: boolean };
  notes?: string[];
  error?: string;
};

type State = {
  status: "loading" | "ready" | "error" | "disconnected";
  data: ReportPayload | null;
  error: string;
};

function formatDate(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function initialPeriod() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return { from: formatDate(from), to: formatDate(to) };
}

function csvEscape(value: string | number) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export function Reports() {
  const defaults = useMemo(() => initialPeriod(), []);
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [ivaEnabled, setIvaEnabled] = useState(true);
  const [state, setState] = useState<State>({ status: "loading", data: null, error: "" });

  const load = useCallback(async (nextFrom = from, nextTo = to, nextIva = ivaEnabled) => {
    setState((current) => ({ status: "loading", data: current.data, error: "" }));
    try {
      const params = new URLSearchParams({
        from: nextFrom,
        to: nextTo,
        iva: nextIva ? "1" : "0",
        shipping: String(SHIPPING_ARS),
        iibb: String(IIBB_RATE)
      });
      const response = await fetch(`/api/meli/reports?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as ReportPayload;
      if (response.status === 401 || payload.connected === false) {
        setState({ status: "disconnected", data: null, error: payload.error || "Conectá Mercado Libre para generar reportes." });
        return;
      }
      if (!response.ok || !payload.summary) throw new Error(payload.error || "No se pudo generar el reporte.");
      setState({ status: "ready", data: payload, error: "" });
    } catch (error) {
      setState({ status: "error", data: null, error: error instanceof Error ? error.message : "Error inesperado." });
    }
  }, [from, to, ivaEnabled]);

  useEffect(() => { void load(defaults.from, defaults.to, true); }, [defaults.from, defaults.to]);

  const changeTaxMode = (nextIva: boolean) => {
    setIvaEnabled(nextIva);
    void load(from, to, nextIva);
  };

  const setPreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    const nextFrom = formatDate(start);
    const nextTo = formatDate(end);
    setFrom(nextFrom);
    setTo(nextTo);
    void load(nextFrom, nextTo, ivaEnabled);
  };

  const setCurrentMonth = () => {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    const nextFrom = formatDate(start);
    const nextTo = formatDate(end);
    setFrom(nextFrom);
    setTo(nextTo);
    void load(nextFrom, nextTo, ivaEnabled);
  };

  const exportCsv = () => {
    const products = state.data?.products || [];
    if (!products.length) return;
    const rows = [
      ["Publicación", "Producto", "Unidades", "Ventas", "Comisión", "Envío", "Costo", "IVA NR", "IIBB", "IVA saldo", "Resultado estimado", "Margen %", "Costo cargado"],
      ...products.map((row) => [
        row.itemId,
        row.title,
        row.units,
        row.sales,
        row.fees,
        row.shipping,
        row.cost,
        row.ivaNonRecoverable,
        row.iibb,
        row.vatBalance,
        row.contribution,
        row.margin.toFixed(2),
        row.hasCost ? "Sí" : "No"
      ])
    ];
    const csv = rows.map((row) => row.map((cell) => csvEscape(cell)).join(";")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fiditools-reporte-${from}-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const summary = state.data?.summary;
  const products = state.data?.products || [];
  const missing = state.data?.missingCosts || [];

  return (
    <>
      <PageHeader
        eyebrow="Contabilidad de gestión"
        title="Reportes"
        description="Estado de resultados estimado con ventas reales, costos históricos, envío, IIBB e IVA opcional."
        actions={(
          <>
            <Button variant="secondary" onClick={() => void load()} disabled={state.status === "loading"}><RefreshCw />Actualizar</Button>
            <Button variant="secondary" onClick={exportCsv} disabled={!products.length}><FileSpreadsheet />Exportar CSV</Button>
          </>
        )}
      />

      <Card className="mb-5">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => setPreset(7)}>7 días</Button>
                <Button variant="secondary" size="sm" onClick={() => setPreset(30)}>30 días</Button>
                <Button variant="secondary" size="sm" onClick={setCurrentMonth}>Este mes</Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-xs font-semibold text-slate-500">Tratamiento impositivo:</span>
                <Button size="sm" variant={ivaEnabled ? "default" : "secondary"} onClick={() => changeTaxMode(true)}>Responsable inscripto · IVA ON</Button>
                <Button size="sm" variant={!ivaEnabled ? "default" : "secondary"} onClick={() => changeTaxMode(false)}>Monotributo · IVA OFF</Button>
                <Badge>IIBB 4%</Badge>
                <Badge>Envío {money.format(SHIPPING_ARS)}</Badge>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[170px_170px_auto] sm:items-end">
              <label className="text-xs font-semibold text-slate-400">Desde<Input className="mt-1.5" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
              <label className="text-xs font-semibold text-slate-400">Hasta<Input className="mt-1.5" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
              <Button onClick={() => void load()}><CalendarDays />Aplicar período</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {state.status === "loading" && !summary ? <LoadingState /> : null}
      {state.status === "disconnected" ? <MessageState title="Mercado Libre no está conectado" detail={state.error} /> : null}
      {state.status === "error" ? <MessageState title="No pudimos generar el reporte" detail={state.error} /> : null}

      {summary ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={<BadgeDollarSign />} label="Ventas brutas" value={money.format(summary.sales)} detail={`${integer.format(summary.orders)} órdenes pagadas`} />
            <Metric icon={<ShoppingBag />} label="Comisión ML" value={money.format(summary.fees)} detail="Suma del sale_fee informado" />
            <Metric icon={<Truck />} label="Envíos imputados" value={money.format(summary.shipping)} detail={`${money.format(SHIPPING_ARS)} por orden cubierta`} />
            <Metric icon={<Boxes />} label="Costo mercadería" value={money.format(summary.merchandiseCost)} detail={`${percent.format(summary.coverage)}% de unidades con costo`} />
            <Metric icon={<ReceiptText />} label="IVA no recuperable" value={money.format(summary.ivaNonRecoverable)} detail="Cargado manualmente en Publicaciones" />
            <Metric icon={<ReceiptText />} label="IIBB estimado" value={money.format(summary.iibb)} detail={`Alícuota promedio ${IIBB_RATE}%`} />
            {ivaEnabled ? <Metric icon={<ReceiptText />} label="IVA saldo" value={money.format(summary.vatBalance)} detail={`Débito ${money.format(summary.vatDebit)} · Crédito ${money.format(summary.vatCredits)}`} highlight={summary.vatBalance <= 0} /> : <Metric icon={<ReceiptText />} label="IVA" value="Desactivado" detail="Modo Monotributo" />}
            <Metric icon={<CircleDollarSign />} label="Resultado estimado" value={money.format(summary.knownContribution)} detail={`Margen ${percent.format(summary.knownMargin)}% sobre ventas cubiertas`} highlight={summary.knownContribution >= 0} />
            <Metric icon={<PackageSearch />} label="Cobertura" value={`${percent.format(summary.coverage)}%`} detail={`${integer.format(summary.coveredUnits)} / ${integer.format(summary.units)} unidades`} />
          </section>

          {ivaEnabled ? (
            <Card className="mt-5">
              <CardHeader><CardTitle>IVA estimado</CardTitle><CardDescription>IVA 21% incluido en ventas, costo de mercadería, comisión y envío.</CardDescription></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <TaxBox label="Débito fiscal" value={summary.vatDebit} />
                <TaxBox label="Crédito mercadería" value={summary.vatCreditMerchandise} />
                <TaxBox label="Crédito comisión" value={summary.vatCreditFees} />
                <TaxBox label="Crédito envío" value={summary.vatCreditShipping} />
                <TaxBox label="Saldo IVA" value={summary.vatBalance} strong />
              </CardContent>
            </Card>
          ) : null}

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.45fr)]">
            <Card>
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div><CardTitle>Resultado por producto</CardTitle><CardDescription>Ventas, cargos, impuestos y costo histórico por publicación.</CardDescription></div>
                <Badge>{products.length} productos</Badge>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1120px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.08] text-xs uppercase tracking-wider text-slate-600">
                        <th className="px-3 py-3">Producto</th>
                        <th className="px-3 py-3 text-right">Unid.</th>
                        <th className="px-3 py-3 text-right">Ventas</th>
                        <th className="px-3 py-3 text-right">Comisión</th>
                        <th className="px-3 py-3 text-right">Envío</th>
                        <th className="px-3 py-3 text-right">Costo</th>
                        <th className="px-3 py-3 text-right">IVA NR</th>
                        <th className="px-3 py-3 text-right">IIBB</th>
                        {ivaEnabled ? <th className="px-3 py-3 text-right">IVA saldo</th> : null}
                        <th className="px-3 py-3 text-right">Resultado</th>
                        <th className="px-3 py-3 text-right">Margen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((row) => <ProductReportRow key={row.itemId} row={row} ivaEnabled={ivaEnabled} />)}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-5">
              <Card>
                <CardHeader><CardTitle>Cobertura de costos</CardTitle><CardDescription>Qué parte del período ya podemos analizar con precisión.</CardDescription></CardHeader>
                <CardContent>
                  <div className="mb-3 flex items-end justify-between"><strong className="text-3xl font-black text-white">{percent.format(summary.coverage)}%</strong><span className="text-xs text-slate-500">{integer.format(summary.coveredUnits)} / {integer.format(summary.units)} unidades</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400" style={{ width: `${Math.min(100, summary.coverage)}%` }} /></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Costos faltantes</CardTitle><CardDescription>Publicaciones vendidas en el período sin costo guardado.</CardDescription></CardHeader>
                <CardContent className="space-y-2">
                  {missing.length ? missing.slice(0, 8).map((row) => (
                    <div key={row.itemId} className="rounded-xl border border-amber-400/[0.12] bg-amber-500/[0.035] p-3">
                      <strong className="block truncate text-sm text-slate-200">{row.title}</strong>
                      <div className="mt-1 flex justify-between gap-3 text-xs text-slate-500"><span>{integer.format(row.units)} u.</span><span>{money.format(row.sales)}</span></div>
                    </div>
                  )) : <div className="rounded-xl border border-emerald-400/[0.12] bg-emerald-500/[0.04] p-4 text-sm text-emerald-200">Todas las unidades del período tienen costo cargado.</div>}
                  {missing.length > 8 ? <p className="text-xs text-slate-600">+ {missing.length - 8} publicaciones adicionales sin costo.</p> : null}
                </CardContent>
              </Card>
            </div>
          </div>

          <Card className="mt-5 border-amber-400/[0.12] bg-amber-500/[0.025]">
            <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="size-4 text-amber-300" />Supuestos del resultado</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm leading-6 text-slate-400 md:grid-cols-2 xl:grid-cols-4">
              <p><strong className="text-slate-200">Envío:</strong> {money.format(SHIPPING_ARS)} por orden pagada. Si una orden mezcla productos con y sin costo, se prorratea por venta cubierta.</p>
              <p><strong className="text-slate-200">IIBB:</strong> {IIBB_RATE}% promedio. Con IVA activo se calcula sobre venta neta de IVA; sin IVA, sobre venta bruta.</p>
              <p><strong className="text-slate-200">IVA:</strong> {ivaEnabled ? "21% activo; débito en ventas y crédito en mercadería, comisión y envío." : "desactivado para modo Monotributo."}</p>
              <p><strong className="text-slate-200">Resultado:</strong> venta − costo − comisión − envío − IIBB {ivaEnabled ? "− saldo de IVA" : ""}. Sigue siendo una estimación de gestión.</p>
            </CardContent>
          </Card>

          {state.data?.paging?.capped ? (
            <div className="mt-4 rounded-xl border border-amber-400/[0.15] bg-amber-500/[0.04] p-3 text-xs text-amber-200">El período tiene {integer.format(state.data.paging.apiTotal)} órdenes. Esta versión analiza como máximo 1.000 por consulta para proteger el rendimiento.</div>
          ) : null}
        </>
      ) : null}
    </>
  );
}

function Metric({ icon, label, value, detail, highlight }: { icon: React.ReactNode; label: string; value: string; detail: string; highlight?: boolean }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-5 flex items-center justify-between"><span className="grid size-10 place-items-center rounded-xl bg-violet-500/[0.10] text-violet-300">{icon}</span><span className="text-[10px] font-bold uppercase tracking-widest text-slate-700">LIVE</span></div>
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <strong className={`mt-1 block text-2xl font-black tracking-tight ${highlight === false ? "text-rose-300" : "text-white"}`}>{value}</strong>
        <p className="mt-2 text-xs text-slate-600">{detail}</p>
      </CardContent>
    </Card>
  );
}

function TaxBox({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4"><span className="text-xs font-semibold text-slate-500">{label}</span><strong className={`mt-1 block text-lg ${strong ? "font-black text-white" : "font-bold text-slate-200"}`}>{money.format(value)}</strong></div>;
}

function ProductReportRow({ row, ivaEnabled }: { row: ProductRow; ivaEnabled: boolean }) {
  return (
    <tr className="border-b border-white/[0.06] text-slate-300 last:border-0 hover:bg-white/[0.025]">
      <td className="max-w-[300px] px-3 py-4"><span className="block truncate font-semibold text-slate-200">{row.title}</span><small className="font-mono text-slate-600">{row.itemId}</small></td>
      <td className="px-3 py-4 text-right">{integer.format(row.units)}</td>
      <td className="px-3 py-4 text-right font-semibold text-white">{money.format(row.sales)}</td>
      <td className="px-3 py-4 text-right text-slate-400">{money.format(row.fees)}</td>
      <td className="px-3 py-4 text-right text-slate-400">{row.hasCost ? money.format(row.shipping) : "—"}</td>
      <td className="px-3 py-4 text-right">{row.hasCost ? money.format(row.cost) : <Badge className="border-amber-400/[0.15] bg-amber-500/[0.08] text-amber-200">Sin costo</Badge>}</td>
      <td className="px-3 py-4 text-right">{row.hasCost ? money.format(row.ivaNonRecoverable) : "—"}</td>
      <td className="px-3 py-4 text-right text-slate-400">{row.hasCost ? money.format(row.iibb) : "—"}</td>
      {ivaEnabled ? <td className="px-3 py-4 text-right text-slate-400">{row.hasCost ? money.format(row.vatBalance) : "—"}</td> : null}
      <td className={`px-3 py-4 text-right font-bold ${row.hasCost ? row.contribution >= 0 ? "text-emerald-300" : "text-rose-300" : "text-slate-600"}`}>{row.hasCost ? money.format(row.contribution) : "—"}</td>
      <td className="px-3 py-4 text-right">{row.hasCost ? `${percent.format(row.margin)}%` : "—"}</td>
    </tr>
  );
}

function LoadingState() {
  return <Card><CardContent className="flex min-h-64 items-center justify-center gap-3 text-sm text-slate-400"><LoaderCircle className="size-5 animate-spin" />Generando reporte...</CardContent></Card>;
}

function MessageState({ title, detail }: { title: string; detail: string }) {
  return <Card><CardContent className="flex min-h-64 flex-col items-center justify-center text-center"><PackageSearch className="mb-4 size-8 text-violet-300" /><h2 className="text-xl font-bold text-white">{title}</h2><p className="mt-2 max-w-xl text-sm text-slate-500">{detail}</p></CardContent></Card>;
}
