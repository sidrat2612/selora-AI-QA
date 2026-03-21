'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { SessionMembership } from '@/lib/types';

export function WorkspaceSwitcher({
  activeWorkspaceId,
  workspaces,
}: {
  activeWorkspaceId: string;
  workspaces: SessionMembership[];
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <label className="space-y-2 text-[11px] uppercase tracking-[0.12em] text-[#999999]">
      Workspace
      <select
        className="form-select min-w-[220px] bg-white text-[11px] normal-case tracking-normal text-black"
        value={activeWorkspaceId}
        onChange={(event) => {
          const parts = pathname.split('/');
          parts[2] = event.target.value;
          router.push(parts.join('/'));
        }}
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.workspaceId ?? ''}>
            {workspace.workspaceName ?? workspace.workspaceSlug ?? workspace.workspaceId}
          </option>
        ))}
      </select>
    </label>
  );
}