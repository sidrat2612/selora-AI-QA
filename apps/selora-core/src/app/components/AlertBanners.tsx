import { useState } from "react";
import { AlertTriangle, XCircle, X, ExternalLink } from "lucide-react";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { cn } from "./ui/utils";
import { Link } from "react-router";

export interface AlertBannerItem {
  id: string;
  severity: "critical" | "warning";
  message: string;
  linkText?: string;
  linkTo?: string;
}

interface AlertBannerProps {
  alerts: AlertBannerItem[];
}

export function AlertBanners({ alerts }: AlertBannerProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = alerts.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-3">
      {visible.map((alert) => {
        const isCritical = alert.severity === "critical";
        return (
          <Alert
            key={alert.id}
            className={cn(
              "relative pr-12",
              isCritical
                ? "border-destructive/30 bg-destructive/5"
                : "border-warning/30 bg-warning/5"
            )}
          >
            {isCritical ? (
              <XCircle className="h-4 w-4 text-destructive" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-warning" />
            )}
            <AlertDescription
              className={cn(
                isCritical ? "text-destructive" : "text-warning-foreground"
              )}
            >
              <strong>{isCritical ? "Critical:" : "Warning:"}</strong>{" "}
              {alert.message}
              {alert.linkTo && (
                <Link
                  to={alert.linkTo}
                  className="ml-2 inline-flex items-center gap-1 font-medium underline"
                >
                  {alert.linkText ?? "Review"}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </AlertDescription>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-6 w-6"
              onClick={() => setDismissed((prev) => new Set(prev).add(alert.id))}
              aria-label="Dismiss alert"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </Alert>
        );
      })}
    </div>
  );
}
