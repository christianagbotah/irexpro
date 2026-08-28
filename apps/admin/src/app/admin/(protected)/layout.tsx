'use client';

import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import AdminNav, { AdminSidebarUser } from '@/components/admin-nav';
import AdminMobileBottomNav from '@/components/mobile-bottom-nav';
import { Alert, Button } from '@/components/ui';
import { formatEnumLabel } from '@irexpro/types';

/**
 * (protected) route group layout — authenticated admin shell.
 *
 * This layout wraps ALL protected admin routes:
 *   - /admin/dashboard
 *   - /admin/users
 *   - /admin/brokers
 *   - /admin/payments

 *   - /admin/audit
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
 *
 * ── Access denied layout hotfix (post-Sprint-31) ───────────────────────────
 * Previously the access-denied/not-signed-in branches rendered inside
 * `.admin-shell` (grid-template-columns: 240px 1fr) with no sidebar. The
 * empty 240px column pushed `.content` right, but the card's `margin: auto`
 * centered within the 1fr column only — leaving the h1 far-left and the
 * card off-center, producing a tiny left-aligned content block on desktop.
 *
 * These branches now use `.access-denied-shell` — a dedicated full-viewport
 * flex container that centers the card BOTH horizontally and vertically with
 * a sensible max-width. The h1 moves inside the card so the whole panel is
 * balanced. Mobile keeps a stacked layout via CSS. Authorization behavior
 * is unchanged; only presentation.
 *
 * Role labels are humanized via formatEnumLabel (SUPER_ADMIN → "Super Admin")
 * for presentation only; the backend RolesGuard continues using the raw
 * enum values.
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

  // 2. Not authenticated — clean login prompt, NO sidebar.
  //    Uses .access-denied-shell so the card is centered on desktop/tablet
  //    (not left-aligned in a 240px-offset grid column).
  if (!user) {
    return (
      <div className="access-denied-shell">
        <main className="content access-denied-shell__content">
          <div className="card access-denied-card">
            <h1 className="access-denied-card__title">Admin</h1>
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

  // 3. Authenticated but lacks admin role — access denied, NO sidebar.
  //    Uses .access-denied-shell so the card is centered on desktop/tablet
  //    (not left-aligned in a 240px-offset grid column). Role labels are
  //    humanized for presentation; the backend RolesGuard is unchanged.
  if (!hasAdminRole) {
    const humanRoles = (user.roles ?? []).map((r) => formatEnumLabel(r)).join(', ') || 'none';
    return (
      <div className="access-denied-shell">
        <main className="content access-denied-shell__content">
          <div className="card access-denied-card">
            <h1 className="access-denied-card__title">Access denied</h1>
            <h2 className="card__title">Insufficient permissions</h2>
            <Alert variant="error">
              Your account does not have an admin role. You are signed in as{' '}
              <code>{user.email ?? user.phone ?? 'unknown'}</code> with roles:{' '}
              <code>{humanRoles}</code>.
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
