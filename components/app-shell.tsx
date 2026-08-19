"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  BarChart3,
  Calculator,
  FileText,
  LayoutDashboard,
  Menu,
  PackageSearch,
  ShoppingCart,
  Sparkles,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/calculadora", label: "Calculadora", icon: Calculator },
  { href: "/publicaciones", label: "Publicaciones", icon: PackageSearch },
  { href: "/ventas", label: "Ventas", icon: ShoppingCart },
  { href: "/reportes", label: "Reportes", icon: FileText }
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-[#070a12] text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 size-96 rounded-full bg-violet-600/[0.20] blur-3xl" />
        <div className="absolute right-[-8rem] top-1/3 size-[28rem] rounded-full bg-cyan-500/[0.10] blur-3xl" />
        <div className="absolute bottom-[-14rem] left-1/3 size-[32rem] rounded-full bg-blue-600/[0.10] blur-3xl" />
      </div>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-white/[0.08] bg-slate-950/[0.70] p-4 backdrop-blur-2xl lg:block">
        <Brand />
        <nav className="mt-8 space-y-1.5">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                  active
                    ? "bg-gradient-to-r from-violet-600/[0.90] to-blue-600/[0.90] text-white shadow-lg shadow-violet-500/[0.15]"
                    : "text-slate-400 hover:bg-white/[0.06] hover:text-white"
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-violet-400/[0.15] bg-violet-500/[0.08] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-violet-200"><Sparkles className="size-4" /> FidiTools v1</div>
          <p className="mt-2 text-xs leading-5 text-slate-500">Base profesional para Mercado Libre, rentabilidad e impuestos.</p>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/[0.08] bg-slate-950/[0.70] px-4 backdrop-blur-xl lg:hidden">
        <Brand compact />
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Abrir menú"><Menu /></Button>
      </header>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-black/[0.70]" onClick={() => setOpen(false)} aria-label="Cerrar menú" />
          <aside className="absolute inset-y-0 left-0 w-[82%] max-w-sm border-r border-white/[0.10] bg-slate-950 p-4 shadow-2xl">
            <div className="flex items-center justify-between"><Brand /><Button variant="ghost" size="icon" onClick={() => setOpen(false)}><X /></Button></div>
            <nav className="mt-8 space-y-2">
              {NAV.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={cn("flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold", active ? "bg-violet-600 text-white" : "text-slate-300 hover:bg-white/[0.06]")}>
                    <Icon className="size-4" />{item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      ) : null}

      <main className="relative min-h-dvh lg:pl-64">
        <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-3">
      <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-violet-500 via-blue-600 to-cyan-500 text-lg font-black text-white shadow-lg shadow-violet-500/[0.25]">F</span>
      {!compact ? <span><strong className="block text-base tracking-tight text-white">FidiTools</strong><small className="block text-[11px] text-slate-500">E-commerce intelligence</small></span> : <strong className="text-base">FidiTools</strong>}
    </Link>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-violet-300"><BarChart3 className="size-3.5" />{eyebrow}</p>
        <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
