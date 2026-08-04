"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Calculator as CalculatorIcon, CircleDollarSign, RotateCcw, Save, ShieldCheck, WalletCards } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  calculateProfitability,
  calculatorDefaults,
  numeric,
  type CalculatorValues,
  type CostMode,
  type Regimen
} from "@/lib/calculator";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "fiditools_calculator_v2";
const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const percent = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Calculator() {
  const [values, setValues] = useState<CalculatorValues>(calculatorDefaults);
  const [hydrated, setHydrated] = useState(false);
  const [saved, setSaved] = useState(false);
  const result = useMemo(() => calculateProfitability(values), [values]);
  const isRI = values.regimen === "RI";

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setValues({ ...calculatorDefaults, ...(JSON.parse(stored) as Partial<CalculatorValues>) });
    } catch {
      // Si el almacenamiento está bloqueado, la calculadora sigue funcionando.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  }, [values, hydrated]);

  function update<K extends keyof CalculatorValues>(key: K, value: CalculatorValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function reset() {
    setValues(calculatorDefaults);
    window.localStorage.removeItem(STORAGE_KEY);
    setSaved(false);
  }

  function save() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  const status = result.profitUnit < 0
    ? { text: "Operación con pérdida", className: "border-red-400/[0.20] bg-red-500/[0.10] text-red-200" }
    : result.margin < 8
      ? { text: "Margen ajustado", className: "border-amber-400/[0.20] bg-amber-500/[0.10] text-amber-200" }
      : result.margin < 15
        ? { text: "Operación saludable", className: "border-emerald-400/[0.20] bg-emerald-500/[0.10] text-emerald-200" }
        : { text: "Excelente rentabilidad", className: "border-emerald-400/[0.20] bg-emerald-500/[0.10] text-emerald-200" };

  return (
    <>
      <PageHeader
        eyebrow="Motor de rentabilidad"
        title="Calculadora"
        description="Costos, Mercado Libre, impuestos y flujo de caja por operación. Los datos quedan guardados solamente en este dispositivo."
        actions={
          <>
            <Button variant="secondary" onClick={save}><Save />{saved ? "Guardado" : "Guardar"}</Button>
            <Button variant="ghost" onClick={reset}><RotateCcw />Restablecer</Button>
          </>
        }
      />

      <Tabs value={values.regimen} onValueChange={(value) => update("regimen", value as Regimen)} className="mb-5">
        <TabsList className="grid w-full grid-cols-2 sm:w-[520px]">
          <TabsTrigger value="MONO">Monotributista</TabsTrigger>
          <TabsTrigger value="RI">Responsable inscripto</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(380px,.75fr)]">
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <FormSection title="Datos de la venta" description="Ingresá el precio final publicado y la cantidad." icon={<CalculatorIcon />}>
              <Field label="Producto" wide>
                <Input value={values.productName} placeholder="Ej.: Moto G35 128 GB" onChange={(event) => update("productName", event.target.value)} />
              </Field>
              <Field label="Precio de venta">
                <NumberField prefix="$" value={values.salePrice} onChange={(value) => update("salePrice", value)} />
              </Field>
              <Field label="Cantidad">
                <NumberField value={values.quantity} min={1} step={1} suffix="u." onChange={(value) => update("quantity", value)} />
              </Field>
            </FormSection>

            <FormSection title="Costo del producto" description="Podés usar un costo directo en pesos o convertirlo desde dólares." icon={<CircleDollarSign />}>
              <Field label="Costo en pesos">
                <NumberField prefix="$" value={values.costARS} onChange={(value) => update("costARS", value)} />
              </Field>
              <Field label="Costo en USD">
                <NumberField prefix="US$" value={values.costUSD} step={0.01} onChange={(value) => update("costUSD", value)} />
              </Field>
              <Field label="Valor del dólar">
                <NumberField prefix="$" suffix="/ USD" value={values.dollar} step={0.01} onChange={(value) => update("dollar", value)} />
              </Field>
              <Field label="Costo que usa el cálculo">
                <CostModePicker value={values.costMode} onChange={(value) => update("costMode", value)} />
              </Field>
              <div className="col-span-full flex items-center justify-between rounded-xl border border-cyan-400/[0.15] bg-cyan-500/[0.07] px-4 py-3">
                <span className="text-sm text-slate-400">Costo convertido desde USD</span>
                <strong className="text-base text-cyan-200">{money.format(result.convertedCost)}</strong>
              </div>
            </FormSection>

            <FormSection title="Gastos y descuentos" description="Los porcentajes son editables. El cargo por cuotas usa las opciones definidas por Mercado Libre." icon={<WalletCards />}>
              <Field label="Comisión Mercado Libre">
                <NumberField suffix="%" value={values.commissionPct} step={0.1} onChange={(value) => update("commissionPct", value)} />
              </Field>
              <Field label="Cargo por cuotas">
                <select
                  className="h-11 w-full rounded-xl border border-white/[0.10] bg-slate-950/[0.65] px-3 text-sm text-slate-100 outline-none focus:border-violet-400/[0.70]"
                  value={values.installmentPct}
                  onChange={(event) => update("installmentPct", numeric(event.target.value))}
                >
                  <option value="0">Sin cargo por cuotas (0%)</option>
                  <option value="5">Cuota promocionada (5%)</option>
                  <option value="8.4">3 cuotas al mismo precio (8,4%)</option>
                  <option value="12.3">6 cuotas al mismo precio (12,3%)</option>
                  <option value="15.7">9 cuotas al mismo precio (15,7%)</option>
                  <option value="19.2">12 cuotas al mismo precio (19,2%)</option>
                </select>
              </Field>
              <Field label={isRI ? "Ingresos Brutos · sobre neto sin IVA" : "Ingresos Brutos · sobre venta total"}>
                <NumberField suffix="%" value={values.iibbPct} step={0.1} onChange={(value) => update("iibbPct", value)} />
              </Field>
              <Field label="Percepciones recuperables">
                <NumberField suffix="%" value={values.perceptionsPct} step={0.1} onChange={(value) => update("perceptionsPct", value)} />
              </Field>
              <Field label="Envío por unidad">
                <NumberField prefix="$" value={values.shipping} onChange={(value) => update("shipping", value)} />
              </Field>
              {!isRI ? (
                <Field label="IVA no recuperable manual">
                  <NumberField prefix="$" value={values.ivaNoRec} onChange={(value) => update("ivaNoRec", value)} />
                </Field>
              ) : null}
              {!isRI ? (
                <OptionCard
                  title="IVA no recuperable Bruno"
                  description={`Costo ÷ 1,21 × 0,168 = ${money.format(result.brunoCalculated)}`}
                  checked={values.applyBruno}
                  onCheckedChange={(checked) => update("applyBruno", checked)}
                />
              ) : null}
            </FormSection>

            {isRI ? (
              <FormSection title="IVA · Responsable inscripto" description="Créditos fiscales de mercadería, comisión, cuotas y envío." icon={<ShieldCheck />} last>
                <OptionCard
                  title="Compra de mercadería con Factura A"
                  description="Computa el IVA crédito incluido dentro del costo cargado."
                  checked={values.purchaseInvoiced}
                  onCheckedChange={(checked) => update("purchaseInvoiced", checked)}
                />
                <OptionCard
                  title="Comisión, cuotas y envío cargados con IVA incluido"
                  description="Activado: extrae el 21%. Desactivado: interpreta los importes como netos y suma el IVA a la salida de caja."
                  checked={values.servicesIncludeIVA}
                  onCheckedChange={(checked) => update("servicesIncludeIVA", checked)}
                />
                <div className="col-span-full grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <MiniResult label="IVA débito de la venta" value={result.vatDebit} />
                  <MiniResult label="IVA crédito mercadería" value={result.merchandiseVatCredit} positive />
                  <MiniResult label="IVA crédito comisión + cuotas" value={result.commissionVatCredit} positive />
                  <MiniResult label="IVA crédito envío" value={result.shippingVatCredit} positive />
                  <MiniResult label="Comisión + cuotas netas" value={result.commissionNet} />
                  <MiniResult label="Envío neto" value={result.shippingNet} />
                </div>
              </FormSection>
            ) : null}
          </CardContent>
        </Card>

        <aside className="xl:sticky xl:top-8 xl:self-start">
          <Card className="overflow-hidden border-violet-400/[0.15]">
            <div className="bg-gradient-to-br from-violet-600/[0.25] via-blue-600/[0.15] to-cyan-500/[0.10] p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <Badge className="border-violet-300/[0.20] bg-violet-300/[0.10] text-violet-100">{isRI ? "Responsable inscripto" : "Monotributista"}</Badge>
                <Badge className={status.className}>{status.text}</Badge>
              </div>
              <p className="mt-6 text-sm text-slate-300">Ganancia económica por unidad</p>
              <strong className={cn("mt-1 block text-4xl font-black tracking-tight sm:text-5xl", result.profitUnit >= 0 ? "text-white" : "text-red-300")}>{money.format(result.profitUnit)}</strong>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-300">
                <span className="rounded-full bg-black/[0.20] px-3 py-1.5">Margen {percent.format(result.margin)}%</span>
                <span className="rounded-full bg-black/[0.20] px-3 py-1.5">Retorno s/costo {percent.format(result.returnOnCost)}%</span>
              </div>
            </div>

            <CardContent className="p-5 sm:p-6">
              <div className="space-y-1">
                <SummaryRow label="Costo utilizado" value={-result.cost} />
                <SummaryRow label="Comisión ML · caja" value={-result.commissionCash} />
                <SummaryRow label="Cargo por cuotas · caja" value={-result.installmentCash} />
                {isRI ? <SummaryRow label="IVA crédito comisión + cuotas" value={result.commissionVatCredit} positive /> : null}
                <SummaryRow label={isRI ? "IIBB · sobre neto" : "IIBB · sobre total"} value={-result.iibb} />
                <SummaryRow label="Envío · caja" value={-result.shippingCash} />
                {isRI ? <SummaryRow label="IVA crédito envío" value={result.shippingVatCredit} positive /> : null}
                {!isRI && result.ivaNoRec > 0 ? <SummaryRow label="IVA no recuperable manual" value={-result.ivaNoRec} /> : null}
                {!isRI && result.brunoApplied > 0 ? <SummaryRow label="IVA no recuperable Bruno" value={-result.brunoApplied} /> : null}
                {isRI ? <SummaryRow label="IVA débito venta" value={-result.vatDebit} /> : null}
                {isRI ? <SummaryRow label="IVA crédito mercadería" value={result.merchandiseVatCredit} positive /> : null}
                {isRI ? <SummaryRow label={result.vatBalance >= 0 ? "IVA a pagar" : "Saldo técnico IVA"} value={-result.vatBalance} positive={result.vatBalance < 0} /> : null}
                <div className="my-3 border-t border-white/[0.08]" />
                <SummaryRow label="Egreso definitivo" value={-result.definitiveOutflow} strong />
                <SummaryRow label="Percepciones recuperables" value={-result.perceptions} recoverable />
                <SummaryRow label="Caja inmediata por unidad" value={result.cashUnit} strong />
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <MiniResult label="Facturación total" value={result.billingTotal} />
                <MiniResult label="Ganancia total" value={result.profitTotal} positive={result.profitTotal >= 0} />
                <MiniResult label="Caja inmediata total" value={result.cashTotal} />
                <MiniResult label="Unidades" rawValue={String(result.quantity)} />
              </div>

              <p className="mt-5 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 text-xs leading-5 text-slate-500">
                {isRI
                  ? "IIBB se calcula sobre la venta neta sin IVA. El IVA de Factura A de mercadería, comisión, cargo por cuotas y envío reduce el débito fiscal."
                  : "En Monotributo no se computan créditos fiscales. Las percepciones recuperables afectan la caja inmediata, pero no la ganancia económica."}
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}

function FormSection({ title, description, icon, children, last = false }: { title: string; description: string; icon: ReactNode; children: ReactNode; last?: boolean }) {
  return (
    <section className={cn("p-5 sm:p-6", !last && "border-b border-white/[0.08]")}>
      <div className="mb-5 flex items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-violet-500/[0.10] text-violet-300 [&_svg]:size-4">{icon}</span>
        <div><h2 className="font-bold text-white">{title}</h2><p className="mt-1 text-sm leading-5 text-slate-500">{description}</p></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <label className={cn("space-y-2", wide && "sm:col-span-2")}><span className="text-xs font-semibold text-slate-400">{label}</span>{children}</label>;
}

function NumberField({ value, onChange, prefix, suffix, min = 0, step = 0.01 }: { value: number; onChange: (value: number) => void; prefix?: string; suffix?: string; min?: number; step?: number }) {
  return (
    <div className="flex h-11 items-center rounded-xl border border-white/[0.10] bg-slate-950/[0.65] focus-within:border-violet-400/[0.70] focus-within:ring-2 focus-within:ring-violet-500/15">
      {prefix ? <span className="pl-3 text-xs font-semibold text-slate-500">{prefix}</span> : null}
      <input
        className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-100 outline-none"
        type="number"
        inputMode="decimal"
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(numeric(event.target.value))}
      />
      {suffix ? <span className="pr-3 text-xs font-semibold text-slate-500">{suffix}</span> : null}
    </div>
  );
}

function CostModePicker({ value, onChange }: { value: CostMode; onChange: (value: CostMode) => void }) {
  return (
    <div className="grid h-11 grid-cols-2 rounded-xl border border-white/[0.10] bg-slate-950/[0.65] p-1">
      <button type="button" className={cn("rounded-lg text-xs font-semibold transition", value === "ARS" ? "bg-violet-600 text-white" : "text-slate-500 hover:text-white")} onClick={() => onChange("ARS")}>Pesos</button>
      <button type="button" className={cn("rounded-lg text-xs font-semibold transition", value === "USD" ? "bg-violet-600 text-white" : "text-slate-500 hover:text-white")} onClick={() => onChange("USD")}>USD convertido</button>
    </div>
  );
}

function OptionCard({ title, description, checked, onCheckedChange }: { title: string; description: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <div className="col-span-full flex items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
      <div><strong className="block text-sm text-slate-200">{title}</strong><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={title} />
    </div>
  );
}

function MiniResult({ label, value, rawValue, positive = false }: { label: string; value?: number; rawValue?: string; positive?: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
      <span className="block text-[11px] leading-4 text-slate-500">{label}</span>
      <strong className={cn("mt-1 block text-sm text-slate-100", positive && "text-emerald-300")}>{rawValue ?? money.format(value ?? 0)}</strong>
    </div>
  );
}

function SummaryRow({ label, value, positive = false, recoverable = false, strong = false }: { label: string; value: number; positive?: boolean; recoverable?: boolean; strong?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-4 rounded-lg px-2 py-2 text-sm", strong && "bg-white/[0.035]")}>
      <span className={cn("text-slate-500", strong && "font-semibold text-slate-300", recoverable && "text-amber-300/[0.80]")}>{label}</span>
      <strong className={cn("text-right text-slate-200", positive && "text-emerald-300", recoverable && "text-amber-300", strong && "text-white")}>{value > 0 ? "+" : ""}{money.format(value)}</strong>
    </div>
  );
}
