import { AuthCard } from '@/components/auth-card';
import { LoginForm } from '@/components/login-form';

export default function LoginPage() {
  return (
    <main className="app-shell flex min-h-screen items-center justify-center px-6 py-12">
      <AuthCard
        eyebrow="Sprint 1"
        title="Sign in to Selora"
        description="Access workspace-scoped QA automation, role-aware settings, and the first authenticated SaaS shell for the platform."
      >
        <LoginForm />
      </AuthCard>
    </main>
  );
}