import { AuthCard } from '@/components/auth-card';
import { ForgotPasswordForm } from '@/components/forgot-password-form';

export default function ForgotPasswordPage() {
  return (
    <main className="app-shell flex min-h-screen items-center justify-center px-6 py-12">
      <AuthCard
        eyebrow="Recovery"
        title="Reset access"
        description="Use the Mailpit-backed recovery flow to issue a single-use password reset link without exposing whether an account exists."
      >
        <ForgotPasswordForm />
      </AuthCard>
    </main>
  );
}