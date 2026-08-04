import { PageHeader } from "@/components/app-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function ReportsPage() {
  return (
    <>
      <PageHeader eyebrow="Contabilidad de gestión" title="Reportes" description="Estados de resultados, IVA, percepciones y análisis por período." />
      <ComingSoon title="Estado de resultados automático" description="Este módulo consolidará ventas reales, costos por SKU, comisiones, logística e impuestos." />
    </>
  );
}
