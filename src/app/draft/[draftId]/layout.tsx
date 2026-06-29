import { auth } from '@/auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/db';

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

  const draft = await prisma.draft.findFirst({
    where: { id: draftId, ownerId: session.user.id },
  });
  if (!draft) notFound();

  return <>{children}</>;
}
