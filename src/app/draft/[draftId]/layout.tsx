import { auth } from '@/auth';
import { redirect, notFound } from 'next/navigation';
import { getDraft } from '@/lib/draft';

export default async function DraftLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ draftId: string }>;
}) {
  const { draftId: draftIdStr } = await params;
  const draftId = parseInt(draftIdStr, 10);

  const session = await auth();
  if (!session) redirect(`/sign-in?callbackUrl=/draft/${draftIdStr}`);
  if (isNaN(draftId)) notFound();

  const draft = await getDraft(session.user.id, draftId);
  if (!draft) notFound();

  return <>{children}</>;
}
