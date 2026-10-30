import { DISCORD_DISCOVERY_URL, findDiscordOAuthDrift } from '@/lib/discordOAuth';

/**
 * Scheduled contract check: fails when Discord's published OAuth metadata no longer matches the
 * provider config, so drift surfaces in CI before it surfaces as a broken sign-in.
 */
async function main(): Promise<void> {
  const response = await fetch(DISCORD_DISCOVERY_URL);
  if (!response.ok) {
    throw new Error(`Discord discovery request failed: ${response.status} ${response.statusText}`);
  }

  const drift = findDiscordOAuthDrift(await response.json());
  if (drift.length > 0) {
    console.error(`Discord OAuth config drift (${DISCORD_DISCOVERY_URL}):`);
    for (const line of drift) console.error(`  - ${line}`);
    process.exitCode = 1;
    return;
  }

  console.log('Discord OAuth config matches published metadata.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
