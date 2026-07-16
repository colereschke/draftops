import { resetTestDatabase } from './scripts/testDatabase';

export default async function globalSetup(): Promise<void> {
  await resetTestDatabase();
}
