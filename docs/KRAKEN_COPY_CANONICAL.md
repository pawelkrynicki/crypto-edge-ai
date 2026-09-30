# KRAKEN COPY - CANONICAL CONTEXT

Status: canonical. Use this file as the first reference in every new KRAKEN Copy chat.

## 1. What is what

### ALLinCrypto Engine / Crypto Engine
Crypto Engine is ONLY the source of trading signals.
It is an MT4 EA running on AXI on the VPS.
Its job is to detect setups and emit a finished signal with entry, SL, TP, RR, validity and setup metadata.
It is NOT Crypto Edge AI and it is NOT Kraken Copy.
Paweł may add, remove or change setups frequently.
Those setup changes must not require rebuilding the Kraken Copy integration.

### Crypto Edge AI
Crypto Edge AI is Paweł's separate, broad cryptocurrency platform / crypto command center.
It contains many crypto functions and modules.
Live trading signals are only one part of Crypto Edge AI.
KRAKEN Copy is one module inside Crypto Edge AI, not the whole project.

## 2. Canonical integration architecture

ALLinCrypto Engine
-> CryptoEdgePublisher.mqh
-> MetaTrader COMMON Files\CryptoEdge\outbox\*.json
-> CryptoEdge Bridge on VPS
-> local Crypto Edge AI AXI Signal Gateway
-> Live Signals inside Crypto Edge AI
-> Equity Planner
-> later: Kraken Executor / copy trading

The integration boundary is the emitted signal, not a specific setup list.
CryptoEdgePublisher.mqh must remain setup-agnostic.
It must not know setup A, B, H, J, K etc. beyond receiving setup_id as data.
It must not contain Kraken logic, HTTP credentials or Crypto Edge bearer token.

## 3. Required stable hooks in Crypto Engine

The Engine should permanently contain only three integration points:
1. #include <CryptoEdgePublisher.mqh>
2. CryptoEdgeInit() in OnInit()
3. CryptoEdgePublishSignal(...) after a valid signal is fully calculated, before AUTO/SIGNALS execution gating.

If Claude changes setup logic, these hooks are preserved.
The trading logic and the publisher are separate concerns.

## 4. Machines and runtime

### Pablito
Pablito is Paweł's local development machine for creating, editing, compiling and verifying MT4 robots and Crypto Edge code.
Pablito is NOT the production signal runtime.
Do not treat a local Pablito file as proof of what currently runs on the VPS.

### VPS
The VPS is the canonical 24/7 runtime.
MT4 + AXI + the current Crypto Engine run there.
Crypto Edge AI also runs there as a separate application/runtime.
The state of MT4 and the state of Crypto Edge AI must be verified separately.
A new Crypto Engine copied to the VPS does NOT automatically mean the Crypto Edge AI application or Bridge was updated.

## 5. Current verified local Engine snapshot - 2026-09-30 10:58 CEST

Current local ALLinCrypto Engine has 9 setups:
A, B, C, D, E, F, H, J, K.
It still contains all three Crypto Edge hooks.
It compiles with 0 errors and 0 warnings.
Current publisher stayed unchanged while setup K and other Engine changes were added.
This proves the intended setup-independent integration model works for the current change.

Current local Engine SHA256:
6503BB886A6D5CDB7589DA054F21B58090DA979EA96B71F4498FCCFED9969AD5

Current CryptoEdgePublisher.mqh SHA256:
0BEA43AB48159BE796079664BC260A021BE14496FA6CB24FBF051B50202715DC

## 6. Current integration code snapshot

The setup-independent MT4 publisher and separate VPS Bridge are implemented on:
feature/kraken-copy-02-decoupled-mt4-bridge
commit 6a08449b2b921e61facfb22cc0891dea694350a0

Bridge responsibility ends at the existing AXI Signal Gateway.
It does NOT place Kraken orders.
It reads MT4 COMMON outbox JSON, sends it locally to Crypto Edge AI and archives sent/rejected files.
Focused Bridge tests: 5/5 pass.
AXI Signal Gateway tests: 10/10 pass.
Internal-beta build passes.

Do NOT assume this branch is deployed on the VPS just because it exists locally/GitHub.
VPS deployment state must always be checked separately.

## 7. Canonical workflow after any future Crypto Engine change

1. Claude/Paweł changes ONLY Crypto Engine setup/trading logic.
2. Preserve the three Crypto Edge hooks.
3. Run C:\Users\pawel\Documents\ChatGPT\KRAKEN_COPY\verify-current-engine.ps1 on Pablito.
4. It must return KRAKEN_COPY_ENGINE_CHECK=PASS and 0 errors / 0 warnings.
5. Copy the verified Engine source/ex4 to the VPS MT4 runtime.
6. Do NOT edit CryptoEdgePublisher.mqh or CryptoEdge Bridge merely because setups changed.
7. Only change the integration layer if the generic signal contract itself changes.

This is the permanent rule: setup changes are routine Engine changes, not Kraken Copy integration projects.

## 8. Canonical VPS access method

As of 2026-09-30, Desktop Commander does NOT expose the production Windows VPS as a connected device.
Connected devices are Pablito and Paweł's second laptop only.
Do not claim direct VPS inspection unless the VPS appears as its own connected device or another authenticated admin channel is explicitly established.

The proven administration method used in prior Crypto Edge deployments is:
1. Paweł opens PowerShell directly on the Windows VPS, preferably as Administrator.
2. ChatGPT provides commands/audit scripts.
3. Paweł pastes them into that VPS PowerShell.
4. ChatGPT analyzes the returned output and provides the next command if needed.

Crypto Edge AI VPS root: C:\CryptoEdge
Product loopback: http://127.0.0.1:4180
Persistent state: C:\CryptoEdge\state
Config: C:\CryptoEdge\config\cryptoedge-ai-v7.env
Releases: C:\CryptoEdge\releases\...
Public app: https://cryptoedge.crmallintraders.pl behind Cloudflare Access.

Never infer VPS state from Pablito files. Verify MT4/Engine and Crypto Edge AI separately on the VPS.
