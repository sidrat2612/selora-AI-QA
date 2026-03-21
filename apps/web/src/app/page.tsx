import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/server-session';

export default async function Home() {
  const session = await getServerSession();
  const workspaceId =
    session?.activeWorkspace?.id ?? session?.memberships.find((membership) => membership.workspaceId)?.workspaceId;

  if (!session || !workspaceId) {
    redirect('/login');
  }

  redirect(`/app/${workspaceId}/dashboard`);
}
