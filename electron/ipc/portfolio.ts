/**
 * Portfolio IPC — T5.1
 *
 * Consolidates every non-deleted account into one portfolio view.
 * FX rates are caller-supplied (Rule 11: no network) — when absent the
 * currency is flagged via PortfolioSummary.missingRates.
 */
import { ipcMain } from 'electron';
import log from 'electron-log/main.js';
import { listAccounts, listTrades } from '../../src/lib/db/queries';
import { computePortfolioSummary } from '../../src/lib/portfolio';

export function registerPortfolioHandlers(): void {
  ipcMain.removeHandler('portfolio:summary');
  ipcMain.handle(
    'portfolio:summary',
    async (
      _e,
      opts: { baseCurrency?: string; rates?: Record<string, number> } = {},
    ) => {
      try {
        const accounts = await listAccounts();
        const inputs = [];
        const openPositions = [];
        for (const a of accounts) {
          const { rows } = await listTrades({
            page: 1,
            pageSize: 100000,
            accountId: a.id,
            status: ['CLOSED'],
            includeDeleted: false,
            includeSample: false,
            deletedOnly: false,
            sortBy: 'closed_at_utc',
            sortDir: 'asc',
          });
          const netPnl = rows.reduce((s, t) => s + (t.netPnl ?? 0), 0);
          inputs.push({
            accountId: a.id,
            name: a.name,
            currency: a.accountCurrency,
            netPnl,
            group: a.brokerType ?? null,
          });

          const { rows: open } = await listTrades({
            page: 1,
            pageSize: 100000,
            accountId: a.id,
            status: ['OPEN', 'PARTIAL'],
            includeDeleted: false,
            includeSample: false,
            deletedOnly: false,
            sortBy: 'opened_at_utc',
            sortDir: 'asc',
          });
          for (const t of open) {
            openPositions.push({
              accountId: a.id,
              accountName: a.name,
              symbol: t.symbol,
              direction: t.direction,
              lots: t.totalEntryVolume ?? 0,
              riskAmount: t.plannedRiskAmount ?? null,
            });
          }
        }
        const base = opts.baseCurrency ?? accounts[0]?.accountCurrency ?? 'USD';
        return computePortfolioSummary(inputs, base, opts.rates ?? {}, openPositions);
      } catch (err) {
        log.error('portfolio:summary', err);
        throw err;
      }
    },
  );
}
