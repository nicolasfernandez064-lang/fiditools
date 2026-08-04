"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <Card><CardContent className="grid min-h-72 place-items-center p-8 text-center"><div><h2 className="text-xl font-bold text-white">Algo salió mal</h2><p className="mt-2 text-sm text-slate-400">{error.message || "Error inesperado."}</p><Button className="mt-5" onClick={reset}>Reintentar</Button></div></CardContent></Card>;
}
