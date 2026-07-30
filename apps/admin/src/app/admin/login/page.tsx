export default function AdminLoginPage() {
  return (
    <main className="content" style={{ maxWidth: 420, margin: '4rem auto' }}>
      <h1>Admin login</h1>
      <form className="card" action="/api/v1/auth/login" method="POST">
        <p>
          <label>
            Email
            <br />
            <input name="email" type="email" required autoComplete="email" />
          </label>
        </p>
        <p>
          <label>
            Password
            <br />
            <input name="password" type="password" required autoComplete="current-password" />
          </label>
        </p>
        <p>
          <button className="btn" type="submit">
            Log in
          </button>
        </p>
        <p className="muted">
          Admin access requires ADMIN or SUPER_ADMIN role. The backend enforces
          RBAC via RolesGuard on all admin endpoints.
        </p>
      </form>
    </main>
  );
}
