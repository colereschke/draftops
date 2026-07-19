import { prisma } from '../db';
import { E2E_TEST_USER_ID } from '../env';

export async function getSeededDraftId(): Promise<number> {
  const draft = await prisma.draft.findFirstOrThrow({ where: { ownerId: E2E_TEST_USER_ID } });
  return draft.id;
}
