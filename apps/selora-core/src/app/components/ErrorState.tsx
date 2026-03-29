import { AlertCircle, RefreshCw, Copy, ExternalLink } from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { useMemo } from "react";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  fullPage?: boolean;
}

export function ErrorState({
  title = "Something went wrong",
  message = "An error occurred while loading this content. Please try again.",
  onRetry,
  fullPage = false,
}: ErrorStateProps) {
  const traceId = useMemo(() => `SEL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`, []);

  const handleCopyTrace = () => {
    navigator.clipboard.writeText(traceId);
  };

  const content = (
    <div className="text-center py-12">
      <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
        <AlertCircle className="h-8 w-8 text-destructive" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">{message}</p>

      {/* Trace ID */}
      <div className="inline-flex items-center gap-2 bg-surface-container-low px-4 py-2 rounded-lg mb-6">
        <span className="text-xs text-muted-foreground">Trace ID:</span>
        <code className="text-xs font-mono text-foreground">{traceId}</code>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopyTrace}>
          <Copy className="h-3 w-3" />
        </Button>
      </div>

      {/* Auto-repair progress */}
      <div className="max-w-xs mx-auto mb-6">
        <div className="h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
          <div className="h-full w-1/3 bg-primary rounded-full animate-pulse" />
        </div>
        <p className="text-xs text-muted-foreground mt-2">Running diagnostics...</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        {onRetry && (
          <Button onClick={onRetry}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Try again
          </Button>
        )}
        <Button variant="outline" asChild>
          <a href="https://docs.seloraqa.com/support" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            Contact Support
          </a>
        </Button>
      </div>
    </div>
  );

  if (fullPage) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        {content}
      </div>
    );
  }

  return <Card className="p-8">{content}</Card>;
}
