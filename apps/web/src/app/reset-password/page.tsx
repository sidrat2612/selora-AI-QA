import { AuthCard } from '@/components/auth-card';
import { ResetPasswordForm } from '@/components/reset-password-form';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="app-shell flex min-h-screen items-center justify-center px-6 py-12">
      <AuthCard
        eyebrow="Security"
        title="Choose a new password"
        description="Reset tokens are single-use and invalidate active sessions when the password changes."
      >
        <ResetPasswordForm token={params.token ?? null} />
      </AuthCard>
    </main>
  );
}