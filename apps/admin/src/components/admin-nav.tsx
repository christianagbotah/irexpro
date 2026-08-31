'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui';
import type { ComponentType } from 'react';
import type { IconProps } from '@/components/icons';
import {
  DashboardIcon,
  UsersIcon,
  PaymentsIcon,
  PlugIcon,
  AuditIcon,
} from '@/components/icons';

/**
 * Admin desktop sidebar navigation items.
 *
 * Sprint 31 remediation: emoji icons replaced with professional SVG icons
 * (apps/admin/src/components/icons.tsx) for deterministic cross-platform
 * rendering. The mobile bottom nav (apps/admin/src/components/mobile-bottom-nav.tsx)
 * uses the same icon set.
 *
 * Hotfix: these are only rendered inside the (protected) layout, which already
 * gates on hasAdminRole. But AdminNav also checks hasAdminRole as defense in
 * depth — if it is ever rendered in a non-admin context, it renders nothing.
 *
 * The backend RolesGuard is the real security boundary. This visual hiding is
 * a UX concern, not a security control.
 */
const NAV: Array<{ href: string; label: string; Icon: ComponentType<IconProps> }> = [
  { href: '/admin/dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { href: '/admin/users', label: 'Users', Icon: UsersIcon },
  { href: '/admin/account-appeals', label: 'Account Reviews', Icon: UsersIcon },
  // Subscription-retirement (SUBSCRIPTION-RETIREMENT-IMPL):
  // SubscriptionsModule is retired. The nav item is renamed "Performance Fees"
  // and points to a placeholder route until the dedicated admin view lands.

  { href: '/admin/payments', label: 'Payments', Icon: PaymentsIcon },
  { href: '/admin/brokers', label: 'Brokers', Icon: PlugIcon },
  { href: '/admin/audit', label: 'Audit Log', Icon: AuditIcon },
];

export default function AdminNav() {
  const pathname = usePathname();
  const { hasAdminRole } = useAuth();

  // Defense in depth: the (protected) layout already prevents this component
  // from rendering for non-admins. But if it ever does, render nothing.
  if (!hasAdminRole) return null;

  return (
    <nav aria-label="Admin navigation">
      {NAV.map((item) => {
        const { Icon } = item;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={pathname === item.href ? 'active' : ''}
            aria-current={pathname === item.href ? 'page' : undefined}
          >
            <span aria-hidden="true"><Icon size={18} /></span> {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminSidebarUser() {
  const { user, logout, loading, hasAdminRole } = useAuth();

  // If there's no user, the (protected) layout shows the "Not signed in" card
  // and does not render the sidebar at all. This branch is a safety net.
  if (!user || !hasAdminRole) {
    return null;
  }

  return (
    <div className="sidebar__user">
      <p className="sidebar__user-email">{user.email ?? user.phone}</p>
      <Button variant="ghost" size="sm" block onClick={() => logout()} disabled={loading}>
        {loading ? '…' : 'Log out'}
      </Button>
    </div>
  );
}
