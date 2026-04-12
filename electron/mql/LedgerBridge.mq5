//+------------------------------------------------------------------+
//|                                              LedgerBridge.mq5     |
//|              Ledger Forex Journal — Live Trade Bridge for MT5     |
//|                                                                    |
//|  Place this file in:  <MT5 Data Folder>/MQL5/Experts/             |
//|  Compile in MetaEditor (F7), then drag onto any chart.            |
//|  Allow "Algo Trading" in MT5 toolbar.                             |
//|                                                                    |
//|  On every deal (open OR close), writes a JSON file to             |
//|  <MT5 Data Folder>/MQL5/Files/Ledger/<position_id>.json           |
//|  which the Ledger desktop app watches and ingests.                |
//|                                                                    |
//|  "status" field in the JSON is "open" when only entry deals exist |
//|  and "closed" once an exit deal is present. Ledger uses this to   |
//|  display live open positions before they close.                    |
//+------------------------------------------------------------------+
#property copyright "Ledger"
#property version   "1.02"
#property strict

input string InpSubfolder = "Ledger"; // Subfolder under MQL5/Files/

//+------------------------------------------------------------------+
//| Initialization                                                    |
//+------------------------------------------------------------------+
int OnInit()
{
   // Verify the output folder is writable before declaring success.
   string sentinel = InpSubfolder + "\\.ledger_bridge_active";
   int handle = FileOpen(sentinel, FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(handle == INVALID_HANDLE)
   {
      Print("LedgerBridge FATAL: Cannot write to MQL5/Files/", InpSubfolder,
            ". Check folder exists and is writable. Error: ", GetLastError());
      return INIT_FAILED;
   }
   FileWriteString(handle, "active\n");
   FileClose(handle);

   Print("LedgerBridge MT5 initialized. Output folder: MQL5/Files/", InpSubfolder);
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   Print("LedgerBridge MT5 stopped. Reason: ", reason);
}

//+------------------------------------------------------------------+
//| Trade transaction handler — fires on every deal/order/position    |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction& trans,
                        const MqlTradeRequest& request,
                        const MqlTradeResult& result)
{
   // We only care about deals being added to history (i.e., a fill).
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD) return;

   ulong dealTicket = trans.deal;
   if(dealTicket == 0) return;

   // Look up the deal in history.
   if(!HistoryDealSelect(dealTicket))
   {
      Print("LedgerBridge: HistoryDealSelect failed for deal ", dealTicket,
            " err=", GetLastError());
      return;
   }

   long entryType = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);

   // T6-6: Export on IN deals too — enables live open-position tracking.
   // Ledger reads "status":"open" and shows the position in the blotter
   // before it closes. The file is re-exported on every subsequent deal
   // (INOUT/OUT) so the status transitions to "closed" automatically.
   if(entryType != DEAL_ENTRY_IN &&
      entryType != DEAL_ENTRY_OUT &&
      entryType != DEAL_ENTRY_INOUT) return;

   ulong positionId = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
   if(positionId == 0)
   {
      Print("LedgerBridge: deal ", dealTicket, " has no position_id — skipping");
      return;
   }

   ExportPosition(positionId);
}

//+------------------------------------------------------------------+
//| Export every deal of a position as a single JSON file             |
//+------------------------------------------------------------------+
void ExportPosition(ulong positionId)
{
   if(!HistorySelectByPosition(positionId))
   {
      // T6-5: Log HistorySelectByPosition failures instead of silently returning.
      Print("LedgerBridge: HistorySelectByPosition failed for position ", positionId,
            " err=", GetLastError());
      return;
   }

   int dealsCount = HistoryDealsTotal();
   if(dealsCount == 0)
   {
      Print("LedgerBridge: no deals found for position ", positionId);
      return;
   }

   // T6-6: First pass — determine whether the position is open or closed.
   // A position is closed once at least one OUT or INOUT deal exists.
   bool hasClosed = false;
   for(int i = 0; i < dealsCount; i++)
   {
      ulong t = HistoryDealGetTicket(i);
      if(t == 0) continue;
      long entry = HistoryDealGetInteger(t, DEAL_ENTRY);
      if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_INOUT)
      {
         hasClosed = true;
         break;
      }
   }
   string statusStr = hasClosed ? "closed" : "open";

   string filename = InpSubfolder + "\\" + IntegerToString(positionId) + ".json.tmp";
   int handle = FileOpen(filename, FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(handle == INVALID_HANDLE)
   {
      Print("LedgerBridge: failed to open ", filename, " err=", GetLastError());
      return;
   }

   // Build JSON — second pass through deals.
   string json = "{\n";
   json += "  \"version\": 1,\n";
   json += "  \"platform\": \"MT5\",\n";
   json += "  \"account\": " + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + ",\n";
   json += "  \"account_currency\": \"" + AccountInfoString(ACCOUNT_CURRENCY) + "\",\n";
   json += "  \"broker\": \"" + EscapeJson(AccountInfoString(ACCOUNT_COMPANY)) + "\",\n";
   json += "  \"position_id\": " + IntegerToString(positionId) + ",\n";
   json += "  \"status\": \"" + statusStr + "\",\n";
   json += "  \"deals\": [\n";

   for(int i = 0; i < dealsCount; i++)
   {
      ulong t = HistoryDealGetTicket(i);
      if(t == 0)
      {
         // T6-5: Log invalid deal handles instead of silently continuing.
         Print("LedgerBridge: HistoryDealGetTicket(", i, ") returned 0 for position ",
               positionId, " — skipping deal");
         continue;
      }

      string symbol     = HistoryDealGetString(t, DEAL_SYMBOL);
      long   type       = HistoryDealGetInteger(t, DEAL_TYPE);
      long   entry      = HistoryDealGetInteger(t, DEAL_ENTRY);
      datetime time     = (datetime)HistoryDealGetInteger(t, DEAL_TIME);
      double volume     = HistoryDealGetDouble(t, DEAL_VOLUME);
      double price      = HistoryDealGetDouble(t, DEAL_PRICE);
      double sl         = HistoryDealGetDouble(t, DEAL_SL);
      double tp         = HistoryDealGetDouble(t, DEAL_TP);
      double commission = HistoryDealGetDouble(t, DEAL_COMMISSION);
      double swap       = HistoryDealGetDouble(t, DEAL_SWAP);
      double profit     = HistoryDealGetDouble(t, DEAL_PROFIT);
      string comment    = HistoryDealGetString(t, DEAL_COMMENT);

      string typeStr  = (type  == DEAL_TYPE_BUY)    ? "buy"   :
                        (type  == DEAL_TYPE_SELL)   ? "sell"  : "other";
      string entryStr = (entry == DEAL_ENTRY_IN)    ? "in"    :
                        (entry == DEAL_ENTRY_OUT)   ? "out"   :
                        (entry == DEAL_ENTRY_INOUT) ? "inout" : "other";

      json += "    {";
      json += "\"deal_id\": "     + IntegerToString(t) + ", ";
      json += "\"symbol\": \""    + symbol             + "\", ";
      json += "\"type\": \""      + typeStr            + "\", ";
      json += "\"entry\": \""     + entryStr           + "\", ";
      json += "\"time_utc\": \""  + TimeToIso(time)    + "\", ";
      json += "\"volume\": "      + DoubleToString(volume,     2) + ", ";
      json += "\"price\": "       + DoubleToString(price,  _Digits) + ", ";
      json += "\"stop_loss\": "   + DoubleToString(sl,    _Digits) + ", ";
      json += "\"take_profit\": " + DoubleToString(tp,    _Digits) + ", ";
      json += "\"commission\": "  + DoubleToString(commission, 2) + ", ";
      json += "\"swap\": "        + DoubleToString(swap,       2) + ", ";
      json += "\"profit\": "      + DoubleToString(profit,     2) + ", ";
      json += "\"comment\": \""   + EscapeJson(comment)          + "\"";
      json += "}";
      if(i < dealsCount - 1) json += ",";
      json += "\n";
   }

   json += "  ]\n";
   json += "}\n";

   FileWriteString(handle, json);
   FileClose(handle);

   // Atomic rename: write to .tmp then rename so watcher never reads a partial file.
   string finalName = InpSubfolder + "\\" + IntegerToString(positionId) + ".json";
   FileDelete(finalName);
   if(!FileMove(filename, 0, finalName, 0))
   {
      // T1-1: Log FileMove failures. Without this, the .tmp file silently
      // remains and the watcher never sees the trade.
      Print("LedgerBridge: FileMove failed for position ", positionId,
            " src=", filename, " dst=", finalName, " err=", GetLastError());
      // .tmp file remains — will be overwritten on next deal for this position
      return;
   }

   Print("LedgerBridge: exported position ", positionId,
         " status=", statusStr, " deals=", dealsCount);
}

//+------------------------------------------------------------------+
//| Helpers                                                           |
//+------------------------------------------------------------------+
string TimeToIso(datetime t)
{
   MqlDateTime mdt;
   TimeToStruct(t, mdt);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ",
                       mdt.year, mdt.mon, mdt.day,
                       mdt.hour, mdt.min, mdt.sec);
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

void OnTick() { /* no-op — we only care about trade events */ }
