import { Link } from "react-router";
import { Home, ArrowLeft, Search } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";

export function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-2xl p-12">
        <div className="text-center">
          <div className="mb-6">
            <h1 className="text-9xl font-bold text-primary mb-2">404</h1>
            <h2 className="text-2xl font-semibold text-foreground mb-2">Page not found</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Sorry, we couldn't find the page you're looking for. The page may have been moved, deleted, or the URL might be incorrect.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/">
              <Button>
                <Home className="mr-2 h-4 w-4" />
                Go to Dashboard
              </Button>
            </Link>
            <Button variant="outline" onClick={() => window.history.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>
          </div>

          <div className="mt-12 pt-8 border-t">
            <p className="text-sm text-muted-foreground mb-4">Need help? Try one of these:</p>
            <div className="grid sm:grid-cols-3 gap-3 text-sm">
              <Link to="/tests" className="text-primary hover:underline">
                Browse Tests
              </Link>
              <Link to="/suites" className="text-primary hover:underline">
                View Suites
              </Link>
              <Link to="/runs" className="text-primary hover:underline">
                Check Runs
              </Link>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
