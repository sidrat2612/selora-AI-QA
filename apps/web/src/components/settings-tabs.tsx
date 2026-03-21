'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SETTINGS_LINKS = [
  { label: 'Execution', href: 'execution' },
  { label: 'Members', href: 'members' },
  { label: 'Environments', href: 'environments' },
  { label: 'Retention', href: 'retention' },
  { label: 'Quotas', href: 'quotas' },
  { label: 'Lifecycle', href: 'lifecycle' },
];

export function SettingsTabs({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
      {SETTINGS_LINKS.map((item) => (
        <Link
          key={item.href}
          href={`/app/${workspaceId}/settings/${item.href}`}
          className={
            pathname?.endsWith(`/settings/${item.href}`)
              ? 'inline-flex items-center border border-[var(--brand)] bg-[var(--brand)] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-white'
              : 'inline-flex items-center border border-[var(--line)] bg-white px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--muted)]'
          }
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}