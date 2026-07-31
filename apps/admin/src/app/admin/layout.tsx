'use client';

import AdminNav, { AdminSidebarUser } from '@/components/admin-nav';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="sidebar__logo">
          <span className="auth-layout__logo-mark" style={{ width: 36, height: 36, fontSize: '1rem' }}>iR</span>
          iRexPro Admin
        </div>
        <AdminNav />
        <AdminSidebarUser />
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
