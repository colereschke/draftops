import type { BidAuditEventType, FuturePickAuctionMode, Prisma } from '@prisma/client';

export interface ExportedTeam {
  id: number;
  handle: string;
  displayName: string | null;
}

export interface ExportableBid {
  id: number;
  draftId: number;
  playerId: number;
  player: string;
  position: string;
  nflTeam: string;
  price: number;
  sfRank: number | null;
  notes: string | null;
  teamId: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  supersededAt: Date | null;
  team: ExportedTeam;
}

export interface ExportableAuditEvent {
  id: number;
  bidId: number;
  actorId: string;
  type: BidAuditEventType;
  before: Prisma.JsonValue | null;
  after: Prisma.JsonValue | null;
  occurredAt: Date;
}

export interface ExportableTradePickAsset {
  id: number;
  tradeId: number;
  draftId: number;
  originTeamId: number;
  futurePickYear: number;
  futurePickRound: number;
}

export interface ExportableTrade {
  id: number;
  draftId: number;
  budgetTeamId: number;
  pickTeamId: number;
  budgetAmount: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  pickAssets: ExportableTradePickAsset[];
}

export interface ExportableTradeAuditEvent {
  id: number;
  draftId: number;
  tradeId: number;
  actorId: string;
  type: BidAuditEventType;
  before: Prisma.JsonValue | null;
  after: Prisma.JsonValue | null;
  occurredAt: Date;
}

export interface ExportableCompletionSnapshot {
  schemaVersion: number;
  capturedAt: Date;
  payload: Prisma.JsonValue;
}

export interface ExportableDraft {
  id: number;
  name: string;
  status: string;
  budget: number;
  teamCount: number;
  rosterSize: number;
  playerValueSourceBudget: number;
  startingLineup: Prisma.JsonValue | null;
  scoringSettings: Prisma.JsonValue | null;
  targetRoster: Prisma.JsonValue | null;
  futurePickAuctionMode: FuturePickAuctionMode;
  sleeperLeagueId: string | null;
  activeProjectionValueSetId: number | null;
}

export interface DraftExportInput {
  draft: ExportableDraft;
  bids: ExportableBid[];
  auditEvents: ExportableAuditEvent[];
  trades: ExportableTrade[];
  tradeAuditEvents: ExportableTradeAuditEvent[];
  completionSnapshot: ExportableCompletionSnapshot | null;
}

export interface DraftExport {
  draft: ExportableDraft;
  activeBids: Array<
    Omit<ExportableBid, 'createdAt' | 'updatedAt' | 'deletedAt' | 'supersededAt'> & {
      createdAt: string;
      updatedAt: string;
      deletedAt: string | null;
      supersededAt: string | null;
    }
  >;
  auditEvents: Array<Omit<ExportableAuditEvent, 'occurredAt'> & { occurredAt: string }>;
  trades: Array<
    Omit<ExportableTrade, 'createdAt' | 'updatedAt' | 'deletedAt'> & {
      createdAt: string;
      updatedAt: string;
      deletedAt: string | null;
    }
  >;
  activeTrades: Array<
    Omit<ExportableTrade, 'createdAt' | 'updatedAt' | 'deletedAt'> & {
      createdAt: string;
      updatedAt: string;
      deletedAt: string | null;
    }
  >;
  tradeAuditEvents: Array<Omit<ExportableTradeAuditEvent, 'occurredAt'> & { occurredAt: string }>;
  completionSnapshot: {
    schemaVersion: number;
    capturedAt: string;
    payload: Prisma.JsonValue;
  } | null;
}

export function serializeDraftExport(input: DraftExportInput): DraftExport {
  const serializeTrade = (trade: ExportableTrade) => ({
    ...trade,
    createdAt: trade.createdAt.toISOString(),
    updatedAt: trade.updatedAt.toISOString(),
    deletedAt: trade.deletedAt?.toISOString() ?? null,
    pickAssets: [...trade.pickAssets].sort(
      (left, right) =>
        left.originTeamId - right.originTeamId ||
        left.futurePickYear - right.futurePickYear ||
        left.futurePickRound - right.futurePickRound ||
        left.id - right.id,
    ),
  });
  return {
    draft: input.draft,
    activeBids: input.bids.map((bid) => ({
      ...bid,
      createdAt: bid.createdAt.toISOString(),
      updatedAt: bid.updatedAt.toISOString(),
      deletedAt: bid.deletedAt?.toISOString() ?? null,
      supersededAt: bid.supersededAt?.toISOString() ?? null,
    })),
    auditEvents: [...input.auditEvents]
      .sort((left, right) => {
        const occurredAtDifference = left.occurredAt.getTime() - right.occurredAt.getTime();
        return occurredAtDifference || left.id - right.id;
      })
      .map((event) => ({ ...event, occurredAt: event.occurredAt.toISOString() })),
    trades: [...input.trades].sort((left, right) => left.id - right.id).map(serializeTrade),
    activeTrades: input.trades
      .filter((trade) => trade.deletedAt === null)
      .sort((left, right) => left.id - right.id)
      .map(serializeTrade),
    tradeAuditEvents: [...input.tradeAuditEvents]
      .sort((left, right) => {
        const occurredAtDifference = left.occurredAt.getTime() - right.occurredAt.getTime();
        return occurredAtDifference || left.id - right.id;
      })
      .map((event) => ({ ...event, occurredAt: event.occurredAt.toISOString() })),
    completionSnapshot: input.completionSnapshot
      ? {
          schemaVersion: input.completionSnapshot.schemaVersion,
          capturedAt: input.completionSnapshot.capturedAt.toISOString(),
          payload: input.completionSnapshot.payload,
        }
      : null,
  };
}

function escapeCsvCell(value: string | number): string {
  const text = String(value);
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safeText) ? `"${safeText.replaceAll('"', '""')}"` : safeText;
}

export function serializeDraftCsv(bids: ExportableBid[]): string {
  const header = ['Player', 'Position', 'NFL Team', 'Price', 'Team', 'Logged At', 'Updated At'];
  const rows = bids.map((bid) =>
    [
      bid.player,
      bid.position,
      bid.nflTeam,
      bid.price,
      bid.team.handle,
      bid.createdAt.toISOString(),
      bid.updatedAt.toISOString(),
    ]
      .map(escapeCsvCell)
      .join(','),
  );

  return `${[header.join(','), ...rows].join('\n')}\n`;
}
