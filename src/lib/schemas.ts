/**
 * Ledger — Zod validation schemas
 *
 * Source of truth for all form validation and IPC payload shapes.
 * Imported by components, IPC handlers, and importers for consistent validation.
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────

/** UTC ISO-8601 string: "2024-01-15T12:34:56.000Z" */
const utcString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, 'Must be ISO-8601 UTC string');

const positiveReal = z.number().positive('Must be greater than 0');
const nonNegativeReal = z.number().min(0, 'Cannot be negative');

// ─────────────────────────────────────────────────────────────
// Account
// ─────────────────────────────────────────────────────────────

export const CreateAccountSchema = z.object({
  name: z.string().min(1, 'Account name is required').max(100),
  broker: z.string().max(100).optional(),
  accountCurrency: z.string().length(3, 'Must be 3-letter currency code').default('USD'),
  initialBalance: nonNegativeReal.default(0),
  accountType: z.enum(['LIVE', 'DEMO', 'PROP']).default('LIVE'),
  displayColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Must be hex color')
    .default('#3b82f6'),
  openedAtUtc: utcString.optional(),

  // Prop firm rules — required only when accountType = 'PROP'
  propDailyLossLimit: nonNegativeReal.optional(),
  propDailyLossPct: z.number().min(0).max(100).optional(),
  propMaxDrawdown: nonNegativeReal.optional(),
  propMaxDrawdownPct: z.number().min(0).max(100).optional(),
  propDrawdownType: z.enum(['STATIC', 'TRAILING']).optional(),
  propProfitTarget: nonNegativeReal.optional(),
  propProfitTargetPct: z.number().min(0).max(100).optional(),
  propPhase: z.enum(['PHASE_1', 'PHASE_2', 'FUNDED', 'VERIFIED']).optional(),

  // Broker metadata (v1.1 — T1.3) — all optional for flexibility
  server: z.string().max(100).optional(),
  platform: z
    .enum(['MT4', 'MT5', 'cTrader', 'MatchTrader', 'DXtrade', 'IBKR', 'OANDA', 'CRYPTO', 'OTHER'])
    .optional(),
  leverage: z.number().int().positive('Leverage must be positive').optional(),
  timezone: z.string().max(100).optional(),
  login: z.string().max(100).optional(),
  brokerType: z
    .enum(['RETAIL', 'PROP', 'ECN', 'MARKET_MAKER', 'CRYPTO_EXCHANGE'])
    .optional(),
});

export const UpdateAccountSchema = CreateAccountSchema.partial();

export type CreateAccountInput = z.infer<typeof CreateAccountSchema>;
export type UpdateAccountInput = z.infer<typeof UpdateAccountSchema>;

// ─────────────────────────────────────────────────────────────
// Trade leg
// ─────────────────────────────────────────────────────────────

export const CreateLegSchema = z.object({
  tradeId: z.string().min(1),
  legType: z.enum(['ENTRY', 'EXIT']),
  timestampUtc: utcString,
  price: positiveReal,
  volumeLots: positiveReal,
  commission: z.number().default(0),
  swap: z.number().default(0),
  brokerProfit: z.number().optional(),
  externalDealId: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

export const UpdateLegSchema = CreateLegSchema.omit({ tradeId: true, legType: true }).partial();

export type CreateLegInput = z.infer<typeof CreateLegSchema>;
export type UpdateLegInput = z.infer<typeof UpdateLegSchema>;

// ─────────────────────────────────────────────────────────────
// Trade
// ─────────────────────────────────────────────────────────────

/**
 * Mode A — Full manual trade entry (trade detail page or blotter "new trade").
 * Requires at least one entry leg.
 */
export const CreateTradeSchema = z.object({
  accountId: z.string().min(1, 'Account is required'),
  symbol: z.string().min(1, 'Symbol is required').max(20),
  direction: z.enum(['LONG', 'SHORT']),

  // Planning
  initialStopPrice: positiveReal.optional(),
  initialTargetPrice: positiveReal.optional(),
  plannedRr: positiveReal.optional(),
  plannedRiskAmount: nonNegativeReal.optional(),
  plannedRiskPct: z.number().min(0).max(100).optional(),

  // Qualitative
  methodologyId: z.string().optional(),
  setupName: z.string().max(100).optional(),
  marketCondition: z.enum(['TRENDING', 'RANGING', 'NEWS_VOLATILITY']).optional(),
  entryModel: z.enum(['LIMIT', 'MARKET', 'STOP_ENTRY', 'ON_RETEST']).optional(),
  confidence: z.number().int().min(1).max(5).optional(),
  preTradeEmotion: z
    .enum(['CALM', 'NEUTRAL', 'ANXIOUS', 'EXCITED', 'FRUSTRATED', 'TIRED'])
    .optional(),
  postTradeEmotion: z
    .enum(['SATISFIED', 'RELIEVED', 'DISAPPOINTED', 'FRUSTRATED', 'INDIFFERENT'])
    .optional(),

  // Optional first entry leg (included in create so one round-trip creates both)
  entryLeg: z
    .object({
      timestampUtc: utcString,
      price: positiveReal,
      volumeLots: positiveReal,
      commission: z.number().default(0),
      swap: z.number().default(0),
    })
    .optional(),

  source: z
    .enum(['MANUAL', 'MT4_HTML', 'MT5_HTML', 'CSV', 'LIVE_BRIDGE', 'HOTKEY'])
    .default('MANUAL'),
  externalTicket: z.string().optional(),
  externalPositionId: z.string().optional(),
});

/**
 * Mode B — Quick hotkey overlay entry. Minimal fields only.
 */
export const QuickTradeSchema = z.object({
  accountId: z.string().min(1, 'Account is required'),
  symbol: z.string().min(1, 'Symbol is required').max(20),
  direction: z.enum(['LONG', 'SHORT']),
  price: positiveReal,
  volumeLots: positiveReal,
  initialStopPrice: positiveReal.optional(),
  initialTargetPrice: positiveReal.optional(),
  methodologyId: z.string().optional(),
  setupName: z.string().max(100).optional(),
  confidence: z.number().int().min(1).max(5).optional(),
  preTradeEmotion: z
    .enum(['CALM', 'NEUTRAL', 'ANXIOUS', 'EXCITED', 'FRUSTRATED', 'TIRED'])
    .optional(),
});

export const UpdateTradeSchema = CreateTradeSchema.omit({
  accountId: true,
  entryLeg: true,
  source: true,
  externalTicket: true,
  externalPositionId: true,
}).partial();

export type CreateTradeInput = z.infer<typeof CreateTradeSchema>;
export type QuickTradeInput = z.infer<typeof QuickTradeSchema>;
export type UpdateTradeInput = z.infer<typeof UpdateTradeSchema>;

// ─────────────────────────────────────────────────────────────
// Blotter filters
// ─────────────────────────────────────────────────────────────

export const TradeFiltersSchema = z.object({
  accountId: z.string().optional(),
  ids: z.array(z.string()).optional(), // restrict results to these trade IDs (used by FTS5 search)
  status: z.array(z.enum(['OPEN', 'PARTIAL', 'CLOSED', 'CANCELLED'])).optional(),
  direction: z.enum(['LONG', 'SHORT']).optional(),
  symbol: z.string().optional(),
  setupName: z.string().optional(),
  session: z.string().optional(),
  marketCondition: z.enum(['TRENDING', 'RANGING', 'NEWS_VOLATILITY']).optional(),
  dateFrom: utcString.optional(),
  dateTo: utcString.optional(),
  minPnl: z.number().optional(),
  maxPnl: z.number().optional(),
  includeDeleted: z.boolean().default(false),
  deletedOnly: z.boolean().default(false),
  includeSample: z.boolean().default(false),
  tagIds: z.array(z.number()).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(500).default(100),
  sortBy: z
    .enum([
      'opened_at_utc',
      'closed_at_utc',
      'net_pnl',
      'net_pips',
      'r_multiple',
      'symbol',
      'created_at_utc',
    ])
    .default('opened_at_utc'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type TradeFilters = z.infer<typeof TradeFiltersSchema>;

// ─────────────────────────────────────────────────────────────
// Instrument upsert
// ─────────────────────────────────────────────────────────────

export const UpsertInstrumentSchema = z.object({
  symbol: z.string().min(1).max(20).toUpperCase(),
  displayName: z.string().max(50).optional(),
  assetClass: z.enum(['FOREX', 'METAL', 'INDEX', 'CRYPTO', 'OTHER']).default('FOREX'),
  baseCurrency: z.string().length(3).optional(),
  quoteCurrency: z.string().length(3).optional(),
  pipSize: positiveReal,
  contractSize: positiveReal.default(100000),
  digits: z.number().int().min(0).max(8).default(5),
});

export type UpsertInstrumentInput = z.infer<typeof UpsertInstrumentSchema>;

// ─────────────────────────────────────────────────────────────
// Tag + setup
// ─────────────────────────────────────────────────────────────

export const CreateTagSchema = z.object({
  name: z.string().min(1).max(50),
  category: z.enum(['CONFLUENCE', 'MISTAKE', 'CUSTOM']),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export const CreateSetupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export type CreateTagInput = z.infer<typeof CreateTagSchema>;
export type CreateSetupInput = z.infer<typeof CreateSetupSchema>;

// ─────────────────────────────────────────────────────────────
// Review
// ─────────────────────────────────────────────────────────────

export const UpsertReviewSchema = z.object({
  accountId: z.string().min(1),
  kind: z.enum(['DAILY', 'WEEKLY']),
  periodStartUtc: utcString,
  periodEndUtc: utcString,
  followedPlan: z.enum(['YES', 'NO', 'PARTIAL']).optional(),
  biggestWin: z.string().max(1000).optional(),
  biggestMistake: z.string().max(1000).optional(),
  improvement: z.string().max(1000).optional(),
  patternWinners: z.string().max(1000).optional(),
  patternLosers: z.string().max(1000).optional(),
  strategyAdjust: z.string().max(1000).optional(),
  moodScore: z.number().int().min(1).max(5).optional(),
  disciplineScore: z.number().int().min(1).max(5).optional(),
  energyScore: z.number().int().min(1).max(5).optional(),
});

export type UpsertReviewInput = z.infer<typeof UpsertReviewSchema>;

// ─────────────────────────────────────────────────────────────
// Settings patch
// ─────────────────────────────────────────────────────────────

export const SettingsPatchSchema = z.record(z.string(), z.unknown());
