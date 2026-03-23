import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { CheckCircle2, XCircle, Loader2, Mail } from "lucide-react";
import { auth as authApi } from "../../../lib/api-client";

export function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const token = searchParams.get("token");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }
    authApi.verifyEmail(token)
      .then(() => setStatus("success"))
      .catch(() => setStatus("error"));
  }, [token]);

  const handleResend = () => {
    // Resend would require the user's email - not available from token alone
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md p-8">
          <div className="text-center">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Loader2 className="h-6 w-6 text-primary animate-spin" />
            </div>
            <h1 className="text-2xl font-semibold text-foreground mb-2">Verifying your email</h1>
            <p className="text-sm text-muted-foreground">
              Please wait while we verify your email address...
            </p>
          </div>
        </Card>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md p-8">
          <div className="text-center">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl font-semibold text-foreground mb-2">Email verified!</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Your email has been successfully verified. You can now sign in to your account.
            </p>
            <Link to="/auth/login">
              <Button className="w-full">
                Continue to sign in
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md p-8">
        <div className="text-center">
          <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
            <XCircle className="h-6 w-6 text-destructive" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground mb-2">Verification failed</h1>
          <p className="text-sm text-muted-foreground mb-6">
            This verification link is invalid or has expired. Please request a new verification email.
          </p>
          <div className="space-y-3">
            <Button onClick={handleResend} className="w-full">
              <Mail className="mr-2 h-4 w-4" />
              Resend verification email
            </Button>
            <Link to="/auth/login">
              <Button variant="outline" className="w-full">
                Back to login
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
