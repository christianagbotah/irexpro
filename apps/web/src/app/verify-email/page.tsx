import VerifyEmailClient from './verify-email-client';

interface VerifyEmailPageProps {
  searchParams: Promise<{
    verified?: string | string[];
  }>;
}

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const params = await searchParams;
  const alreadyVerified = params.verified === '1';

  return <VerifyEmailClient alreadyVerified={alreadyVerified} />;
}
