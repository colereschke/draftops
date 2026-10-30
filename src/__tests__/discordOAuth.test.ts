import {
  DISCORD_ISSUER,
  type DiscordDiscoveryDocument,
  findDiscordOAuthDrift,
} from '@/lib/discordOAuth';

// The real provider is ESM-only; this mirrors its factory shape (overrides kept in `options`).
// `pnpm auth:check-discord` exercises the real provider against live metadata.
jest.mock('next-auth/providers/discord', () => ({
  __esModule: true,
  default: (options: Record<string, unknown>) => ({
    id: 'discord',
    type: 'oauth',
    authorization: {
      url: 'https://discord.com/api/oauth2/authorize',
      params: { scope: 'identify email' },
    },
    token: 'https://discord.com/api/oauth2/token',
    userinfo: 'https://discord.com/api/users/@me',
    options,
  }),
}));

const PUBLISHED: DiscordDiscoveryDocument = {
  issuer: 'https://discord.com',
  authorization_endpoint: 'https://discord.com/api/oauth2/authorize',
  token_endpoint: 'https://discord.com/api/oauth2/token',
};

describe('findDiscordOAuthDrift', () => {
  it('reports no drift when the provider matches Discord metadata', () => {
    expect(findDiscordOAuthDrift(PUBLISHED)).toEqual([]);
  });

  it('reports an issuer the provider does not use', () => {
    expect(findDiscordOAuthDrift({ ...PUBLISHED, issuer: 'https://discord.gg' })).toEqual([
      `issuer: Discord publishes "https://discord.gg", DraftOps uses ${DISCORD_ISSUER}`,
    ]);
  });

  it('reports moved authorization and token endpoints', () => {
    const drift = findDiscordOAuthDrift({
      ...PUBLISHED,
      authorization_endpoint: 'https://discord.com/oauth2/authorize',
      token_endpoint: 'https://discord.com/api/v11/oauth2/token',
    });

    expect(drift).toHaveLength(2);
    expect(drift[0]).toMatch(/^authorization_endpoint:/);
    expect(drift[1]).toMatch(/^token_endpoint:/);
  });

  it('reports missing metadata fields', () => {
    expect(findDiscordOAuthDrift({})).toHaveLength(3);
  });
});
