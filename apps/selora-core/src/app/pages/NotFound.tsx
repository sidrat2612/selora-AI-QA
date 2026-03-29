import { Link, useNavigate } from "react-router";
import { Home, ArrowLeft, Search, FlaskConical, TestTubes, Play, Sparkles } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { useState } from "react";

export function NotFound() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/tests?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-2xl overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-primary via-emerald-400 to-primary" />
        <div className="p-12">
          <div className="text-center">
            <div className="mb-8">
              <h1 className="text-8xl font-bold text-primary mb-4">404</h1>
              <h2 className="text-2xl font-semibold text-foreground mb-2">Page not found</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                The page may have been moved, deleted, or the URL might be incorrect.
              </p>
            </div>

            {/* Search */}
            <form onSubmit={handleSearch} className="mx-auto max-w-sm mb-8">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tests, suites, runs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </form>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
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

            {/* Quick Destinations */}
            <div className="pt-8 border-t">
              <p className="text-sm text-muted-foreground mb-4">Quick destinations</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Link to="/tests">
                  <Button variant="secondary" size="sm">
                    <FlaskConical className="mr-1.5 h-3.5 w-3.5" />
                    Tests
                  </Button>
                </Link>
                <Link to="/suites">
                  <Button variant="secondary" size="sm">
                    <TestTubes className="mr-1.5 h-3.5 w-3.5" />
                    Suites
                  </Button>
                </Link>
                <Link to="/runs">
                  <Button variant="secondary" size="sm">
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                    Runs
                  </Button>
                </Link>
                <Link to="/tests?q=ai">
                  <Button variant="secondary" size="sm" className="border-ai-accent/20 text-ai-accent">
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    AI Debugger
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
