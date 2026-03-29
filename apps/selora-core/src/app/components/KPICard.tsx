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
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{value}</p>
          {change && (
            <p className={cn(
              "mt-2 text-sm flex items-center gap-1",
              change.trend === "up" ? "text-success" : 
              change.trend === "down" ? "text-destructive" : 
              "text-muted-foreground"
            )}>
              <span>{change.value}</span>
              <span className="text-muted-foreground">vs last period</span>
            </p>
          )}
        </div>
        {Icon && (
          <div className="rounded-lg bg-surface-container-low p-3">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
      </div>
    </Card>
  );
}
