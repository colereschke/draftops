import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import SignInScreen from '@/components/SignIn/SignInScreen';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const [session, params] = await Promise.all([auth(), searchParams]);
  if (session) redirect('/');

  const raw = params.callbackUrl ?? '/';
  const callbackUrl = raw.startsWith('/') ? raw : '/';

  return <SignInScreen callbackUrl={callbackUrl} />;
}
