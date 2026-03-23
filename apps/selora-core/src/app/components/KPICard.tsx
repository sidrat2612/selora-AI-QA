import { LucideIcon } from "lucide-react";
import { Card } from "./ui/card";
import { cn } from "./ui/utils";

interface KPICardProps {
  title: string;
  value: string | number;
  change?: {
    value: string;
    trend: "up" | "down" | "neutral";
  };
  icon?: LucideIcon;
  className?: string;
}

export function KPICard({ title, value, change, icon: Icon, className }: KPICardProps) {
  return (
    <Card className={cn("p-6", className)}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-slate-600">{title}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
          {change && (
            <p className={cn(
              "mt-2 text-sm flex items-center gap-1",
              change.trend === "up" ? "text-green-600" : 
              change.trend === "down" ? "text-red-600" : 
              "text-slate-600"
            )}>
              <span>{change.value}</span>
              <span className="text-slate-500">vs last period</span>
            </p>
          )}
        </div>
        {Icon && (
          <div className="rounded-lg bg-slate-50 p-3">
            <Icon className="h-5 w-5 text-slate-600" />
          </div>
        )}
      </div>
    </Card>
  );
}
