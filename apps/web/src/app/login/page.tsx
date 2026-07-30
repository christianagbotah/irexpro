export default function LoginPage() {
  return (
    <main className="page">
      <h1>Log in</h1>
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
          Authentication is handled by the backend at <code>/api/v1/auth/login</code>.
          The frontend never stores raw passwords and never uses localStorage for
          auth tokens.
        </p>
      </form>
    </main>
  );
}
