import { AuthCard } from '@/components/auth-card';
import { VerifyEmailForm } from '@/components/verify-email-form';

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="app-shell flex min-h-screen items-center justify-center px-6 py-12">
      <AuthCard
        eyebrow="Verification"
        title="Activate your invite"
        description="Email verification is required before login, and the token lifecycle is enforced on the server."
      >
        <VerifyEmailForm token={params.token ?? null} />
      </AuthCard>
    </main>
  );
}