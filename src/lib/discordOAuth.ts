import Discord from 'next-auth/providers/discord';

export const DISCORD_ISSUER = 'https://discord.com';
export const DISCORD_DISCOVERY_URL = `${DISCORD_ISSUER}/.well-known/openid-configuration`;

/**
 * Discord returns an RFC 9207 `iss` callback parameter. The built-in provider has no issuer, so
 * Auth.js would compare against its https://authjs.dev placeholder and reject every sign-in.
 */
export function discordProvider() {
  return Discord({ issuer: DISCORD_ISSUER });
}

export interface DiscordDiscoveryDocument {
  issuer?: unknown;
  authorization_endpoint?: unknown;
  token_endpoint?: unknown;
}

function endpointUrl(endpoint: unknown): string | undefined {
  if (typeof endpoint === 'string') return endpoint;
  if (endpoint && typeof endpoint === 'object' && 'url' in endpoint) {
    return typeof endpoint.url === 'string' ? endpoint.url : undefined;
  }
  return undefined;
}

/**
 * Compares the configured provider against Discord's published OAuth metadata. Userinfo is not
 * compared: Auth.js reads the profile from `/api/users/@me`, not the OIDC userinfo endpoint.
 */
export function findDiscordOAuthDrift(discovery: DiscordDiscoveryDocument): string[] {
  // Provider factories stash user overrides in `options`; Auth.js merges them at startup.
  const { options, ...defaults } = discordProvider();
  const provider = { ...defaults, ...options };
  const authorizationUrl = endpointUrl(provider.authorization)?.split('?')[0];
  const checks: Array<[string, unknown, string | undefined]> = [
    ['issuer', discovery.issuer, provider.issuer],
    ['authorization_endpoint', discovery.authorization_endpoint, authorizationUrl],
    ['token_endpoint', discovery.token_endpoint, endpointUrl(provider.token)],
  ];

  return checks.flatMap(([field, published, configured]) =>
    published === configured
      ? []
      : [`${field}: Discord publishes ${JSON.stringify(published)}, DraftOps uses ${configured}`],
  );
}
