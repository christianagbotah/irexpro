'use client';

import Link from 'next/link';
import { AuthLayout, Alert } from '@/components/ui';

export default function AdminResetPasswordPage() {
  return (
    <AuthLayout title="Password reset" subtitle="Secure admin password recovery">
      <Alert variant="warning">
        Password reset is not yet enabled. Please use this page once a valid
        reset link has been issued by the verified backend recovery service.
      </Alert>
      <Alert variant="info">
        The backend password reset endpoints are being implemented in the next
        sprint. Once available, you will be able to set a new password using a
        secure reset link sent to your email.
      </Alert>
      <div className="auth-links mt-6">
        <Link href="/admin/login">Back to admin login</Link>
      </div>
    </AuthLayout>
  );
}
