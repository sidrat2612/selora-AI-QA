'use client';

import { startTransition, useState } from 'react';
import { buildApiUrl, membershipInviteSchema, parseApiResponse } from '@/lib/api';
import type { Membership, MembershipRole } from '@/lib/types';

const MANAGEABLE_ROLES: MembershipRole[] = ['TENANT_ADMIN', 'WORKSPACE_OPERATOR', 'WORKSPACE_VIEWER'];

export function MembersSettingsClient({
  workspaceId,
  initialMemberships,
  canManage,
}: {
  workspaceId: string;
  initialMemberships: Membership[];
  canManage: boolean;
}) {
  const [memberships, setMemberships] = useState(initialMemberships);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<MembershipRole>('WORKSPACE_OPERATOR');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function inviteMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) {
      return;
    }

    const result = membershipInviteSchema.safeParse({
      email: inviteEmail,
      name: inviteName,
      role: inviteRole,
    });

    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Invite details are invalid.');
      return;
    }

    const tempMembership: Membership = {
      id: `temp-${Date.now()}`,
      tenantId: memberships[0]?.tenantId ?? 'pending',
      workspaceId,
      role: inviteRole,
      status: 'INVITED',
      userId: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      user: {
        id: 'pending',
        email: inviteEmail,
        name: inviteName,
        status: 'INVITED',
      },
    };

    const previous = memberships;
    setSubmitting(true);
    setError(null);
    setMemberships((current) => [tempMembership, ...current]);

    try {
      const created = await parseApiResponse<Membership>(
        await fetch(buildApiUrl(`/workspaces/${workspaceId}/memberships`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(result.data),
        }),
      );

      startTransition(() => {
        setMemberships((current) => current.map((item) => (item.id === tempMembership.id ? created : item)));
      });
      setInviteEmail('');
      setInviteName('');
      setInviteRole('WORKSPACE_OPERATOR');
    } catch (submitError) {
      setMemberships(previous);
      setError(submitError instanceof Error ? submitError.message : 'Unable to add member.');
    } finally {
      setSubmitting(false);
    }
  }

  async function updateRole(membershipId: string, nextRole: MembershipRole) {
    if (!canManage) {
      return;
    }

    const previous = memberships;
    setError(null);
    setMemberships((current) => current.map((item) => (item.id === membershipId ? { ...item, role: nextRole } : item)));

    try {
      const updated = await parseApiResponse<Membership>(
        await fetch(buildApiUrl(`/workspaces/${workspaceId}/memberships/${membershipId}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ role: nextRole }),
        }),
      );

      setMemberships((current) => current.map((item) => (item.id === membershipId ? updated : item)));
    } catch (submitError) {
      setMemberships(previous);
      setError(submitError instanceof Error ? submitError.message : 'Unable to update role.');
    }
  }

  async function revokeMembership(membershipId: string) {
    if (!canManage) {
      return;
    }

    const previous = memberships;
    setError(null);
    setMemberships((current) => current.filter((item) => item.id !== membershipId));

    try {
      await parseApiResponse<{ revoked: boolean }>(
        await fetch(buildApiUrl(`/workspaces/${workspaceId}/memberships/${membershipId}`), {
          method: 'DELETE',
          credentials: 'include',
        }),
      );
    } catch (submitError) {
      setMemberships(previous);
      setError(submitError instanceof Error ? submitError.message : 'Unable to revoke membership.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-none p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Memberships</p>
            <h2 className="section-title text-2xl font-semibold">Team access</h2>
          </div>
          <span className="status-pill">{memberships.length} active records</span>
        </div>

        {canManage ? (
          <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.2fr_1fr_0.9fr_auto]" onSubmit={inviteMember}>
            <input className="form-input" placeholder="Email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} />
            <input className="form-input" placeholder="Full name" value={inviteName} onChange={(event) => setInviteName(event.target.value)} />
            <select className="form-select" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as MembershipRole)}>
              {MANAGEABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <button className="primary-button" disabled={submitting} type="submit">
              {submitting ? 'Inviting...' : 'Invite'}
            </button>
          </form>
        ) : (
          <p className="text-sm text-[var(--muted)]">View-only access — membership changes are disabled.</p>
        )}

        {error ? <p className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}
      </div>

      <div className="space-y-4">
        {memberships.length === 0 ? <div className="empty-state">No team members have been added to this workspace yet.</div> : null}
        {memberships.map((membership) => (
          <div key={membership.id} className="glass-panel flex flex-col gap-4 rounded-none p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-lg font-semibold">{membership.user.name}</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#999999]">{membership.user.email}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="status-pill">{membership.status}</span>
              <select
                className="form-select min-w-52"
                disabled={!canManage}
                value={membership.role}
                onChange={(event) => updateRole(membership.id, event.target.value as MembershipRole)}
              >
                {MANAGEABLE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              {canManage ? (
                <button className="danger-button" type="button" onClick={() => revokeMembership(membership.id)}>
                  Revoke
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}