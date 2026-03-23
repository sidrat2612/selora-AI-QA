import { Loader2 } from "lucide-react";
import { Card } from "./ui/card";

interface LoadingStateProps {
  message?: string;
  fullPage?: boolean;
}

export function LoadingState({ message = "Loading...", fullPage = false }: LoadingStateProps) {
  const content = (
    <div className="text-center py-12">
      <Loader2 className="h-8 w-8 text-primary animate-spin mx-auto mb-4" />
      <p className="text-sm text-muted-foreground">{message}</p>
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
