import { Component, type ErrorInfo, type ReactNode } from "react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // In production, this would send to an error tracking service (Sentry, etc.)
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error("ErrorBoundary caught:", error, info.componentStack);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
          <Card className="w-full max-w-lg p-8">
            <div className="text-center">
              <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <h1 className="text-2xl font-semibold text-foreground mb-2">
                Something went wrong
              </h1>
              <p className="text-sm text-muted-foreground mb-6">
                An unexpected error occurred. Please try again or contact support if the problem persists.
              </p>
              {import.meta.env.DEV && this.state.error && (
                <pre className="mb-4 p-3 bg-muted rounded text-xs text-left overflow-auto max-h-40">
                  {this.state.error.message}
                </pre>
              )}
              <div className="flex gap-3 justify-center">
                <Button onClick={this.handleReset} variant="outline">
                  Try Again
                </Button>
                <Button onClick={() => (window.location.href = "/")}>
                  Go to Dashboard
                </Button>
              </div>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
