# Auth & User Management — Design Spec

**Date:** 2026-06-26  
**Roadmap item:** #2 — Auth & User Management  
**Status:** Approved

---

## Goal

Gate the entire DraftOps app behind Discord sign-in using Auth.js (NextAuth v5) with the JWT session strategy. Every page requires authentication. Mutations (bid logging, watchlist, nominations) are independently guarded at the server action / API route level for defense-in-depth. The authenticated user's Discord ID is exposed on the session as `userId` so feature #3 can associate it with a `Draft.ownerId`.

---

## What this PR does NOT include

- Schema changes (no `userId` on any model — that's #3.1)
- Removing the hardcoded `'coreschke'` handle (that's #3.3)
- Guild membership gating (ETR Discord server check) — deferred, easy to add later
- Role or permission model — not needed at this scope
- Draft-level access control — comes with #3

---

## Tech choices

- **Library:** `next-auth@5` (Auth.js v5) — App Router-native; provides an `auth()` function that works identically in server components, server actions, and API routes
- **Provider:** Discord OAuth (`identify` scope only — no email, no guild check)
- **Session strategy:** JWT — no database adapter, keeps this PR parallel to #1 (Postgres migration)

---

## New files

### `auth.ts` (root)

Configures Auth.js: Discord provider, JWT strategy, and a `jwt` callback that copies `account.providerAccountId` onto the token as `token.discordId`. The `session` callback copies it to `session.user.id`.

Session shape exposed to the app:

```ts
session.user.id; // Discord user ID (snowflake string) — future Draft.ownerId
session.user.name; // Discord display name
session.user.image; // Discord avatar URL
```

### `middleware.ts` (root)

Re-exports `auth` as Next.js middleware with a route matcher that covers all routes except:

- `/sign-in` (the sign-in page itself)
- `/api/auth/*` (Auth.js callback endpoints)
- `/_next/*`, `/favicon.ico` (static assets)

Unauthenticated requests are redirected to `/sign-in`.

### `app/sign-in/page.tsx`

Server component. Calls `auth()` on load — if a session exists, redirects immediately to `/`. Otherwise renders a centered card:

- DraftOps wordmark (Barlow Condensed 700, `--text-primary`)
- "Sign in with Discord" button (`#5865F2` Discord brand blue) — calls `signIn('discord')` as a server action
- No other content

### `.env.local` (local only, gitignored)

Three required environment variables:

```
AUTH_SECRET=<random string, generate with `openssl rand -base64 32`>
AUTH_DISCORD_ID=<Discord OAuth app client ID>
AUTH_DISCORD_SECRET=<Discord OAuth app client secret>
```

---

## Changed files

### `src/lib/actions.ts`

Each of the three server actions (`logBid`, `updateBid`, `deleteBid`) gets an auth guard at the top:

```ts
const session = await auth();
if (!session) throw new Error('Unauthorized');
```

### `src/app/api/watchlist/route.ts`

POST and DELETE handlers each get an auth guard. API route handlers return a proper 401 response rather than throwing:

```ts
const session = await auth();
if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
```

The GET handler on `nomination-data` is covered by middleware and does not mutate data, so no action-level guard is added there.

### `src/app/api/nominated/route.ts`

POST and DELETE handlers each get the same 401 guard pattern.

### `src/components/NavBar/`

Add signed-in user display to the right side of the nav bar: Discord display name (`session.user.name`) and a "Sign out" link that calls `signOut()`. No avatar. Matches existing minimal nav style.

---

## Manual steps (outside the PR)

1. **Register a Discord OAuth application** at https://discord.com/developers/applications
   - Add redirect URI: `http://localhost:3000/api/auth/callback/discord` (dev)
   - Add redirect URI: `https://<production-domain>/api/auth/callback/discord` (prod, when deploying)
   - Copy Client ID and Client Secret into `.env.local`
2. **Generate `AUTH_SECRET`:** `openssl rand -base64 32`
3. For Vercel deployment: add all three env vars in the Vercel project settings

---

## What stays the same

- All four pages (`/`, `/teams`, `/budget`, `/nominate`) are unchanged in behavior — just gated
- `myHandle = 'coreschke'` stays hardcoded until #3.3
- SQLite adapter unchanged — this PR is parallel to #1
- No new DB migrations

---

## Success criteria

- Unauthenticated visit to any route → redirected to `/sign-in`
- Sign in with Discord → redirected back to the page originally requested (or `/`)
- `session.user.id` is the Discord snowflake ID (verified in a `console.log` or quick test)
- Direct POST to `/api/watchlist` without a session → 401
- Sign out → session cleared, next page load redirects to `/sign-in`
- `make check` passes (typecheck + lint + format + tests)
