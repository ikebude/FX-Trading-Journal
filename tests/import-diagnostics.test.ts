/**
 * Import diagnostics test suite.
 * 
 * Tests for:
 * 1. MT5 parser lenient header matching (score >= 3)
 * 2. Fallback table selection when score < 5
 * 3. Parser error handling and logging
 * 4. Format detection robustness
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMt5Html } from '../src/lib/importers/mt5-html';
import { decodeImportBuffer } from '../src/lib/importers/encoding';

describe('MT5 Parser - Lenient Header Matching', () => {
  // Test 1: Standard MT5 HTML with all standard headers
  it('should parse standard MT5 HTML with full headers', () => {
    const html = `
      <table>
        <tr>
          <th>Deal</th>
          <th>Position ID</th>
          <th>Symbol</th>
          <th>Type</th>
          <th>Volume</th>
          <th>Price</th>
          <th>Time</th>
          <th>Commission</th>
          <th>Swap</th>
          <th>Profit</th>
        </tr>
        <tr>
          <td>1001</td>
          <td>1</td>
          <td>EURUSD</td>
          <td>buy</td>
          <td>1.0</td>
          <td>1.0900</td>
          <td>2024-01-15 10:30:00</td>
          <td>-10.00</td>
          <td>0.00</td>
          <td>50.00</td>
        </tr>
      </table>
    `;
    
    const result = parseMt5Html(html);
    expect(result.trades.length).toBe(1);
    expect(result.trades[0].symbol).toBe('EURUSD');
    expect(result.trades[0].direction).toBe('LONG');
    expect(result.failed.length).toBe(0);
  });

  // Test 2: MT5 HTML with non-standard headers (fewer matching fields)
  it('should parse MT5 HTML with non-standard headers (lenient matching)', () => {
    const html = `
      <table>
        <tr>
          <th>ID</th>
          <th>Pos</th>
          <th>Pair</th>
          <th>Action</th>
          <th>Qty</th>
          <th>Rate</th>
          <th>DateTime</th>
          <th>Comm</th>
          <th>Extra1</th>
          <th>Extra2</th>
        </tr>
        <tr>
          <td>1001</td>
          <td>2</td>
          <td>GBPUSD</td>
          <td>sell</td>
          <td>0.5</td>
          <td>1.2500</td>
          <td>2024-01-15 14:00:00</td>
          <td>-5.00</td>
          <td></td>
          <td></td>
        </tr>
      </table>
    `;
    
    const result = parseMt5Html(html);
    expect(result.trades.length).toBe(1);
    expect(result.trades[0].symbol).toBe('GBPUSD');
    expect(result.trades[0].direction).toBe('SHORT');
    expect(result.failed.length).toBe(0);
  });

  // Test 3: Multiple tables - should pick best match
  it('should pick best table among multiple tables', () => {
    const html = `
      <table>
        <tr><td>Garbage</td><td>Data</td><td>Here</td></tr>
        <tr><td>1</td><td>2</td><td>3</td></tr>
      </table>
      <table>
        <tr>
          <th>Deal ID</th>
          <th>Position ID</th>
          <th>Symbol</th>
          <th>Type</th>
          <th>Volume</th>
          <th>Price</th>
          <th>Time</th>
          <th>Commission</th>
          <th>Swap</th>
          <th>Profit</th>
        </tr>
        <tr>
          <td>2001</td>
          <td>3</td>
          <td>USDJPY</td>
          <td>buy</td>
          <td>2.0</td>
          <td>145.50</td>
          <td>2024-01-15 16:00:00</td>
          <td>-20.00</td>
          <td>0.00</td>
          <td>100.00</td>
        </tr>
      </table>
    `;
    
    const result = parseMt5Html(html);
    expect(result.trades.length).toBe(1);
    expect(result.trades[0].symbol).toBe('USDJPY');
  });

  // Test 4: Empty file or no valid tables
  it('should handle empty HTML gracefully', () => {
    const html = '<html><body></body></html>';
    const result = parseMt5Html(html);
    expect(result.trades.length).toBe(0);
    expect(result.rowsTotal).toBe(0);
  });

  // Test 5: Table with headers but no data rows
  it('should handle table with headers but no data', () => {
    const html = `
      <table>
        <tr>
          <th>Deal</th>
          <th>Position ID</th>
          <th>Symbol</th>
          <th>Type</th>
          <th>Volume</th>
          <th>Price</th>
          <th>Time</th>
          <th>Commission</th>
          <th>Swap</th>
          <th>Profit</th>
        </tr>
      </table>
    `;
    
    const result = parseMt5Html(html);
    expect(result.trades.length).toBe(0);
    expect(result.rowsTotal).toBe(0);
  });

  // Test 6: Partial fills (multiple deals for one position)
  it('should synthesize multi-deal trades (partial fills)', () => {
    const html = `
      <table>
        <tr>
          <th>Deal</th>
          <th>Position ID</th>
          <th>Symbol</th>
          <th>Type</th>
          <th>Volume</th>
          <th>Price</th>
          <th>Time</th>
          <th>Commission</th>
          <th>Swap</th>
          <th>Profit</th>
        </tr>
        <tr>
          <td>1001</td>
          <td>5</td>
          <td>AUDUSD</td>
          <td>buy</td>
          <td>0.5</td>
          <td>0.6700</td>
          <td>2024-01-15 08:00:00</td>
          <td>-2.50</td>
          <td>0.00</td>
          <td></td>
        </tr>
        <tr>
          <td>1002</td>
          <td>5</td>
          <td>AUDUSD</td>
          <td>buy</td>
          <td>0.5</td>
          <td>0.6705</td>
          <td>2024-01-15 08:15:00</td>
          <td>-2.50</td>
          <td>0.00</td>
          <td></td>
        </tr>
        <tr>
          <td>1003</td>
          <td>5</td>
          <td>AUDUSD</td>
          <td>sell</td>
          <td>1.0</td>
          <td>0.6750</td>
          <td>2024-01-15 12:00:00</td>
          <td>-5.00</td>
          <td>2.50</td>
          <td>40.00</td>
        </tr>
      </table>
    `;
    
    const result = parseMt5Html(html);
    expect(result.trades.length).toBe(1);
    expect(result.trades[0].externalPositionId).toBe('5');
    expect(result.trades[0].legs.length).toBe(3);
    expect(result.trades[0].status).toBe('CLOSED');
    expect(result.trades[0].rawDealCount).toBe(3);
  });

  // Test 7: Missing critical fields (should skip silently)
  it('should skip rows with missing critical data', () => {
    const html = `
      <table>
        <tr>
          <th>Deal</th>
          <th>Position ID</th>
          <th>Symbol</th>
          <th>Type</th>
          <th>Volume</th>
          <th>Price</th>
          <th>Time</th>
          <th>Commission</th>
          <th>Swap</th>
          <th>Profit</th>
        </tr>
        <tr>
          <td>1001</td>
          <td>6</td>
          <td></td>
          <td>buy</td>
          <td>1.0</td>
          <td>1.0900</td>
          <td>2024-01-15 10:30:00</td>
          <td>-10.00</td>
          <td>0.00</td>
          <td>50.00</td>
        </tr>
        <tr>
          <td>1002</td>
          <td>7</td>
          <td>EURUSD</td>
          <td>buy</td>
          <td>1.0</td>
          <td></td>
          <td>2024-01-15 10:35:00</td>
          <td>-10.00</td>
          <td>0.00</td>
          <td>50.00</td>
        </tr>
      </table>
    `;
    
    const result = parseMt5Html(html);
    // Rows with missing symbol or price are silently skipped
    expect(result.trades.length).toBe(0);
    expect(result.failed.length).toBe(0);
  });

  // Test 8: Non-numeric price (should throw and be caught)
  it('should fail row with non-numeric price', () => {
    const html = `
      <table>
        <tr>
          <th>Deal</th>
          <th>Position ID</th>
          <th>Symbol</th>
          <th>Type</th>
          <th>Volume</th>
          <th>Price</th>
          <th>Time</th>
          <th>Commission</th>
          <th>Swap</th>
          <th>Profit</th>
        </tr>
        <tr>
          <td>1001</td>
          <td>8</td>
          <td>EURUSD</td>
          <td>buy</td>
          <td>1.0</td>
          <td>INVALID_PRICE</td>
          <td>2024-01-15 10:30:00</td>
          <td>-10.00</td>
          <td>0.00</td>
          <td>50.00</td>
        </tr>
      </table>
    `;
    
    const result = parseMt5Html(html);
    expect(result.trades.length).toBe(0);
    expect(result.failed.length).toBe(1);
    expect(result.failed[0].reason).toContain('Non-numeric');
  });

  // Test 9: Positions without position ID (should skip)
  it('should skip deals with missing position ID', () => {
    const html = `
      <table>
        <tr>
          <th>Deal</th>
          <th>Position ID</th>
          <th>Symbol</th>
          <th>Type</th>
          <th>Volume</th>
          <th>Price</th>
          <th>Time</th>
          <th>Commission</th>
          <th>Swap</th>
          <th>Profit</th>
        </tr>
        <tr>
          <td>1001</td>
          <td></td>
          <td>EURUSD</td>
          <td>buy</td>
          <td>1.0</td>
          <td>1.0900</td>
          <td>2024-01-15 10:30:00</td>
          <td>-10.00</td>
          <td>0.00</td>
          <td>50.00</td>
        </tr>
      </table>
    `;
    
    const result = parseMt5Html(html);
    expect(result.trades.length).toBe(0);
    expect(result.failed.length).toBe(1);
  });

  // Test 10: Zero volume (should skip)
  it('should skip deals with zero volume', () => {
    const html = `
      <table>
        <tr>
          <th>Deal</th>
          <th>Position ID</th>
          <th>Symbol</th>
          <th>Type</th>
          <th>Volume</th>
          <th>Price</th>
          <th>Time</th>
          <th>Commission</th>
          <th>Swap</th>
          <th>Profit</th>
        </tr>
        <tr>
          <td>1001</td>
          <td>9</td>
          <td>EURUSD</td>
          <td>buy</td>
          <td>0.0</td>
          <td>1.0900</td>
          <td>2024-01-15 10:30:00</td>
          <td>-10.00</td>
          <td>0.00</td>
          <td>50.00</td>
        </tr>
      </table>
    `;
    
    const result = parseMt5Html(html);
    expect(result.trades.length).toBe(0);
    // This should be filtered out as a pending order
  });
});

describe('MT5 Parser - real Deriv "Report History" fixture', () => {
  // Regression for v1.0.8: the MT5 client writes "Report History" as a single
  // outer <table> containing Positions/Orders/Deals sub-sections and encodes
  // the file as UTF-16 LE + BOM. Both properties used to blow up the importer.
  it('decodes UTF-16 and extracts all 5 closed trades from the Deals section', () => {
    const buf = readFileSync(
      join(__dirname, 'fixtures', 'ReportHistory-101713523.html'),
    );
    const html = decodeImportBuffer(buf);

    // Sanity: encoding autodetect yields readable HTML (not mojibake).
    expect(html).toContain('Trade History Report');
    expect(html).toContain('Deals');

    const result = parseMt5Html(html);

    // The fixture has exactly 5 closed positions in the Deals section.
    expect(result.failed).toEqual([]);
    expect(result.trades).toHaveLength(5);

    const symbols = result.trades.map((t) => t.symbol).sort();
    expect(symbols).toEqual([
      'Volatility 50 Index',
      'Volatility 50 Index',
      'Volatility 75 (1s) Index',
      'Volatility 75 (1s) Index',
      'Volatility 75 (1s) Index',
    ]);

    // Every trade must be SHORT (all deals in this report are sells).
    for (const t of result.trades) {
      expect(t.direction).toBe('SHORT');
      expect(t.legs.length).toBeGreaterThanOrEqual(2); // in + out
    }
  });
});
