#ifndef CRYPTO_EDGE_PUBLISHER_MQH
#define CRYPTO_EDGE_PUBLISHER_MQH

//+------------------------------------------------------------------+
//| CryptoEdgePublisher.mqh - wspolny publisher sygnalow Crypto Edge |
//| Niezalezny od setupow i od wersji Engine.                        |
//| Engine MUSI zadeklarowac PRZED #include <CryptoEdgePublisher.mqh>:|
//|   input bool   InpCE_Enabled     = true;                         |
//|   input string InpCE_EngineVer   = "<= #property version>";      |
//|   input string InpCE_StrategyVer = "<wersja strategii>";         |
//|   input string InpCE_TerminalId  = "";                           |
//| Publisher tylko czyta te wartosci; brak deklaracji = blad        |
//| kompilacji (celowo - bez cichych wartosci domyslnych).           |
//| Tylko zapis do FILE_COMMON\CryptoEdge\outbox (bez HTTP).         |
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
   string signalId = CE_MakeSignalId(terminalId, safeSetupId, sourceCloseServer, safeSide, safeOrderType);

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
   int h = FileOpen(fileName, FILE_WRITE|FILE_BIN|FILE_COMMON);
   if(h == INVALID_HANDLE)
   {
      Print("ALLinCrypto CE: cannot write outbox file for ", signalId, ", error ", GetLastError());
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
      Print("ALLinCrypto CE: incomplete outbox write for ", signalId);
      return false;
   }
   return true;
}

#endif
