'use client';

import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import AdminNav, { AdminSidebarUser } from '@/components/admin-nav';
import AdminMobileBottomNav from '@/components/mobile-bottom-nav';
import { Alert, Button } from '@/components/ui';

/**
 * (protected) route group layout — authenticated admin shell.
 *
 * This layout wraps ALL protected admin routes:
 *   - /admin/dashboard
 *   - /admin/users
 *   - /admin/brokers
 *   - /admin/payments
 *   - /admin/subscriptions
 *   - /admin/audit
 *
 * Hotfix: previously app/admin/layout.tsx wrapped EVERY /admin/* route
 * (including /admin/login) with the sidebar. Now the sidebar only appears
 * here, inside the (protected) group.
 *
 * Three-state guard (mirrors the dashboard page logic, but at the layout
 * level so every protected page inherits it):
 *
 *  1. restoring === true  → show a loading state, NOT the sidebar, NOT
 *     "Not signed in". This prevents the sidebar from flashing during the
 *     /auth/refresh call on mount.
 *
 *  2. restoring === false && !user → user is definitely not authenticated.
 *     Show a clean "Not signed in" card with a link to /admin/login. No
 *     sidebar, no nav menu.
 *
 *  3. restoring === false && user && !hasAdminRole → user is signed in but
 *     lacks ADMIN/SUPER_ADMIN. Show "Access denied". No sidebar. The
 *     backend RolesGuard will also reject their API calls with 403.
 *
 *  4. restoring === false && user && hasAdminRole → render the full admin
 *     shell (sidebar + nav + content). Only this branch shows the sidebar.
 *
 * The sidebar itself (AdminNav) is also role-aware: it only renders nav
 * items when hasAdminRole is true (defense in depth, though this layout
 * already prevents the sidebar from showing otherwise).
 */
export default function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, restoring, hasAdminRole, logout, loading } = useAuth();

  // 1. Session restore in progress — show loading, not sidebar, not "not signed in"
  if (restoring) {
    return (
      <div className="admin-shell admin-shell--loading">
        <main className="content">
          <h1>Admin</h1>
          <p className="muted">Restoring session…</p>
        </main>
      </div>
    );
  }

  // 2. Not authenticated — clean login prompt, NO sidebar
  if (!user) {
    return (
      <div className="admin-shell admin-shell--not-signed-in">
        <main className="content">
          <h1>Admin</h1>
          <div className="card" style={{ maxWidth: 420, margin: '2rem auto' }}>
            <h2 className="card__title">Not signed in</h2>
            <p className="muted" style={{ marginBottom: '1rem' }}>
              You need to sign in with an admin account to view this page.
            </p>
            <Link href="/admin/login" className="btn btn--primary btn--block">
              Go to admin login
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // 3. Authenticated but lacks admin role — access denied, NO sidebar
  if (!hasAdminRole) {
    return (
      <div className="admin-shell admin-shell--access-denied">
        <main className="content">
          <h1>Access denied</h1>
          <div className="card" style={{ maxWidth: 520, margin: '2rem auto' }}>
            <h2 className="card__title">Insufficient permissions</h2>
            <Alert variant="error">
              Your account does not have an admin role. You are signed in as{' '}
              <code>{user.email ?? user.phone ?? 'unknown'}</code> with roles:{' '}
              <code>{user.roles?.join(', ') || 'none'}</code>.
            </Alert>
            <p className="muted" style={{ marginTop: '1rem' }}>
              The backend RolesGuard will also reject your requests with 403.
              Contact a super-admin if you believe this is an error.
            </p>
            <Button
              variant="secondary"
              block
              onClick={() => logout()}
              loading={loading}
              style={{ marginTop: '1rem' }}
            >
              Sign out
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // 4. Authenticated admin — full admin shell with sidebar
  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="sidebar__logo">
          <span className="auth-layout__logo-mark" style={{ width: 36, height: 36, fontSize: '1rem' }}>
            iR
          </span>
          iRexPro Admin
        </div>
        <AdminNav />
        <AdminSidebarUser />
      </aside>
      <main className="content">{children}</main>
      {/*
        Sprint 31: admin mobile bottom navigation. Hidden on desktop/tablet
        via CSS (.mobile-bottom-nav is display:none above 700px). Rendered
        here so every authenticated admin page gets the same mobile nav
        without per-page wiring. The desktop sidebar remains the primary
        navigation on tablet/desktop. Safe-area-aware.
      */}
      <AdminMobileBottomNav onLogout={logout} />
    </div>
  );
}
