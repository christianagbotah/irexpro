import AdminNav from '@/components/admin-nav';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <h2>iRexPro Admin</h2>
        <AdminNav />
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
