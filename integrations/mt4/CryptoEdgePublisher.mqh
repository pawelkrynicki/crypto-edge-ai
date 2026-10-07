#ifndef CRYPTO_EDGE_PUBLISHER_MQH
#define CRYPTO_EDGE_PUBLISHER_MQH

//+------------------------------------------------------------------+
//| CryptoEdgePublisher.mqh - shared Crypto Edge publisher           |
//| Setup-agnostic and Engine-version-agnostic.                      |
//| Engine MUST declare before this include:                         |
//|   input bool   InpCE_Enabled     = true;                         |
//|   input string InpCE_EngineVer   = "<#property version>";        |
//|   input string InpCE_StrategyVer = "<strategy version>";         |
//|   input string InpCE_TerminalId  = "";                           |
//| Writes SIGNAL_CREATED + lifecycle events to FILE_COMMON outbox.  |
//| No network/API, order placement or setup-specific logic.         |
//+------------------------------------------------------------------+

#define CE_COMMON_ROOT "CryptoEdge"
#define CE_OUTBOX_DIR  "CryptoEdge\\outbox"

string CE_AsciiId(string s)
{
   string out = s;
   int n = StringLen(out);
   for(int i=0;i<n;i++)
   {
      ushort c = StringGetCharacter(out, i);
      bool ok = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
                (c >= '0' && c <= '9') || c=='.' || c=='_' || c==':' || c=='-';
      if(!ok) StringSetCharacter(out, i, '_');
   }
   return out;
}

string CE_JsonEscape(string s)
{
   string out = s;
   StringReplace(out, "\\", "\\\\");
   StringReplace(out, "\"", "\\\"");
   StringReplace(out, "\r", "");
   StringReplace(out, "\n", "\\n");
   StringReplace(out, "\t", "\\t");
   return out;
}

string CE_TerminalId()
{
   if(StringLen(InpCE_TerminalId) > 0) return CE_AsciiId(InpCE_TerminalId);
   return "ACC" + IntegerToString(AccountNumber());
}

datetime CE_ServerToUtc(datetime serverTime)
{
   datetime serverMinusGmt = TimeCurrent() - TimeGMT();
   return serverTime - serverMinusGmt;
}

string CE_Iso8601(datetime utc)
{
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02d.000Z",
      TimeYear(utc), TimeMonth(utc), TimeDay(utc),
      TimeHour(utc), TimeMinute(utc), TimeSeconds(utc));
}

string CE_MakeSignalId(string terminalId, string setupId, datetime tclose, string side, string orderType)
{
   string raw = terminalId + "-" + setupId + "-" + IntegerToString((int)tclose) + "-" + side + "-" + orderType;
   raw = CE_AsciiId(raw);
   if(StringLen(raw) > 128) raw = StringSubstr(raw, 0, 128);
   return raw;
}

string CryptoEdgeSignalId(string setupId, datetime sourceCloseServer, string side, string orderType)
{
   return CE_MakeSignalId(
      CE_TerminalId(),
      CE_AsciiId(setupId),
      sourceCloseServer,
      CE_AsciiId(side),
      CE_AsciiId(orderType)
   );
}

string CE_MakeEventId(string signalId, string eventType)
{
   string suffix = "-" + CE_AsciiId(eventType);
   int maxBase = 128 - StringLen(suffix);
   if(maxBase < 1) maxBase = 1;
   string base = CE_AsciiId(signalId);
   if(StringLen(base) > maxBase) base = StringSubstr(base, 0, maxBase);
   return base + suffix;
}

bool CE_WriteOutboxJson(string fileName, string json, string label)
{
   int h = FileOpen(fileName, FILE_WRITE|FILE_BIN|FILE_COMMON);
   if(h == INVALID_HANDLE)
   {
      Print("ALLinCrypto CE: cannot write outbox file for ", label, ", error ", GetLastError());
      return false;
   }

   uchar bytes[];
   int count = StringToCharArray(json, bytes, 0, WHOLE_ARRAY, CP_UTF8) - 1;
   if(count < 0) count = 0;
   ArrayResize(bytes, count);
   uint written = FileWriteArray(h, bytes, 0, count);
   FileFlush(h);
   FileClose(h);
   if((int)written != count)
   {
      Print("ALLinCrypto CE: incomplete outbox write for ", label);
      return false;
   }
   return true;
}

bool CryptoEdgeInit()
{
   if(!InpCE_Enabled) return true;
   ResetLastError();
   FolderCreate(CE_COMMON_ROOT, FILE_COMMON);
   ResetLastError();
   FolderCreate(CE_OUTBOX_DIR, FILE_COMMON);
   return true;
}

bool CryptoEdgePublishSignal(
   string setupId,
   string setupName,
   string symbol,
   string timeframe,
   string side,
   string orderType,
   double entryPrice,
   double stopLoss,
   double takeProfit,
   double rr,
   datetime sourceCloseServer,
   double cancelPrice,
   int validForSeconds,
   int maxHoldSeconds,
   int digits
)
{
   if(!InpCE_Enabled) return true;

   string terminalId = CE_TerminalId();
   string safeSetupId = CE_AsciiId(setupId);
   string safeSide = CE_AsciiId(side);
   string safeOrderType = CE_AsciiId(orderType);
   string signalId = CryptoEdgeSignalId(safeSetupId, sourceCloseServer, safeSide, safeOrderType);

   string maxHold = (maxHoldSeconds > 0) ? IntegerToString(maxHoldSeconds) : "null";
   string validFor = (validForSeconds > 0) ? IntegerToString(validForSeconds) : "null";
   string cancel = (cancelPrice > 0) ? DoubleToString(cancelPrice, digits) : "null";

   string json = "{";
   json += "\"schema_version\":\"axi_crypto_signal_v1\",";
   json += "\"event_type\":\"SIGNAL_CREATED\",";
   json += "\"signal_id\":\"" + CE_JsonEscape(signalId) + "\",";
   json += "\"source\":{";
   json += "\"provider\":\"AXI\",";
   json += "\"engine\":\"ALLinCrypto Engine\",";
   json += "\"engine_version\":\"" + CE_JsonEscape(CE_AsciiId(InpCE_EngineVer)) + "\",";
   json += "\"strategy_version\":\"" + CE_JsonEscape(CE_AsciiId(InpCE_StrategyVer)) + "\",";
   json += "\"terminal_id\":\"" + CE_JsonEscape(terminalId) + "\"";
   json += "},";
   json += "\"setup\":{";
   json += "\"setup_id\":\"" + CE_JsonEscape(safeSetupId) + "\",";
   json += "\"setup_name\":\"" + CE_JsonEscape(setupName) + "\",";
   json += "\"timeframe\":\"" + CE_JsonEscape(CE_AsciiId(timeframe)) + "\",";
   json += "\"family\":\"ENGINE\",";
   json += "\"max_hold_seconds\":" + maxHold;
   json += "},";
   json += "\"trade\":{";
   json += "\"symbol\":\"" + CE_JsonEscape(CE_AsciiId(symbol)) + "\",";
   json += "\"side\":\"" + safeSide + "\",";
   json += "\"order_type\":\"" + safeOrderType + "\",";
   json += "\"source_signal_time\":\"" + CE_Iso8601(CE_ServerToUtc(sourceCloseServer)) + "\",";
   json += "\"source_time_basis\":\"AXI_SERVER\",";
   json += "\"entry_price\":" + DoubleToString(entryPrice, digits) + ",";
   json += "\"stop_loss\":" + DoubleToString(stopLoss, digits) + ",";
   json += "\"take_profit\":" + DoubleToString(takeProfit, digits) + ",";
   json += "\"rr\":" + DoubleToString(rr, 4) + ",";
   json += "\"cancel_price\":" + cancel + ",";
   json += "\"valid_for_seconds\":" + validFor;
   json += "}";
   json += "}";

   string fileName = CE_OUTBOX_DIR + "\\" + signalId + ".json";
   return CE_WriteOutboxJson(fileName, json, signalId);
}

bool CryptoEdgePublishOrderFilled(
   string signalId,
   datetime sourceEventServer,
   double fillPrice,
   int digits
)
{
   if(!InpCE_Enabled) return true;
   string eventType = "ORDER_FILLED";
   string eventId = CE_MakeEventId(signalId, eventType);
   string json = "{";
   json += "\"schema_version\":\"axi_signal_lifecycle_v1\",";
   json += "\"event_type\":\"" + eventType + "\",";
   json += "\"event_id\":\"" + CE_JsonEscape(eventId) + "\",";
   json += "\"signal_id\":\"" + CE_JsonEscape(signalId) + "\",";
   json += "\"source_event_time\":\"" + CE_Iso8601(CE_ServerToUtc(sourceEventServer)) + "\",";
   json += "\"fill_price\":" + DoubleToString(fillPrice, digits);
   json += "}";
   string fileName = CE_OUTBOX_DIR + "\\" + signalId + ".zz.ORDER_FILLED.json";
   return CE_WriteOutboxJson(fileName, json, eventId);
}

bool CryptoEdgePublishSignalExpired(string signalId, datetime sourceEventServer)
{
   if(!InpCE_Enabled) return true;
   string eventType = "SIGNAL_EXPIRED";
   string eventId = CE_MakeEventId(signalId, eventType);
   string json = "{";
   json += "\"schema_version\":\"axi_signal_lifecycle_v1\",";
   json += "\"event_type\":\"" + eventType + "\",";
   json += "\"event_id\":\"" + CE_JsonEscape(eventId) + "\",";
   json += "\"signal_id\":\"" + CE_JsonEscape(signalId) + "\",";
   json += "\"source_event_time\":\"" + CE_Iso8601(CE_ServerToUtc(sourceEventServer)) + "\"";
   json += "}";
   string fileName = CE_OUTBOX_DIR + "\\" + signalId + ".zz.SIGNAL_EXPIRED.json";
   return CE_WriteOutboxJson(fileName, json, eventId);
}

bool CryptoEdgePublishSignalCancelled(string signalId, datetime sourceEventServer)
{
   if(!InpCE_Enabled) return true;
   string eventType = "SIGNAL_CANCELLED";
   string eventId = CE_MakeEventId(signalId, eventType);
   string json = "{";
   json += "\"schema_version\":\"axi_signal_lifecycle_v1\",";
   json += "\"event_type\":\"" + eventType + "\",";
   json += "\"event_id\":\"" + CE_JsonEscape(eventId) + "\",";
   json += "\"signal_id\":\"" + CE_JsonEscape(signalId) + "\",";
   json += "\"source_event_time\":\"" + CE_Iso8601(CE_ServerToUtc(sourceEventServer)) + "\"";
   json += "}";
   string fileName = CE_OUTBOX_DIR + "\\" + signalId + ".zz.SIGNAL_CANCELLED.json";
   return CE_WriteOutboxJson(fileName, json, eventId);
}

bool CryptoEdgePublishPositionClosed(
   string signalId,
   datetime sourceEventServer,
   double closePrice,
   string closeReason,
   int digits
)
{
   if(!InpCE_Enabled) return true;
   string eventType = "POSITION_CLOSED";
   string eventId = CE_MakeEventId(signalId, eventType);
   string json = "{";
   json += "\"schema_version\":\"axi_signal_lifecycle_v1\",";
   json += "\"event_type\":\"" + eventType + "\",";
   json += "\"event_id\":\"" + CE_JsonEscape(eventId) + "\",";
   json += "\"signal_id\":\"" + CE_JsonEscape(signalId) + "\",";
   json += "\"source_event_time\":\"" + CE_Iso8601(CE_ServerToUtc(sourceEventServer)) + "\",";
   json += "\"close_price\":" + DoubleToString(closePrice, digits) + ",";
   json += "\"close_reason\":\"" + CE_JsonEscape(CE_AsciiId(closeReason)) + "\"";
   json += "}";
   string fileName = CE_OUTBOX_DIR + "\\" + signalId + ".zz.POSITION_CLOSED.json";
   return CE_WriteOutboxJson(fileName, json, eventId);
}

#endif
