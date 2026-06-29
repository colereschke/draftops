import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getActiveDraftsForUser } from '@/lib/draft';

export default async function RootPage() {
  const session = await auth();
  if (!session) redirect('/sign-in');

  const activeDrafts = await getActiveDraftsForUser(session.user.id);
  if (activeDrafts.length === 1) {
    redirect(`/draft/${activeDrafts[0].id}`);
  }
  redirect('/drafts');
}
