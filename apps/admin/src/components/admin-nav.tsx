'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui';

/**
 * Admin navigation items.
 *
 * Hotfix: these are only rendered inside the (protected) layout, which already
 * gates on hasAdminRole. But AdminNav also checks hasAdminRole as defense in
 * depth — if it is ever rendered in a non-admin context, it renders nothing.
 *
 * The backend RolesGuard is the real security boundary. This visual hiding is
 * a UX concern, not a security control.
 */
const NAV = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/admin/users', label: 'Users', icon: '👥' },
  { href: '/admin/subscriptions', label: 'Subscriptions', icon: '📋' },
  { href: '/admin/payments', label: 'Payments', icon: '💳' },
  { href: '/admin/brokers', label: 'Brokers', icon: '🔌' },
  { href: '/admin/audit', label: 'Audit Log', icon: '📜' },
];

export default function AdminNav() {
  const pathname = usePathname();
  const { hasAdminRole } = useAuth();

  // Defense in depth: the (protected) layout already prevents this component
  // from rendering for non-admins. But if it ever does, render nothing.
  if (!hasAdminRole) return null;

  return (
    <nav aria-label="Admin navigation">
      {NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={pathname === item.href ? 'active' : ''}
          aria-current={pathname === item.href ? 'page' : undefined}
        >
          <span aria-hidden="true">{item.icon}</span> {item.label}
        </Link>
      ))}
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
