import NominationHelper from '@/components/NominationHelper';

export const metadata = { title: 'Nominate — DraftOps' };

export default async function NominatePage({ params }: { params: Promise<{ draftId: string }> }) {
  const draftId = parseInt((await params).draftId, 10);
  return <NominationHelper draftId={draftId} />;
}
