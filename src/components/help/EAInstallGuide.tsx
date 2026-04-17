import { ExternalLink } from 'lucide-react';

const STEPS = [
  {
    n: 1,
    title: 'What the bridge does',
    body: `The LedgerBridge Expert Advisor (EA) runs inside your MT4 or MT5 terminal. Every time a trade closes (or opens), the EA writes a small JSON file to a folder on your PC. Ledger watches that folder and automatically imports the trade into your journal — no manual entry needed.`,
  },
  {
    n: 2,
    title: 'Finding your MQL folder',
    body: `In your MT4 or MT5 terminal:\n1. Click File → Open Data Folder\n2. A Windows Explorer window opens — this is your terminal's data directory.\n3. Inside you'll see MQL4\\ (MT4) or MQL5\\ (MT5).\n4. Open that folder, then open the Experts\\ subfolder inside it.`,
  },
  {
    n: 3,
    title: 'Copying the EA file',
    body: `The EA files ship with Ledger. Open Ledger's installation folder:\n  C:\\Program Files\\Ledger\\resources\\mql\\\nCopy the correct file into your Experts folder:\n• MT4 → copy LedgerBridge.mq4\n• MT5 → copy LedgerBridge.mq5\nDo not copy the wrong version — MT4 will not load .mq5 files.`,
  },
  {
    n: 4,
    title: 'Attaching the EA to a chart',
    body: `1. In MT4/MT5, open any chart (it can be any symbol — the EA logs all trades regardless of which chart it's attached to).\n2. Drag LedgerBridge from the Navigator → Expert Advisors panel onto the chart, or double-click it.\n3. In the EA settings dialog:\n   • Set OutputFolder to the path shown in Ledger → Settings → Bridge.\n   • Ensure AutoTrading (the green robot button) is ON.\n4. Click OK. You should see a smiley face in the chart's top-right corner — this confirms the EA is running.`,
  },
  {
    n: 5,
    title: 'Verifying the connection',
    body: `1. Open Ledger → Settings → Bridge Status.\n2. The status should show "Watching: [your output folder path]".\n3. Place a test trade in MT4/MT5, then close it.\n4. Within 2–5 seconds you should see a toast notification in Ledger: "EURUSD LONG — Trade closed and journal updated" (or similar).\n5. The trade will appear in the Blotter with source = LIVE_BRIDGE.`,
  },
  {
    n: 6,
    title: 'Troubleshooting',
    body: `AutoTrading off: Click the green robot button in the MT4/MT5 toolbar — it must be enabled for EAs to run.\n\nFile permission error: The EA's OutputFolder must be a path the terminal can write to. Avoid system folders (Program Files, Windows). Use a path inside Documents or Desktop.\n\nExperts folder not found: Ensure you are in the Data Folder (File → Open Data Folder), not the installation folder.\n\nNo smiley face on chart: Check the Experts tab in the MT4/MT5 terminal log panel for error messages from LedgerBridge.\n\nTrades appear after a delay: The watcher polls every 500ms. If your PC is under load, allow up to 5 seconds. If consistently slow, check that antivirus is not scanning the bridge folder.`,
  },
];

export function EAInstallGuide() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 overflow-y-auto px-6 py-8">
      <div>
        <h1 className="text-xl font-bold text-foreground">
          MT4 / MT5 Bridge Setup Guide
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your MetaTrader terminal to Ledger for automatic live trade journalling.
        </p>
      </div>

      {STEPS.map((step) => (
        <div key={step.n} className="flex gap-4">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {step.n}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{step.title}</h2>
            <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">
              {step.body}
            </p>
          </div>
        </div>
      ))}

      <div className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
        <ExternalLink className="mb-1 inline h-3 w-3" />{' '}
        The EA source code is open — you can inspect{' '}
        <code className="rounded bg-muted px-1">LedgerBridge.mq4</code> /{' '}
        <code className="rounded bg-muted px-1">.mq5</code> in the resources folder.
        No external connections are made — the EA writes only to a local folder.
      </div>
    </div>
  );
}
