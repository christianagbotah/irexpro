'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui';

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
  return (
    <nav>
      {NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={pathname === item.href ? 'active' : ''}
        >
          <span>{item.icon}</span> {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function AdminSidebarUser() {
  const { user, logout, loading } = useAuth();

  if (!user) {
    return (
      <div className="sidebar__user">
        <p className="sidebar__user-email">Not signed in</p>
        <Link href="/admin/login" className="btn btn--secondary btn--sm btn--block">Sign in</Link>
      </div>
    );
  }

  return (
    <div className="sidebar__user">
      <p className="sidebar__user-email">{user.email}</p>
      <Button variant="ghost" size="sm" block onClick={() => logout()} disabled={loading}>
        {loading ? '…' : 'Log out'}
      </Button>
    </div>
  );
}
