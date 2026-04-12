//+------------------------------------------------------------------+
//|                                              LedgerBridge.mq4     |
//|              Ledger Forex Journal — Live Trade Bridge for MT4     |
//|                                                                    |
//|  Place this file in:  <MT4 Data Folder>/MQL4/Experts/             |
//|  Compile in MetaEditor (F7), then drag onto any chart.            |
//|  Allow "Algo Trading" / "Auto Trading" in MT4 toolbar.            |
//|                                                                    |
//|  On every closed trade, writes a JSON file to                     |
//|  <MT4 Data Folder>/MQL4/Files/Ledger/<ticket>.json                |
//|  which the Ledger desktop app watches and ingests.                |
//+------------------------------------------------------------------+
#property copyright "Ledger"
#property version   "1.01"
#property strict

input string InpSubfolder = "Ledger"; // Subfolder under MQL4/Files/

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

   Print("LedgerBridge MT4 initialized. Output folder: MQL4/Files/", InpSubfolder);
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
      // Only export real trades (BUY/SELL), not balance/credit operations.
      if(type != OP_BUY && type != OP_SELL) continue;
      ExportOrder();
   }

   g_lastHistoryTotal = total;
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
   json += "  \"version\": 1,\n";
   json += "  \"platform\": \"MT4\",\n";
   json += "  \"account\": " + IntegerToString(AccountNumber()) + ",\n";
   json += "  \"account_currency\": \"" + AccountCurrency() + "\",\n";
   json += "  \"broker\": \"" + EscapeJson(AccountCompany()) + "\",\n";
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
