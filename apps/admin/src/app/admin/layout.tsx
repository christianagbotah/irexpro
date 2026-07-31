'use client';

import AdminNav from '@/components/admin-nav';
import { useAuth } from '@/context/auth-context';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, logout, loading } = useAuth();

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <h2>iRexPro Admin</h2>
        <AdminNav />
        <div className="sidebar-user">
          {user ? (
            <>
              <p className="muted sidebar-user-email">{user.email}</p>
              <p>
                <button
                  className="btn btn-sm"
                  type="button"
                  onClick={() => logout()}
                  disabled={loading}
                >
                  {loading ? '…' : 'Log out'}
                </button>
              </p>
            </>
          ) : (
            <p className="muted">Not signed in</p>
          )}
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
