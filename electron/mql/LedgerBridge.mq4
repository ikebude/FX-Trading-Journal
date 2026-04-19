//+------------------------------------------------------------------+
//|                                              LedgerBridge.mq4     |
//|              Ledger Forex Journal — Live Trade Bridge for MT4     |
//|                                                                    |
//|  Place this file in:  <MT4 Data Folder>/MQL4/Experts/             |
//|  Compile in MetaEditor (F7), then drag onto any chart.            |
//|  Allow "Algo Trading" / "Auto Trading" in MT4 toolbar.            |
//|                                                                    |
//|  v2 CHANGES (ea_version: 2):                                      |
//|   - Output subfolder renamed from "Ledger" to "FXLedger".         |
//|     Re-configure your file-sync / MT4 Files mapping accordingly.  |
//|   - Balance (OP_BALANCE=6) and credit (OP_CREDIT=7) orders are    |
//|     now emitted as separate "balance_op" events (bal_<ticket>.json)|
//|     Note: MT4 balance-op detection is best-effort via startup      |
//|     history scan + OnTimer polling. Real-time detection is limited |
//|     because MT4 has no OnTradeTransaction equivalent.              |
//|   - Trade files now include "ea_version": 2 and "event_type".     |
//|                                                                    |
//|  On every closed trade, writes a JSON file to                     |
//|  <MT4 Data Folder>/MQL4/Files/FXLedger/<ticket>.json              |
//|  On every balance/credit order detected, writes:                   |
//|  <MT4 Data Folder>/MQL4/Files/FXLedger/bal_<ticket>.json          |
//|  which the FXLedger desktop app watches and ingests.              |
//+------------------------------------------------------------------+
#property copyright "Ledger"
#property version   "2.00"
#property strict

input string InpSubfolder = "FXLedger"; // Subfolder under MQL4/Files/

int g_lastHistoryTotal = 0;

int OnInit()
{
   g_lastHistoryTotal = OrdersHistoryTotal();

   // Verify the output folder is writable before declaring success.
   string sentinel = InpSubfolder + "\\.ledger_bridge_active";
   int handle = FileOpen(sentinel, FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(handle == INVALID_HANDLE)
   {
      Print("LedgerBridge FATAL: Cannot write to MQL4/Files/", InpSubfolder,
            ". Check folder exists and is writable. Error: ", GetLastError());
      return INIT_FAILED;
   }
   FileWriteString(handle, "active\n");
   FileClose(handle);

   Print("LedgerBridge MT4 v2 initialized. Output folder: MQL4/Files/", InpSubfolder);

   // On startup: scan existing history for balance/credit orders that
   // have not been exported yet (file does not exist). This catches any
   // ops that occurred while the EA was not running.
   ScanBalanceHistory(0, g_lastHistoryTotal);

   EventSetTimer(2);
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("LedgerBridge MT4 stopped. Reason: ", reason);
}

//+------------------------------------------------------------------+
//| Poll history every 2 seconds for new closed orders.               |
//| MT4 has no OnTradeTransaction equivalent for retail builds, so    |
//| polling history is the standard approach.                         |
//+------------------------------------------------------------------+
void OnTimer()
{
   int total = OrdersHistoryTotal();
   if(total <= g_lastHistoryTotal) return;

   for(int i = g_lastHistoryTotal; i < total; i++)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_HISTORY))
      {
         Print("LedgerBridge: OrderSelect failed at index ", i, " err=", GetLastError());
         continue;
      }
      int type = OrderType();

      // OP_BALANCE (6) and OP_CREDIT (7) are non-trade account events.
      // Export them as balance_op JSON files.
      if(type == 6 || type == 7)
      {
         ExportBalanceOp();
         continue;
      }

      // Only export real trades (BUY/SELL).
      if(type != OP_BUY && type != OP_SELL) continue;
      ExportOrder();
   }

   g_lastHistoryTotal = total;
}

//+------------------------------------------------------------------+
//| Scan a range of history orders for balance/credit ops.           |
//| Used on startup to catch ops that occurred while EA was offline.  |
//| Skips tickets where bal_<ticket>.json already exists.            |
//+------------------------------------------------------------------+
void ScanBalanceHistory(int fromIndex, int toIndex)
{
   for(int i = fromIndex; i < toIndex; i++)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_HISTORY))
         continue;
      int type = OrderType();
      if(type != 6 && type != 7) continue; // OP_BALANCE=6, OP_CREDIT=7

      // Check if already exported (file exists).
      string checkFile = InpSubfolder + "\\bal_" + IntegerToString(OrderTicket()) + ".json";
      // FileIsExist is not available in MQL4 retail — use FileOpen to test.
      int fh = FileOpen(checkFile, FILE_READ | FILE_TXT | FILE_ANSI);
      if(fh != INVALID_HANDLE)
      {
         FileClose(fh);
         continue; // Already exported — skip.
      }
      ExportBalanceOp();
   }
}

//+------------------------------------------------------------------+
//| Export the currently selected order as a single JSON file         |
//+------------------------------------------------------------------+
void ExportOrder()
{
   int ticket      = OrderTicket();
   string symbol   = OrderSymbol();
   int type        = OrderType();
   double lots     = OrderLots();
   datetime openTime   = OrderOpenTime();
   double openPrice    = OrderOpenPrice();
   datetime closeTime  = OrderCloseTime();
   double closePrice   = OrderClosePrice();
   double sl           = OrderStopLoss();
   double tp           = OrderTakeProfit();
   double commission   = OrderCommission();
   double swap         = OrderSwap();
   double profit       = OrderProfit();
   string comment      = OrderComment();

   string filename = InpSubfolder + "\\" + IntegerToString(ticket) + ".json.tmp";
   int handle = FileOpen(filename, FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(handle == INVALID_HANDLE)
   {
      Print("LedgerBridge: failed to open ", filename, " err=", GetLastError());
      return;
   }

   string typeStr = (type == OP_BUY) ? "buy" : "sell";

   string json = "{\n";
   json += "  \"ea_version\": 2,\n";
   json += "  \"event_type\": \"trade\",\n";
   json += "  \"version\": 2,\n";
   json += "  \"platform\": \"MT4\",\n";
   json += "  \"account\": " + IntegerToString(AccountNumber()) + ",\n";
   json += "  \"login\": \"" + IntegerToString(AccountNumber()) + "\",\n";
   json += "  \"account_currency\": \"" + AccountCurrency() + "\",\n";
   json += "  \"broker\": \"" + EscapeJson(AccountCompany()) + "\",\n";
   json += "  \"server\": \"" + EscapeJson(AccountServer()) + "\",\n";
   json += "  \"ticket\": " + IntegerToString(ticket) + ",\n";
   json += "  \"symbol\": \"" + symbol + "\",\n";
   json += "  \"type\": \"" + typeStr + "\",\n";
   json += "  \"volume\": " + DoubleToStr(lots, 2) + ",\n";
   json += "  \"open_time_utc\": \"" + TimeToIso(openTime) + "\",\n";
   json += "  \"open_price\": " + DoubleToStr(openPrice, Digits) + ",\n";
   json += "  \"close_time_utc\": \"" + TimeToIso(closeTime) + "\",\n";
   json += "  \"close_price\": " + DoubleToStr(closePrice, Digits) + ",\n";
   json += "  \"stop_loss\": " + DoubleToStr(sl, Digits) + ",\n";
   json += "  \"take_profit\": " + DoubleToStr(tp, Digits) + ",\n";
   json += "  \"commission\": " + DoubleToStr(commission, 2) + ",\n";
   json += "  \"swap\": " + DoubleToStr(swap, 2) + ",\n";
   json += "  \"profit\": " + DoubleToStr(profit, 2) + ",\n";
   json += "  \"comment\": \"" + EscapeJson(comment) + "\"\n";
   json += "}\n";

   FileWriteString(handle, json);
   FileClose(handle);

   // Atomic rename: write to .tmp then rename so watcher never reads a partial file.
   // H-4 fix: FILE_TXT flag is required — using 0 caused FileMove() to silently fail
   // on some MT4 builds, leaving the .tmp file permanently and never exporting the trade.
   string finalName = InpSubfolder + "\\" + IntegerToString(ticket) + ".json";
   FileDelete(finalName);
   if(!FileMove(filename, FILE_TXT, finalName, FILE_TXT))
   {
      Print("LedgerBridge: FileMove failed for ticket ", ticket,
            " src=", filename, " dst=", finalName, " err=", GetLastError());
      // .tmp file remains — will be overwritten on next export of same ticket
      return;
   }

   Print("LedgerBridge: exported ticket ", ticket, " (", symbol, " ", typeStr, ")");
}

//+------------------------------------------------------------------+
//| Export the currently selected balance/credit order as JSON        |
//| MT4 balance ops: OP_BALANCE (6) → DEPOSIT/WITHDRAWAL             |
//|                  OP_CREDIT  (7) → CREDIT                         |
//+------------------------------------------------------------------+
void ExportBalanceOp()
{
   int    ticket   = OrderTicket();
   int    type     = OrderType();
   double profit   = OrderProfit();
   string comment  = OrderComment();
   string symbol   = OrderSymbol();   // usually empty for balance ops
   datetime opTime = OrderOpenTime(); // balance ops use open time

   // Map order type to op_type string.
   // OP_BALANCE (6): positive profit → DEPOSIT, negative → WITHDRAWAL
   // OP_CREDIT  (7): → CREDIT
   string opType;
   if(type == 6)
      opType = (profit >= 0) ? "DEPOSIT" : "WITHDRAWAL";
   else if(type == 7)
      opType = "CREDIT";
   else
      opType = "OTHER";

   string filename = InpSubfolder + "\\bal_" + IntegerToString(ticket) + ".json.tmp";
   int handle = FileOpen(filename, FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(handle == INVALID_HANDLE)
   {
      Print("LedgerBridge: ExportBalanceOp failed to open ", filename, " err=", GetLastError());
      return;
   }

   string json = "{\n";
   json += "  \"ea_version\": 2,\n";
   json += "  \"event_type\": \"balance_op\",\n";
   json += "  \"platform\": \"MT4\",\n";
   json += "  \"account\": " + IntegerToString(AccountNumber()) + ",\n";
   json += "  \"login\": \"" + IntegerToString(AccountNumber()) + "\",\n";
   json += "  \"account_currency\": \"" + AccountCurrency() + "\",\n";
   json += "  \"broker\": \"" + EscapeJson(AccountCompany()) + "\",\n";
   json += "  \"server\": \"" + EscapeJson(AccountServer()) + "\",\n";
   json += "  \"deal_id\": " + IntegerToString(ticket) + ",\n";
   json += "  \"op_type\": \"" + opType + "\",\n";
   json += "  \"amount\": " + DoubleToStr(profit, 2) + ",\n";
   json += "  \"currency\": \"" + AccountCurrency() + "\",\n";
   json += "  \"symbol\": \"" + EscapeJson(symbol) + "\",\n";
   json += "  \"occurred_at_utc\": \"" + TimeToIso(opTime) + "\",\n";
   json += "  \"comment\": \"" + EscapeJson(comment) + "\"\n";
   json += "}\n";

   FileWriteString(handle, json);
   FileClose(handle);

   // Atomic rename.
   string finalName = InpSubfolder + "\\bal_" + IntegerToString(ticket) + ".json";
   FileDelete(finalName);
   if(!FileMove(filename, FILE_TXT, finalName, FILE_TXT))
   {
      Print("LedgerBridge: ExportBalanceOp FileMove failed for ticket ", ticket,
            " src=", filename, " dst=", finalName, " err=", GetLastError());
      return;
   }

   Print("LedgerBridge: exported balance_op ticket=", ticket,
         " op_type=", opType, " amount=", DoubleToStr(profit, 2));
}

string TimeToIso(datetime t)
{
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ",
                       TimeYear(t), TimeMonth(t), TimeDay(t),
                       TimeHour(t), TimeMinute(t), TimeSeconds(t));
}

// FIX T1-2: Correct JSON escaping — backslash MUST be escaped first,
// then quotes, then control characters using proper JSON sequences (not spaces).
// Replacing \n with a space loses the line break information in comments;
// using \\n preserves it in the JSON string.
string EscapeJson(string s)
{
   StringReplace(s, "\\", "\\\\");   // Must come first: escape existing backslashes
   StringReplace(s, "\"", "\\\"");   // Escape double quotes
   StringReplace(s, "\r", "\\r");    // Carriage return → JSON \r (not space)
   StringReplace(s, "\n", "\\n");    // Newline → JSON \n (not space)
   StringReplace(s, "\t", "\\t");    // Tab → JSON \t (not space)
   return s;
}

void OnTick() { /* polling is done in OnTimer */ }
