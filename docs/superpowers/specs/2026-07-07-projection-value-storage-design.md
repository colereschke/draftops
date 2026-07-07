# Projection Value Storage Design

## Problem

The initial #5e implementation stored projection-derived outputs directly on `Player`. That was a
useful implementation shortcut, but it weakens the data-layer principle in the roadmap: identity,
rankings, projections, league settings, and draft state should stay separate.

`Player` should remain the per-draft player/value row seeded from rankings and linked to Sleeper
identity. Projection data and draft-specific projection valuations need their own tables so future
projection sources, custom rankings, and value blending do not require another schema reversal.

## Decision

Move projection-derived data out of `Player`.

`Player` keeps only `sleeperId` from the projection work. This is identity data and should be shared
by projection import, custom ranking import, and Sleeper roster sync.

Normalized projection rows are stored in `PlayerProjection`, keyed by Sleeper player ID and
projection source. These rows store the source-agnostic projected fantasy points that DraftOps
calculates from raw generated CSV stats using a draft's scoring settings.

Draft-specific valuation outputs are stored in `DraftPlayerValue`, keyed by draft, player, and
projection source. Replacement points, VOR, projection auction value, fallback auction value, active
auction value, and value source are league/draft-specific, so they do not belong on canonical
projection rows.

## Schema Shape

```prisma
model ProjectionSource {
  id             Int      @id @default(autoincrement())
  name           String
  season         Int
  projectionDate DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  projections PlayerProjection[]
  draftValues DraftPlayerValue[]

  @@unique([name, season, projectionDate])
}

model PlayerProjection {
  id                 Int    @id @default(autoincrement())
  sleeperId          String
  position           String
  projectedPoints    Float
  projectionSourceId Int

  source ProjectionSource @relation(fields: [projectionSourceId], references: [id])

  @@unique([sleeperId, projectionSourceId])
  @@index([sleeperId])
}

model DraftPlayerValue {
  id                     Int      @id @default(autoincrement())
  draftId                Int
  playerId               Int
  projectionSourceId     Int?
  projectedPoints        Float?
  replacementPoints      Float?
  vor                    Float?
  projectionAuctionValue Int?
  fallbackAuctionValue   Int
  activeAuctionValue     Int
  valueSource            String   @default("fallback")
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt

  draft            Draft             @relation(fields: [draftId], references: [id])
  player           Player            @relation(fields: [playerId], references: [id])
  projectionSource ProjectionSource? @relation(fields: [projectionSourceId], references: [id])

  @@unique([draftId, playerId, projectionSourceId])
  @@index([draftId])
  @@index([playerId])
}
```

## Apply Workflow

`prisma/apply-projection-values.ts` should:

1. Read `data/generated/etr_sleeper_matches.csv` and update `Player.sleeperId`.
2. Read `data/generated/master_projections.csv`.
3. Upsert one `ProjectionSource` per source/season/date combination.
4. Upsert `PlayerProjection` rows by `sleeperId + projectionSourceId`.
5. Join draft players to projections through `Player.sleeperId`.
6. Calculate replacement levels, VOR, and projection auction values for the draft.
7. Upsert `DraftPlayerValue` rows by `draftId + playerId + projectionSourceId`.

The script should leave `Player.budget`, `Player.ceiling`, and `Player.floor` as the fallback
rankings-derived values from #5b.

## Rookie Policy

Rookie projection handling remains asymmetric:

- Low rookie projections should not reduce the active fallback value.
- Strong rookie projections may raise the active value when projection values are explicitly
  activated.

This logic belongs in the VOR/value calculation layer, not in the persistence schema.

## Non-Goals

- Do not persist raw stat columns such as pass yards, rush yards, receptions, and touchdowns.
- Do not add UI value-source switching in this correction.
- Do not replace #5b fallback values.
- Do not create ranking-source tables in this PR; that belongs with #7 custom rankings upload.
