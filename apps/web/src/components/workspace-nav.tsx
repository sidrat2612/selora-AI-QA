'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FlaskConical, Hexagon, LayoutDashboard, MessageSquare, Play, Settings, Shield } from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Dashboard', href: 'dashboard', icon: LayoutDashboard },
  { label: 'Tests', href: 'tests', icon: FlaskConical },
  { label: 'Runs', href: 'runs', icon: Play },
  { label: 'Feedback', href: 'feedback', icon: MessageSquare },
  { label: 'Settings', href: 'settings/members', icon: Settings },
  { label: 'Audit', href: 'audit', icon: Shield },
];

export function WorkspaceNav({ role, workspaceId }: { role: string; workspaceId: string }) {
  const pathname = usePathname();

  return (
    <aside className="flex min-h-screen flex-col items-center gap-6 border-r border-[var(--line)] bg-black px-0 py-5">
      <div className="flex h-10 w-10 items-center justify-center text-white">
        <Hexagon className="h-5 w-5" strokeWidth={1.75} />
      </div>

      <nav className="flex w-full flex-1 flex-col items-center gap-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const href = `/app/${workspaceId}/${item.href}`;
          const isActive = pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={item.href}
              aria-label={item.label}
              className={
                isActive
                  ? 'flex h-10 w-10 items-center justify-center border border-[#2a2a2a] bg-[#111111] text-white transition'
                  : 'flex h-10 w-10 items-center justify-center border border-transparent text-[#666666] transition hover:border-[#2a2a2a] hover:text-white'
              }
              href={href}
              title={item.label}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </Link>
          );
        })}
      </nav>

      <div className="rotate-180 [writing-mode:vertical-rl] text-[10px] uppercase tracking-[0.18em] text-[#777777]">
        {role}
      </div>
    </aside>
  );
}