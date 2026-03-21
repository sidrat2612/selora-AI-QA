import { redirect } from 'next/navigation';
import { FeedbackClient } from '@/components/feedback-client';
import { getFeedback, getServerSession } from '@/lib/server-session';

export default async function FeedbackPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const session = await getServerSession();

  if (!session) {
    redirect('/login');
  }

  const membership = session.memberships.find((item) => item.workspaceId === workspaceId);
  if (!membership) {
    redirect('/login');
  }

  const feedback = await getFeedback(workspaceId);
  const canManage = membership.role === 'PLATFORM_ADMIN' || membership.role === 'TENANT_ADMIN' || membership.role === 'WORKSPACE_OPERATOR';

  return <FeedbackClient workspaceId={workspaceId} initialFeedback={feedback} canManage={canManage} />;
}