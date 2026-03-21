import Link from 'next/link';
import { redirect } from 'next/navigation';
import { WorkspaceSwitcher } from '@/components/workspace-switcher';
import { WorkspaceNav } from '@/components/workspace-nav';
import { getServerSession, getWorkspaceDetails } from '@/lib/server-session';

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const session = await getServerSession();

  if (!session) {
    redirect('/login');
  }

  const workspaceMemberships = session.memberships.filter((membership) => membership.workspaceId);
  const activeMembership = workspaceMemberships.find((membership) => membership.workspaceId === workspaceId);
  if (!activeMembership) {
    const fallbackWorkspaceId = workspaceMemberships[0]?.workspaceId;
    redirect(fallbackWorkspaceId ? `/app/${fallbackWorkspaceId}/dashboard` : '/login');
  }

  const workspace = await getWorkspaceDetails(workspaceId);
  if (!workspace) {
    redirect('/login');
  }

  return (
    <div className="app-shell relative min-h-dvh w-full bg-[var(--bg)]">
      <div className="grid min-h-dvh w-full md:grid-cols-[64px_minmax(0,1fr)]">
        <WorkspaceNav role={activeMembership.role} workspaceId={workspaceId} />

        <div className="flex min-h-dvh min-w-0 flex-col">
          <header className="border-b border-[var(--line)] bg-white px-5 py-3 md:px-10">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#999999]">Workspace</p>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <h1 className="text-lg font-semibold tracking-[-0.04em] text-black">{workspace.name}</h1>
                  <span className="font-mono text-[11px] text-[#999999]">/{workspace.slug}</span>
                </div>
              </div>

              <div className="flex flex-col items-start gap-2 text-left md:items-end md:text-right">
                <WorkspaceSwitcher activeWorkspaceId={workspaceId} workspaces={workspaceMemberships} />
                <div className="font-mono text-[11px] text-[#999999]">{session.user.email}</div>
              </div>
            </div>
          </header>

          <main className="flex-1 min-w-0 bg-[var(--bg)] px-5 py-5 md:px-10 md:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}