import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function NotFound() {
  return <Card><CardContent className="grid min-h-72 place-items-center p-8 text-center"><div><h1 className="text-5xl font-black text-white">404</h1><p className="mt-3 text-slate-400">Esta sección no existe todavía.</p><Button asChild className="mt-5"><Link href="/dashboard">Volver al dashboard</Link></Button></div></CardContent></Card>;
}
