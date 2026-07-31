/**
 * (auth) route group layout — public admin auth pages.
 *
 * This layout intentionally renders ONLY children with NO sidebar, NO admin
 * nav, and NO dashboard shell. It wraps the public admin auth routes:
 *   - /admin/login
 *   - /admin/forgot-password
 *   - /admin/reset-password
 *
 * Hotfix: previously these routes were wrapped by the admin dashboard layout
 * (app/admin/layout.tsx) which rendered the sidebar + AdminNav for ALL
 * /admin/* routes — including login. This meant unauthenticated users saw the
 * full admin sidebar on the login page, and the "Go to admin login" button on
 * the dashboard opened login while the sidebar stayed visible.
 *
 * Next.js App Router route groups (parenthesized folder names) do NOT affect
 * the URL path, so /admin/login remains /admin/login. The (auth) group simply
 * uses a different layout from the (protected) group.
 *
 * This layout is a server component (no 'use client') so it renders before
 * the client AuthProvider hydrates — no sidebar flicker.
 */
export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
