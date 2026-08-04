import { Construction } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardContent className="grid min-h-64 place-items-center p-8 text-center">
        <div>
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-violet-500/[0.12] text-violet-300"><Construction className="size-7" /></span>
          <h2 className="mt-4 text-xl font-bold text-white">{title}</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-400">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
