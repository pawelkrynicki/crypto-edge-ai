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
3. Run %USERPROFILE%\Documents\ChatGPT\KRAKEN_COPY\verify-current-engine.ps1 on Pablito.
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

## 9. Canonical command delivery rule

For VPS administration, ChatGPT must NEVER copy commands or scripts to Paweł's clipboard unless Paweł explicitly asks for that.
Default delivery is always directly in the chat, in one separate paste-ready code block/window.
Paweł copies that block manually into PowerShell on the VPS and returns the output in the same chat.
Do not replace the visible paste-ready block with clipboard actions.

## 10. Verified VPS snapshot - 2026-09-30

Verified manually on the Windows VPS via PowerShell.

Crypto Edge AI product runtime:
- loopback listener: 127.0.0.1:4180
- /api/health: status=ok
- service=crypto-edge-ai-product
- runtime_mode=INTERNAL_BETA
- observed PID: 9388
- Product Runtime scheduled task launches C:\CryptoEdge\start-cryptoedge-product-rc10.ps1 -Mode Product
- RC10 release directory exists: C:\CryptoEdge\releases\CAMP2026-VPS-RC10

Crypto Edge AI worker:
- scheduled task still launches C:\CryptoEdge\start-cryptoedge-ai-rc9.ps1 -Mode Worker
- therefore the VPS currently has a mixed RC10 Product / RC9 Worker startup configuration that must be reviewed before further deployment changes.

Bridge:
- RC10 bridge launcher file: absent
- RC10 axiMt4SignalBridge.ts: absent
- no running bridge process was observed
- therefore the decoupled MT4 -> Crypto Edge Bridge branch has NOT been deployed to the VPS yet.

MT4 / Crypto Engine on VPS:
- latest ALLinCrypto Engine EX4 is present on VPS
- observed VPS EX4 SHA256: 2A75A4D72CC96BEF3F07889194D34B2F0E0D44365F739FC3771ED2EE8AE66E96
- this matched the then-current local Pablito EX4 before the later verifier recompilation changed the local EX4 hash
- Engine is loaded on the MT4 chart
- active chart setting: InpCE_Enabled=false
- MT4 outbox was empty

Interpretation:
- Crypto Engine is running as the signal engine.
- Crypto Edge AI product is running separately.
- the transport Crypto Engine -> Crypto Edge AI is currently disabled/not deployed end-to-end.
- do not change setup logic to fix transport; complete Publisher/Bridge deployment separately.

## 11. Verified VPS launcher findings - 2026-09-30

Manual VPS PowerShell inspection showed three launcher patterns:

1. Product Runtime scheduled task uses:
C:\CryptoEdge\start-cryptoedge-product-rc10.ps1 -Mode Product
This launcher sets CRYPTO_EDGE_RELEASE_ROOT and delegates product startup to C:\CryptoEdge\start-cryptoedge-product.cmd.

2. Worker scheduled task uses:
C:\CryptoEdge\start-cryptoedge-ai-rc9.ps1 -Mode Worker
Its Worker branch validates INTERNAL_BETA/OpenAI worker config and runs pnpm ai:worker from its configured UiRoot.
Therefore Product and Worker are currently version-pinned to different release generations and must be reconciled deliberately.

3. Legacy generic launcher C:\CryptoEdge\start-cryptoedge.cmd contains:
cd /d %USERPROFILE%\Documents\GitHub\crypto-edge-ai\tools\ui-mock
call node_modules\.bin\vite.cmd preview --host 127.0.0.1 --port 4180
This launches from a mutable Git working tree, not an immutable C:\CryptoEdge\releases\... release. It must not be treated as the canonical production launcher. Before disabling/removing it, verify which Scheduled Task (if any) still invokes it and its current state/last result.

## 12. Verified active VPS processes - 2026-09-30

Process inspection confirmed the actual active runtime split:
- Crypto Edge Product is genuinely running from C:\CryptoEdge\releases\CAMP2026-VPS-RC10\tools\ui-mock\server\productVpsServer.ts.
- observed RC10 product process chain includes PID 10624 -> PID 9388.
- PID 9388 owns the healthy Product runtime on port 4180.
- Crypto Edge AI Worker is genuinely running from C:\CryptoEdge\releases\CAMP2026-VPS-RC9\tools\ui-mock\server\runAIResearchWorker.ts.
- observed worker process chain includes cmd/pnpm/tsx/node processes ending in RC9 runAIResearchWorker.ts.
- no active Vite preview process on port 4180 was observed, so the legacy C:\CryptoEdge\start-cryptoedge.cmd exists but is not the active Product runtime in this snapshot.

Canonical current VPS runtime state is therefore: RC10 Product + RC9 Worker + no MT4 Bridge + Crypto Engine publishing disabled (InpCE_Enabled=false).

## 13. Recovered canonical PROD / PREVIEW decision tree

This was already part of the wider Crypto Edge AI architecture and must not be reinvented in future chats.

PROD:
- canonical user-facing Crypto Edge AI runtime
- loopback product origin: 127.0.0.1:4180
- public/private domain path through existing Cloudflare Tunnel + Cloudflare Access
- changes are promoted here only after preview validation and owner approval
- do not use PROD as the first test surface for new KRAKEN Copy work

PREVIEW:
- separate pre-production/trusted-preview surface
- existing preview contract reserves port 4173 for preview service
- existing repo routes/scripts include #trusted-preview and preview launchers
- preview must remain private/gated, easy to disable, and not publicly open
- no secrets exposed, no browser provider calls
- preview is the validation surface before promotion to PROD

Promotion order:
1. Build candidate outside PROD.
2. Validate locally/offline and through existing preview checks.
3. Deploy candidate to PREVIEW only.
4. Owner/admin validates end-to-end behavior.
5. Only after PASS and explicit owner decision promote the same candidate to PROD.
6. Keep rollback available and do not change PROD during preview testing.

KRAKEN Copy visibility during current stage:
- OWNER / ADMIN only
- CAMP_USER and TRUSTED_TESTER must not see Trading/Kraken Copy surfaces yet
- CRYPTO_EDGE_EXECUTION remains disabled until separate executor validation

## 14. RC11 PREVIEW candidate checkpoint - 2026-09-30

RC11 has been built and packaged locally as a PREVIEW candidate only. PROD on the VPS has not been modified.

Candidate source branch:
feature/kraken-copy-02-decoupled-mt4-bridge

Candidate source commit:
59d5d45bd4c1e1a9e9ee56f54f23f2a29474671f

Focused validation before packaging:
- AXI MT4 Bridge: 5/5 PASS
- AXI Signal Gateway: 10/10 PASS
- Live Signals UI: 5/5 PASS
- Kraken Copy account/UI: 14/14 PASS
- Kraken Copy profile/planner: 5/5 PASS
- INTERNAL_BETA build boundary: PASS
- release packaging safety checks: PASS

Release id:
CAMP2026-VPS-RC11

Local artifact:
%USERPROFILE%\Documents\GitHub\crypto-edge-ai-kraken-bridge\release-artifacts\CAMP2026-VPS-RC11\crypto-edge-ai-CAMP2026-VPS-RC11-app.zip

Status: PREVIEW CANDIDATE. Do not promote to PROD until isolated preview deployment, owner/admin end-to-end PASS, and explicit owner promotion decision.
