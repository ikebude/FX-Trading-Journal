/**
 * Reports IPC handlers — Milestone 15.
 *
 * Generates PDFs using pdfkit and exports CSV via papaparse.
 *
 * Per-trade PDF:
 *  - Header: symbol, direction, status, dates
 *  - Metrics table: pips, P&L, R, commission, swap
 *  - Legs table: type, timestamp, price, volume, commission, swap, P&L
 *  - Setup metadata: setup name, market condition, entry model, confidence
 *  - Notes (plain text)
 *
 * Summary PDF:
 *  - Cover: date range, account, filters
 *  - Aggregate stats: trades, win rate, profit factor, expectancy, avg R, net P&L, max DD
 *  - Trade list table (sorted by close date)
 *
 * CSV export: one row per closed trade with all fields.
 */

import { ipcMain, dialog, app } from 'electron';
import { createWriteStream, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import PDFDocument from 'pdfkit';
import Papa from 'papaparse';
import { writeFileSync } from 'node:fs';
import log from 'electron-log/main.js';
import { format, parseISO } from 'date-fns';

import { getTrade, listTrades } from '../../src/lib/db/queries';
import type { TradeFilters } from '../../src/lib/schemas';
import { toTaxRows, taxRowsToCsv, type TaxRow } from '../../src/lib/tax-export';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, decimals = 2): string {
  if (v == null) return '—';
  return v.toFixed(decimals);
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  try {
    return format(parseISO(v), 'dd MMM yyyy HH:mm');
  } catch {
    return v;
  }
}

function bufferFromPdf(fn: (doc: InstanceType<typeof PDFDocument>) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    fn(doc);
    doc.end();
  });
}

// ─────────────────────────────────────────────────────────────
// Per-trade PDF
// ─────────────────────────────────────────────────────────────

async function generateTradePdf(tradeId: string): Promise<string | null> {
  const trade = await getTrade(tradeId);
  if (!trade) return null;

  const pdfBuffer = await bufferFromPdf((doc) => {
    const DARK = '#111827';
    const MID = '#6b7280';
    const ACCENT = trade.direction === 'LONG' ? '#10b981' : '#f43f5e';

    // Header
    doc.fontSize(18).fillColor(DARK).text(`${trade.symbol}  ${trade.direction}`, { continued: true });
    doc.fontSize(11).fillColor(MID).text(`  ${trade.status}`, { lineBreak: false });
    doc.moveDown(0.3);

    doc.fontSize(9).fillColor(MID)
      .text(`Open: ${fmtDate(trade.openedAtUtc)}   Close: ${fmtDate(trade.closedAtUtc)}`);

    if (trade.setupName) {
      doc.text(`Setup: ${trade.setupName}`);
    }

    doc.moveDown(0.8);

    // Metrics row
    const metrics = [
      ['Net P&L', trade.netPnl != null ? `${trade.netPnl >= 0 ? '+' : ''}$${fmt(trade.netPnl)}` : '—'],
      ['Net Pips', trade.netPips != null ? `${trade.netPips >= 0 ? '+' : ''}${fmt(trade.netPips, 1)}` : '—'],
      ['R-Multiple', trade.rMultiple != null ? `${trade.rMultiple >= 0 ? '+' : ''}${fmt(trade.rMultiple)}R` : '—'],
      ['Commission', `$${fmt(trade.totalCommission)}`],
      ['Swap', `$${fmt(trade.totalSwap)}`],
      ['Entry Vol', `${fmt(trade.totalEntryVolume)} lots`],
    ];

    const colW = (doc.page.width - 100) / metrics.length;
    metrics.forEach(([label, value], i) => {
      const x = 50 + i * colW;
      doc.fontSize(7).fillColor(MID).text(label, x, doc.y, { width: colW, align: 'center' });
    });
    doc.moveDown(0.1);
    metrics.forEach(([, value], i) => {
      const x = 50 + i * colW;
      const y = doc.y;
      doc.fontSize(10).fillColor(DARK).text(value, x, y, { width: colW, align: 'center' });
    });
    doc.moveDown(1);

    // Legs table
    doc.fontSize(10).fillColor(DARK).text('Trade Legs');
    doc.moveDown(0.3);

    const legCols = ['Type', 'Time', 'Price', 'Volume', 'Commission', 'Swap', 'P&L'];
    const legWidths = [48, 100, 60, 55, 65, 45, 60];
    let x = 50;
    doc.fontSize(7).fillColor(MID);
    legCols.forEach((col, i) => {
      doc.text(col, x, doc.y, { width: legWidths[i], continued: i < legCols.length - 1 });
      x += legWidths[i];
    });
    doc.moveDown(0.2);
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#e5e7eb').stroke();
    doc.moveDown(0.2);

    for (const leg of trade.legs) {
      x = 50;
      const vals = [
        leg.legType,
        fmtDate(leg.timestampUtc),
        fmt(leg.price, 5),
        fmt(leg.volumeLots),
        `$${fmt(leg.commission)}`,
        `$${fmt(leg.swap)}`,
        leg.brokerProfit != null ? `$${fmt(leg.brokerProfit)}` : '—',
      ];
      doc.fontSize(8).fillColor(DARK);
      vals.forEach((v, i) => {
        doc.text(v, x, doc.y, { width: legWidths[i], continued: i < vals.length - 1 });
        x += legWidths[i];
      });
      doc.moveDown(0.3);
    }

    doc.moveDown(0.8);

    // Qualitative metadata
    const meta: [string, string | null][] = [
      ['Market Condition', trade.marketCondition],
      ['Entry Model', trade.entryModel],
      ['Confidence', trade.confidence != null ? `${trade.confidence}/5` : null],
      ['Pre-Trade Emotion', trade.preTradeEmotion],
      ['Post-Trade Emotion', trade.postTradeEmotion],
    ];

    const hasMeta = meta.some(([, v]) => v != null);
    if (hasMeta) {
      doc.fontSize(10).fillColor(DARK).text('Trade Context');
      doc.moveDown(0.3);
      for (const [label, value] of meta) {
        if (value) {
          doc.fontSize(8).fillColor(MID).text(`${label}: `, { continued: true });
          doc.fillColor(DARK).text(value);
        }
      }
      doc.moveDown(0.6);
    }

    // Notes
    if (trade.notes.length > 0) {
      doc.fontSize(10).fillColor(DARK).text('Notes');
      doc.moveDown(0.3);
      for (const note of trade.notes) {
        doc.fontSize(8).fillColor(MID).text(fmtDate(note.createdAtUtc), { continued: true });
        doc.fillColor(DARK).text('  ' + note.bodyMd);
        doc.moveDown(0.3);
      }
    }

    // Footer
    doc.fontSize(7).fillColor(MID)
      .text(
        `Generated by FXLedger on ${format(new Date(), 'dd MMM yyyy HH:mm')}`,
        50,
        doc.page.height - 40,
        { align: 'center' },
      );
  });

  // Save to temp file
  const tmpDir = join(app.getPath('temp'), 'ledger-reports');
  mkdirSync(tmpDir, { recursive: true });
  const outPath = join(tmpDir, `trade-${tradeId.slice(0, 8)}.pdf`);
  writeFileSync(outPath, pdfBuffer);
  return outPath;
}

// ─────────────────────────────────────────────────────────────
// Summary PDF
// ─────────────────────────────────────────────────────────────

async function generateSummaryPdf(filters: unknown): Promise<string | null> {
  const safeFilters = (filters ?? {}) as Partial<TradeFilters>;
  const { rows } = await listTrades({
    page: 1,
    deletedOnly: false,
    ...safeFilters,
    status: ['CLOSED'],
    includeDeleted: false,
    includeSample: false,
    pageSize: 10000,
    sortBy: 'closed_at_utc',
    sortDir: 'asc',
  });

  if (rows.length === 0) return null;

  const closed = rows;
  const wins = closed.filter((t) => (t.netPnl ?? 0) > 0);
  const losses = closed.filter((t) => (t.netPnl ?? 0) < 0);
  const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;
  const totalWins = wins.reduce((a, t) => a + (t.netPnl ?? 0), 0);
  const totalLosses = Math.abs(losses.reduce((a, t) => a + (t.netPnl ?? 0), 0));
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : null;
  const netPnl = closed.reduce((a, t) => a + (t.netPnl ?? 0), 0);
  const avgR = closed.length > 0
    ? closed.reduce((a, t) => a + (t.rMultiple ?? 0), 0) / closed.length
    : null;

  const pdfBuffer = await bufferFromPdf((doc) => {
    const DARK = '#111827';
    const MID = '#6b7280';

    doc.fontSize(20).fillColor(DARK).text('Trade Summary Report');
    doc.fontSize(9).fillColor(MID).text(`Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`);
    doc.moveDown(1);

    // Stats grid
    const stats = [
      ['Trades', String(closed.length)],
      ['Win Rate', `${winRate.toFixed(1)}%`],
      ['Net P&L', `${netPnl >= 0 ? '+' : ''}$${fmt(netPnl)}`],
      ['Profit Factor', profitFactor != null ? fmt(profitFactor) : '—'],
      ['Avg R', avgR != null ? `${avgR >= 0 ? '+' : ''}${fmt(avgR)}R` : '—'],
      ['Wins / Losses', `${wins.length} / ${losses.length}`],
    ];

    const colW = (doc.page.width - 100) / stats.length;
    stats.forEach(([label], i) => {
      const x = 50 + i * colW;
      doc.fontSize(7).fillColor(MID).text(label, x, doc.y, { width: colW, align: 'center' });
    });
    doc.moveDown(0.1);
    stats.forEach(([, value], i) => {
      const x = 50 + i * colW;
      doc.fontSize(12).fillColor(DARK).text(value, x, doc.y, { width: colW, align: 'center' });
    });
    doc.moveDown(1.5);

    // Trade list table header
    doc.fontSize(10).fillColor(DARK).text('Trade List');
    doc.moveDown(0.3);

    const cols = ['Symbol', 'Dir', 'Open', 'Close', 'Lots', 'Pips', 'P&L', 'R', 'Setup'];
    const widths = [52, 32, 88, 88, 36, 44, 52, 32, 80];
    let x = 50;
    doc.fontSize(7).fillColor(MID);
    cols.forEach((col, i) => {
      doc.text(col, x, doc.y, { width: widths[i], continued: i < cols.length - 1 });
      x += widths[i];
    });
    doc.moveDown(0.2);
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#e5e7eb').stroke();
    doc.moveDown(0.2);

    for (const trade of closed) {
      if (doc.y > doc.page.height - 80) {
        doc.addPage();
      }
      x = 50;
      const pnl = trade.netPnl ?? 0;
      const vals = [
        trade.symbol,
        trade.direction === 'LONG' ? 'L' : 'S',
        fmtDate(trade.openedAtUtc),
        fmtDate(trade.closedAtUtc),
        fmt(trade.totalEntryVolume),
        fmt(trade.netPips, 1),
        `${pnl >= 0 ? '+' : ''}$${fmt(pnl)}`,
        trade.rMultiple != null ? `${trade.rMultiple >= 0 ? '+' : ''}${fmt(trade.rMultiple)}` : '—',
        trade.setupName ?? '—',
      ];
      doc.fontSize(7).fillColor(DARK);
      vals.forEach((v, i) => {
        doc.text(v, x, doc.y, { width: widths[i], continued: i < vals.length - 1 });
        x += widths[i];
      });
      doc.moveDown(0.25);
    }
  });

  const tmpDir = join(app.getPath('temp'), 'ledger-reports');
  mkdirSync(tmpDir, { recursive: true });
  const outPath = join(tmpDir, `summary-${Date.now()}.pdf`);
  writeFileSync(outPath, pdfBuffer);
  return outPath;
}

// ─────────────────────────────────────────────────────────────
// T4.4 — Monthly trader PDF / prop-firm submission bundle
// ─────────────────────────────────────────────────────────────

async function generateMonthlyPdf(filters: unknown): Promise<string | null> {
  const safeFilters = (filters ?? {}) as Partial<TradeFilters> & { month?: string };
  const { rows } = await listTrades({
    page: 1,
    deletedOnly: false,
    ...safeFilters,
    status: ['CLOSED'],
    includeDeleted: false,
    includeSample: false,
    pageSize: 10000,
    sortBy: 'closed_at_utc',
    sortDir: 'asc',
  });
  if (rows.length === 0) return null;

  const monthLabel = safeFilters.dateFrom
    ? format(new Date(safeFilters.dateFrom), 'MMMM yyyy')
    : format(new Date(), 'MMMM yyyy');

  const wins = rows.filter((t) => (t.netPnl ?? 0) > 0);
  const losses = rows.filter((t) => (t.netPnl ?? 0) < 0);
  const netPnl = rows.reduce((a, t) => a + (t.netPnl ?? 0), 0);
  const grossWin = wins.reduce((a, t) => a + (t.netPnl ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + (t.netPnl ?? 0), 0));
  const winRate = (wins.length / rows.length) * 100;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : null;
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const best = [...rows].sort((a, b) => (b.netPnl ?? 0) - (a.netPnl ?? 0))[0];
  const worst = [...rows].sort((a, b) => (a.netPnl ?? 0) - (b.netPnl ?? 0))[0];
  const tradingDays = new Set(rows.map((t) => (t.closedAtUtc ?? '').slice(0, 10))).size;

  const pdfBuffer = await bufferFromPdf((doc) => {
    const DARK = '#111827';
    const MID = '#6b7280';
    const ACCENT = '#2563eb';

    // Cover
    doc.fontSize(26).fillColor(DARK).text('Monthly Trading Report');
    doc.fontSize(14).fillColor(ACCENT).text(monthLabel);
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor(MID).text(
      `Prop-firm submission bundle · Generated ${format(new Date(), 'dd MMM yyyy HH:mm')}`,
    );
    doc.moveDown(1.5);

    const kpis: Array<[string, string]> = [
      ['Net P&L', `${netPnl >= 0 ? '+' : ''}$${fmt(netPnl)}`],
      ['Win Rate', `${winRate.toFixed(1)}%`],
      ['Profit Factor', profitFactor != null ? fmt(profitFactor) : '—'],
      ['Trades', String(rows.length)],
      ['Trading Days', String(tradingDays)],
      ['Avg Win / Loss', `$${fmt(avgWin)} / $${fmt(avgLoss)}`],
    ];
    const colW = (doc.page.width - 100) / 3;
    kpis.forEach(([label, value], i) => {
      const col = i % 3;
      const rowI = Math.floor(i / 3);
      const x = 50 + col * colW;
      const y = doc.y + rowI * 50;
      doc.fontSize(8).fillColor(MID).text(label, x, y, { width: colW });
      doc.fontSize(15).fillColor(DARK).text(value, x, y + 12, { width: colW });
    });
    doc.y += 2 * 50 + 10;
    doc.moveDown(1);

    doc.fontSize(11).fillColor(DARK).text('Highlights');
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor(MID).text(
      `Best trade: ${best.symbol} ${best.netPnl != null ? `$${fmt(best.netPnl)}` : '—'}  ·  ` +
        `Worst trade: ${worst.symbol} ${worst.netPnl != null ? `$${fmt(worst.netPnl)}` : '—'}`,
    );
    doc.moveDown(1.2);

    // Per-trade ledger (paginates)
    doc.fontSize(11).fillColor(DARK).text('Trade Ledger');
    doc.moveDown(0.3);
    const cols = ['Date', 'Symbol', 'Dir', 'Lots', 'Pips', 'P&L', 'R'];
    const widths = [92, 60, 34, 44, 50, 60, 40];
    let x = 50;
    doc.fontSize(7).fillColor(MID);
    cols.forEach((c, i) => {
      doc.text(c, x, doc.y, { width: widths[i], continued: i < cols.length - 1 });
      x += widths[i];
    });
    doc.moveDown(0.2);
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#e5e7eb').stroke();
    doc.moveDown(0.2);
    for (const t of rows) {
      if (doc.y > doc.page.height - 70) doc.addPage();
      x = 50;
      const pnl = t.netPnl ?? 0;
      const vals = [
        fmtDate(t.closedAtUtc),
        t.symbol,
        t.direction === 'LONG' ? 'L' : 'S',
        fmt(t.totalEntryVolume),
        fmt(t.netPips, 1),
        `${pnl >= 0 ? '+' : ''}$${fmt(pnl)}`,
        t.rMultiple != null ? fmt(t.rMultiple) : '—',
      ];
      doc.fontSize(7).fillColor(DARK);
      vals.forEach((v, i) => {
        doc.text(v, x, doc.y, { width: widths[i], continued: i < vals.length - 1 });
        x += widths[i];
      });
      doc.moveDown(0.25);
    }
  });

  const tmpDir = join(app.getPath('temp'), 'ledger-reports');
  mkdirSync(tmpDir, { recursive: true });
  const outPath = join(tmpDir, `monthly-${Date.now()}.pdf`);
  writeFileSync(outPath, pdfBuffer);
  return outPath;
}

// ─────────────────────────────────────────────────────────────
// T4.5 — Tax-prep CSV (credit-segregated: closed trades only)
// ─────────────────────────────────────────────────────────────

async function generateTaxCsv(filters: unknown): Promise<string | null> {
  const safe = (filters ?? {}) as Partial<TradeFilters> & { taxYear?: number };
  const { rows } = await listTrades({
    page: 1,
    deletedOnly: false,
    ...safe,
    status: ['CLOSED'],
    includeDeleted: false,
    includeSample: false,
    pageSize: 100000,
    sortBy: 'closed_at_utc',
    sortDir: 'asc',
  });
  if (rows.length === 0) return null;

  const taxRows = toTaxRows(
    rows.map((t) => ({
      symbol: t.symbol,
      direction: t.direction,
      openedAtUtc: t.openedAtUtc,
      closedAtUtc: t.closedAtUtc,
      netPnl: t.netPnl,
      totalCommission: t.totalCommission,
      totalSwap: t.totalSwap,
    })),
    safe.taxYear,
  );
  if (taxRows.length === 0) return null;

  const csv = taxRowsToCsv(taxRows);
  const tmpDir = join(app.getPath('temp'), 'ledger-reports');
  mkdirSync(tmpDir, { recursive: true });
  const yr = safe.taxYear ?? 'all';
  const outPath = join(tmpDir, `tax-${yr}-${Date.now()}.csv`);
  writeFileSync(outPath, csv, 'utf-8');
  return outPath;
}

// ─────────────────────────────────────────────────────────────
// T5.7 — Year-end P&L statement PDF (credit-segregated)
// ─────────────────────────────────────────────────────────────

async function generateYearEndPdf(filters: unknown): Promise<string | null> {
  const safe = (filters ?? {}) as Partial<TradeFilters> & { taxYear?: number };
  const taxYear = safe.taxYear ?? new Date().getUTCFullYear();
  const { rows } = await listTrades({
    page: 1,
    deletedOnly: false,
    ...safe,
    status: ['CLOSED'],
    includeDeleted: false,
    includeSample: false,
    pageSize: 100000,
    sortBy: 'closed_at_utc',
    sortDir: 'asc',
  });
  const taxRows: TaxRow[] = toTaxRows(
    rows.map((t) => ({
      symbol: t.symbol,
      direction: t.direction,
      openedAtUtc: t.openedAtUtc,
      closedAtUtc: t.closedAtUtc,
      netPnl: t.netPnl,
      totalCommission: t.totalCommission,
      totalSwap: t.totalSwap,
    })),
    taxYear,
  );
  if (taxRows.length === 0) return null;

  const gross = taxRows.reduce((s, r) => s + r.grossPnl, 0);
  const fees = taxRows.reduce((s, r) => s + r.commission + r.swap, 0);
  const net = taxRows.reduce((s, r) => s + r.netPnl, 0);
  const byMonth = new Map<string, number>();
  for (const r of taxRows) {
    const m = r.closedAtUtc.slice(0, 7);
    byMonth.set(m, (byMonth.get(m) ?? 0) + r.netPnl);
  }

  const pdfBuffer = await bufferFromPdf((doc) => {
    const DARK = '#111827';
    const MID = '#6b7280';
    doc.fontSize(22).fillColor(DARK).text(`Year-End P&L Statement — ${taxYear}`);
    doc.fontSize(9).fillColor(MID).text(
      `Generated ${format(new Date(), 'dd MMM yyyy HH:mm')} · ` +
        'Realized trading P&L only — deposits, withdrawals, bonuses and ' +
        'credits are excluded (credit segregation).',
    );
    doc.moveDown(1);
    doc.fontSize(12).fillColor(DARK).text(`Gross P&L: $${fmt(gross)}`);
    doc.fontSize(12).text(`Fees (commission + swap): $${fmt(fees)}`);
    doc.fontSize(14).fillColor(DARK).text(`Net P&L: $${fmt(net)}`);
    doc.moveDown(1);
    doc.fontSize(11).text('Monthly breakdown');
    doc.moveDown(0.3);
    for (const [m, v] of [...byMonth.entries()].sort()) {
      doc.fontSize(9).fillColor(MID).text(`${m}:  ${v >= 0 ? '+' : ''}$${fmt(v)}`);
    }
    doc.moveDown(1);
    doc.fontSize(8).fillColor(MID).text(
      `${taxRows.length} closed trades. This statement is generated locally ` +
        'and unsigned; have it counter-signed by your accountant as required.',
    );
  });

  const tmpDir = join(app.getPath('temp'), 'ledger-reports');
  mkdirSync(tmpDir, { recursive: true });
  const outPath = join(tmpDir, `year-end-${taxYear}-${Date.now()}.pdf`);
  writeFileSync(outPath, pdfBuffer);
  return outPath;
}

// ─────────────────────────────────────────────────────────────
// CSV export
// ─────────────────────────────────────────────────────────────

async function exportCsv(filters: unknown): Promise<string | null> {
  const safeFilters = (filters ?? {}) as Partial<TradeFilters>;
  const { rows } = await listTrades({
    page: 1,
    deletedOnly: false,
    ...safeFilters,
    includeDeleted: false,
    includeSample: false,
    pageSize: 100000,
    sortBy: 'opened_at_utc',
    sortDir: 'asc',
  });

  if (rows.length === 0) return null;

  const csvRows = rows.map((t) => ({
    id: t.id,
    symbol: t.symbol,
    direction: t.direction,
    status: t.status,
    setup: t.setupName ?? '',
    opened_at: t.openedAtUtc ?? '',
    closed_at: t.closedAtUtc ?? '',
    lots: t.totalEntryVolume,
    net_pips: t.netPips ?? '',
    net_pnl: t.netPnl ?? '',
    r_multiple: t.rMultiple ?? '',
    commission: t.totalCommission,
    swap: t.totalSwap,
    entry_price: t.weightedAvgEntry ?? '',
    exit_price: t.weightedAvgExit ?? '',
    confidence: t.confidence ?? '',
    pre_emotion: t.preTradeEmotion ?? '',
    post_emotion: t.postTradeEmotion ?? '',
    market_condition: t.marketCondition ?? '',
    entry_model: t.entryModel ?? '',
    source: t.source,
    session: t.session ?? '',
  }));

  const csv = Papa.unparse(csvRows);

  const { filePath } = await dialog.showSaveDialog({
    title: 'Export Trades as CSV',
    defaultPath: `ledger-trades-${format(new Date(), 'yyyy-MM-dd')}.csv`,
    filters: [{ name: 'CSV Files', extensions: ['csv'] }],
  });

  if (!filePath) return null;

  writeFileSync(filePath, csv, 'utf-8');
  return filePath;
}

// ─────────────────────────────────────────────────────────────
// IPC registration
// ─────────────────────────────────────────────────────────────

export function registerReportHandlers(): void {
  ipcMain.removeHandler('reports:trade-pdf');
  ipcMain.removeHandler('reports:summary-pdf');
  ipcMain.removeHandler('reports:monthly-pdf');
  ipcMain.removeHandler('reports:tax-csv');
  ipcMain.removeHandler('reports:year-end-pdf');
  ipcMain.removeHandler('reports:export-csv');

  ipcMain.handle('reports:tax-csv', async (_e, filters: unknown) => {
    try {
      return await generateTaxCsv(filters);
    } catch (err) {
      log.error('reports:tax-csv', err);
      throw new Error('Failed to generate tax CSV');
    }
  });

  ipcMain.handle('reports:year-end-pdf', async (_e, filters: unknown) => {
    try {
      return await generateYearEndPdf(filters);
    } catch (err) {
      log.error('reports:year-end-pdf', err);
      throw new Error('Failed to generate year-end PDF');
    }
  });

  ipcMain.handle('reports:monthly-pdf', async (_e, filters: unknown) => {
    try {
      return await generateMonthlyPdf(filters);
    } catch (err) {
      log.error('reports:monthly-pdf', err);
      throw new Error('Failed to generate monthly PDF');
    }
  });

  ipcMain.handle('reports:trade-pdf', async (_e, tradeId: string) => {
    try {
      return await generateTradePdf(tradeId);
    } catch (err) {
      log.error('reports:trade-pdf', err);
      throw new Error('Failed to generate trade PDF');
    }
  });

  ipcMain.handle('reports:summary-pdf', async (_e, filters: unknown) => {
    try {
      return await generateSummaryPdf(filters);
    } catch (err) {
      log.error('reports:summary-pdf', err);
      throw new Error('Failed to generate summary PDF');
    }
  });

  ipcMain.handle('reports:export-csv', async (_e, filters: unknown) => {
    try {
      return await exportCsv(filters);
    } catch (err) {
      log.error('reports:export-csv', err);
      throw new Error('Failed to export CSV');
    }
  });
}
