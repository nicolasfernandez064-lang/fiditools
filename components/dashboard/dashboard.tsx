"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeDollarSign,
  Boxes,
  CircleAlert,
  Link2,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Unplug
} from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MeliOrder, MeliUser } from "@/types/meli";

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" });

type State =
  | { status: "loading"; user: null; orders: MeliOrder[]; error: string }
  | { status: "disconnected"; user: null; orders: MeliOrder[]; error: string }
  | { status: "error"; user: null; orders: MeliOrder[]; error: string }
  | { status: "connected"; user: MeliUser; orders: MeliOrder[]; error: string };

function summarize(orders: MeliOrder[]) {
  return orders.reduce(
    (acc, order) => {
      acc.sales += Number(order.total_amount || 0);
      acc.orders += 1;
      for (const row of order.order_items || []) {
        acc.units += Number(row.quantity || 0);
        acc.fees += Number(row.sale_fee || 0);
      }
      return acc;
    },
    { sales: 0, orders: 0, units: 0, fees: 0 }
  );
}

export function Dashboard() {
  const [state, setState] = useState<State>({ status: "loading", user: null, orders: [], error: "" });

  const load = useCallback(async () => {
    setState({ status: "loading", user: null, orders: [], error: "" });
    try {
      const response = await fetch("/api/meli/dashboard?limit=20", { cache: "no-store" });
      const payload = (await response.json()) as {
        connected?: boolean;
        user?: MeliUser;
        orders?: { results?: MeliOrder[] };
        error?: string;
      };

      if (response.status === 401 || !payload.connected) {
        setState({ status: "disconnected", user: null, orders: [], error: payload.error || "" });
        return;
      }
      if (!response.ok || !payload.user) throw new Error(payload.error || "No se pudo cargar Mercado Libre.");
      setState({ status: "connected", user: payload.user, orders: payload.orders?.results || [], error: "" });
    } catch (error) {
      setState({ status: "error", user: null, orders: [], error: error instanceof Error ? error.message : "Error inesperado." });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => summarize(state.orders), [state.orders]);
  const connected = state.status === "connected";

  return (
    <>
      <PageHeader
        eyebrow="Centro de control"
        title="Dashboard"
        description="Ventas reales de Mercado Libre y la base para automatizar rentabilidad, publicaciones, IVA y estados de resultados."
        actions={connected ? (
          <>
            <Button variant="secondary" onClick={() => void load()}><RefreshCw />Actualizar</Button>
            <form action="/api/auth/mercadolibre/logout" method="post"><Button variant="ghost" type="submit"><Unplug />Desconectar</Button></form>
          </>
        ) : undefined}
      />

      {state.status === "loading" ? <LoadingState /> : null}
      {state.status === "disconnected" ? <ConnectState message={state.error} /> : null}
      {state.status === "error" ? <ErrorState message={state.error} retry={() => void load()} /> : null}

      {connected ? (
        <>
          <Card className="mb-5 border-emerald-400/[0.15] bg-emerald-500/[0.035]">
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="flex items-center gap-4">
                <span className="grid size-12 place-items-center rounded-2xl bg-emerald-500/[0.15] text-lg font-black text-emerald-200">{state.user.nickname?.slice(0, 1).toUpperCase() || "F"}</span>
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300"><span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,.8)]" />Mercado Libre conectado</div>
                  <h2 className="mt-1 text-lg font-bold text-white">{state.user.nickname || `Usuario ${state.user.id}`}</h2>
                  <p className="text-xs text-slate-500">Seller ID {state.user.id} · {state.user.site_id || "MLA"}</p>
                </div>
              </div>
              <Badge className="w-fit border-emerald-400/[0.15] bg-emerald-500/[0.10] text-emerald-200"><ShieldCheck className="mr-1 size-3" /> Sesión cifrada</Badge>
            </CardContent>
          </Card>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={<BadgeDollarSign />} label="Ventas consultadas" value={money.format(totals.sales)} detail={`Últimas ${totals.orders} órdenes pagadas`} />
            <Metric icon={<Boxes />} label="Unidades" value={integer.format(totals.units)} detail="Sumadas desde order_items" />
            <Metric icon={<ShoppingBag />} label="Comisión informada" value={money.format(totals.fees)} detail="Campo sale_fee de las órdenes" />
            <Metric icon={<Link2 />} label="Rentabilidad automática" value="Próxima etapa" detail="Falta asociar costos por SKU" muted />
          </section>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(310px,.5fr)]">
            <Card>
              <CardHeader className="flex-row items-start justify-between">
                <div><CardTitle>Últimas ventas pagadas</CardTitle><CardDescription>Consulta directa de la API de Mercado Libre.</CardDescription></div>
                <Badge>{state.orders.length} cargadas</Badge>
              </CardHeader>
              <CardContent>
                {state.orders.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/[0.10] p-8 text-center text-sm text-slate-500">No aparecieron órdenes pagadas en esta consulta.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead><tr className="border-b border-white/[0.08] text-xs uppercase tracking-wider text-slate-600"><th className="px-3 py-3">Orden</th><th className="px-3 py-3">Producto</th><th className="px-3 py-3">Fecha</th><th className="px-3 py-3 text-right">Total</th><th className="px-3 py-3 text-right">Fee</th></tr></thead>
                      <tbody>{state.orders.map((order) => <OrderRow key={order.id} order={order} />)}</tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Hoja de ruta</CardTitle><CardDescription>Lo que sigue después de validar la conexión.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                <Roadmap index="01" title="Costos por SKU" detail="Asociar cada publicación con su costo real." />
                <Roadmap index="02" title="Rentabilidad por venta" detail="Cruzar venta, comisión, cuotas, envío e impuestos." />
                <Roadmap index="03" title="Estado de resultados" detail="Consolidar resultados mensuales y por producto." />
                <Roadmap index="04" title="Facturas ML" detail="Separar IVA crédito y percepciones reales." />
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </>
  );
}

function LoadingState() {
  return <Card><CardContent className="grid min-h-72 place-items-center"><div className="text-center"><LoaderCircle className="mx-auto size-8 animate-spin text-violet-300" /><p className="mt-3 text-sm text-slate-500">Consultando el estado de Mercado Libre…</p></div></CardContent></Card>;
}

function ConnectState({ message }: { message: string }) {
  return (
    <Card className="overflow-hidden border-violet-400/[0.15]">
      <CardContent className="grid min-h-[420px] place-items-center p-8 text-center">
        <div className="max-w-xl">
          <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-violet-600/[0.25] to-blue-600/[0.15] text-violet-200"><Link2 className="size-8" /></span>
          <h2 className="mt-5 text-2xl font-black text-white">Conectá tu cuenta de Mercado Libre</h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">La autorización ocurre en Mercado Libre. FidiTools nunca recibe tu contraseña y guarda los tokens cifrados en una cookie HttpOnly.</p>
          {message ? <p className="mt-3 rounded-xl border border-amber-400/[0.15] bg-amber-500/[0.08] p-3 text-xs text-amber-200">{message}</p> : null}
          <Button asChild size="lg" className="mt-6"><a href="/api/auth/mercadolibre/login">Conectar Mercado Libre <ArrowRight /></a></Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return (
    <Card className="border-red-400/[0.15]"><CardContent className="grid min-h-72 place-items-center p-8 text-center"><div><CircleAlert className="mx-auto size-9 text-red-300" /><h2 className="mt-3 text-lg font-bold text-white">No pudimos cargar el dashboard</h2><p className="mt-2 max-w-xl text-sm text-slate-400">{message}</p><Button variant="secondary" className="mt-5" onClick={retry}><RefreshCw />Reintentar</Button></div></CardContent></Card>
  );
}

function Metric({ icon, label, value, detail, muted = false }: { icon: React.ReactNode; label: string; value: string; detail: string; muted?: boolean }) {
  return (
    <Card><CardContent className="p-5 sm:p-6"><div className="flex items-center justify-between"><span className="grid size-10 place-items-center rounded-xl bg-violet-500/[0.10] text-violet-300 [&_svg]:size-4">{icon}</span><span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">LIVE</span></div><p className="mt-5 text-xs font-semibold text-slate-500">{label}</p><strong className={`mt-1 block text-2xl font-black tracking-tight ${muted ? "text-slate-400" : "text-white"}`}>{value}</strong><p className="mt-2 text-xs text-slate-600">{detail}</p></CardContent></Card>
  );
}

function OrderRow({ order }: { order: MeliOrder }) {
  const first = order.order_items?.[0];
  const fee = (order.order_items || []).reduce((sum, item) => sum + Number(item.sale_fee || 0), 0);
  const title = first?.item?.title || "Producto sin título";
  const extra = Math.max(0, (order.order_items?.length || 0) - 1);
  return (
    <tr className="border-b border-white/[0.06] text-slate-300 last:border-0 hover:bg-white/[0.025]">
      <td className="px-3 py-4 font-mono text-xs text-slate-500">#{order.id}</td>
      <td className="max-w-[320px] px-3 py-4"><span className="block truncate font-semibold text-slate-200">{title}</span><small className="text-slate-600">{extra ? `+${extra} producto(s)` : first?.item?.seller_sku || first?.item?.id || "Sin SKU"}</small></td>
      <td className="px-3 py-4 text-xs text-slate-500">{order.date_created ? date.format(new Date(order.date_created)) : "—"}</td>
      <td className="px-3 py-4 text-right font-bold text-white">{money.format(Number(order.total_amount || 0))}</td>
      <td className="px-3 py-4 text-right text-slate-400">{money.format(fee)}</td>
    </tr>
  );
}

function Roadmap({ index, title, detail }: { index: string; title: string; detail: string }) {
  return <div className="flex gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-violet-500/[0.10] text-xs font-black text-violet-300">{index}</span><div><strong className="block text-sm text-slate-200">{title}</strong><p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p></div></div>;
}
