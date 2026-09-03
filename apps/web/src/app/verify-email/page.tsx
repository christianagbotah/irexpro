import VerifyEmailClient from './verify-email-client';

interface VerifyEmailPageProps {
  searchParams: Promise<{
    token?: string | string[];
    verified?: string | string[];
  }>;
}

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const params = await searchParams;
  const token = typeof params.token === 'string' ? params.token : null;
  const alreadyVerified = params.verified === '1';

  return <VerifyEmailClient token={token} alreadyVerified={alreadyVerified} />;
}
