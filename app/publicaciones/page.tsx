import { PageHeader } from "@/components/app-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function PublicationsPage() {
  return (
    <>
      <PageHeader eyebrow="Catálogo" title="Publicaciones" description="Publicaciones, SKU, costos y rentabilidad por producto." />
      <ComingSoon title="Módulo de publicaciones" description="Se habilita después de validar OAuth y asociar un costo a cada SKU o publicación de Mercado Libre." />
    </>
  );
}
