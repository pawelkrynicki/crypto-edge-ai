# KRAKEN COPY - CANONICAL CONTEXT

Status: canonical. Use this file as the first reference in every new KRAKEN Copy chat.

# START HERE — CURRENT CANONICAL STATE

**MANDATORY:** Before doing anything in a new KRAKEN Copy chat, read this section first. Do not reconstruct architecture, ports, deployment state, or next steps from memory. If older sections conflict with START HERE, START HERE wins.

## System roles
- **ALLinCrypto Engine / Crypto Engine** = MT4 EA on AXI VPS; ONLY source/generator of trading signals.
- **Crypto Edge AI** = separate broad crypto platform.
- **KRAKEN Copy** = one module inside Crypto Edge AI.
- Setup changes in Crypto Engine are routine Engine changes and must not rebuild the integration layer.

## Canonical ports / environments
- **4180 = PROD Crypto Edge AI**. Do not modify during preview testing.
- **4280 = canonical KRAKEN Copy / Crypto Edge AI PREVIEW**.
- **4173 = BSS / bet-smart-system preview**. Never use for Crypto Edge.
- **4181 = temporary troubleshooting owner-review slot; retired and not canonical.**

## Current verified PREVIEW state — 2026-10-08
- **RC15 PREVIEW is live on `127.0.0.1:4280`.**
- PREVIEW health = `ok`.
- PREVIEW RC15 runtime build SHA = `c7702f215e5f569ede643ffd5fb6b43bbbb30a83`.
- RC15 Bridge is running and targets PREVIEW `4280`.
- Historical executed trades were reconciled against MT4/broker logs on PREVIEW only. Current reference equity is 9,566.01 USD from 9 CLOSED broker-executed trades; source-only records with no MT4 ticket are excluded from equity.
- B BTCUSD ticket 301285982 is CLOSED / TP / +2.06371R. E ETHUSD ticket 300745776 is CLOSED / SL / -1.002151R.
- Source-only records with no broker ticket must not be presented as active trades. Next candidate simplifies them to SYGNAŁ / SIGNAL.
- Local next-candidate refresh behavior is implemented and validated: full product snapshot every 15 minutes; Live Signals feed + reference equity poll every 2 seconds and refresh immediately on window focus.
- PROD `4180` remained untouched and running.
- Canonical VPS MT4 `CRYPTO ENGINE` remained untouched.

## What is proven / still blocked
- **PROVEN:** genuine runtime Crypto Engine source signals reach Crypto Edge AI PREVIEW 4280.
- **PROVEN:** RC14 lifecycle backend, Bridge routing, Live Signals lifecycle read-model and 10k reference equity work in isolated PREVIEW acceptance.
- **PROVEN:** Kraken Executor DRY-RUN and RC13/RC14 live-pilot safety preflight remain fail-closed with real submission disabled.
- **PROVEN:** Kraken Futures credential/auth readiness was verified separately with General API FULL_ACCESS and Transfer/Withdrawal NO_ACCESS.
- **BLOCKED:** lifecycle-capable Engine 1.10 is NOT deployed to the canonical VPS MT4 runtime during current PREVIEW testing.
- **BLOCKED:** real Kraken order submission and PROD promotion.

## Current hard safety state
- PROD Crypto Edge AI `4180` = frozen. Do not modify during current tests.
- Canonical VPS MT4 `CRYPTO ENGINE` = frozen for change-control purposes. Do not deploy the lifecycle-capable Engine build without separate explicit Paweł approval.
- PREVIEW `4280` is the only active product test surface.
- `CRYPTO_EDGE_EXECUTION=0`.
- `CRYPTO_EDGE_KRAKEN_LIVE_PILOT=0`.
- Real Kraken order submission remains OFF.
- Hard code ceiling for any future owner-approved live pilot candidate remains 25 USD notional.
- PROD promotion remains blocked until PREVIEW acceptance is complete and Paweł explicitly approves promotion.

## NEXT SINGLE STEP
**Package and deploy the refresh/status candidate to PREVIEW 4280 only.**

Required next acceptance sequence:
1. Keep PROD `4180` and canonical MT4 `CRYPTO ENGINE` untouched.
2. Package a new immutable PREVIEW candidate containing: SYGNAŁ / SIGNAL for source-only records, no technical warning prose, 15-minute product snapshot refresh, and 2-second Live Signals + equity background refresh.
3. Publish the archive through GitHub Releases and download it directly on the VPS with SHA256 verification.
4. Deploy only to PREVIEW `4280` with rollback to RC15 on failure.
5. Verify a new MARKET source signal appears on Live Signals within a few seconds without F5.
6. Verify TP/SL/equity changes appear automatically without F5.
7. Verify the rest of Crypto Edge AI refreshes automatically on the 15-minute snapshot cadence.
8. PROD promotion remains blocked.

## Hard process rules
- Never deploy new KRAKEN Copy work first to PROD. PREVIEW first, PROD only after PASS + explicit Paweł approval.
- Never change Crypto Engine setup/trading logic merely to fix transport/copy integration.
- Never infer VPS state from Pablito.
- VPS admin commands/scripts are always pasted visibly in chat in a separate paste-ready code block. Never copy them to clipboard unless Paweł explicitly asks.
- Keep this file updated after every meaningful PASS/FIX/STOP checkpoint.


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

## 15. Canonical VPS port ownership - 2026-09-30

Verified on VPS:
- 4173 is occupied by BSS / bet-smart-system frontend Vite preview. Do not use it for Crypto Edge.
- legacy Scheduled Task `Crypto Edge AI Preview` is Disabled and points to old `C:\CryptoEdge\start-cryptoedge.cmd`; do not re-enable it.
- 4180 is Crypto Edge AI PROD.
- 4181 is free and already has an existing Crypto Edge owner-review convention in repo (`start-feedback-loop-review.cmd`).

Canonical decision:
- use 4181 for RC11 KRAKEN Copy PREVIEW.
- keep 4180 PROD untouched during preview validation.
- preview uses isolated release/state and OWNER/ADMIN visibility.
- preview Kraken mode is SIMULATED and CRYPTO_EDGE_EXECUTION=0.
- preview Bridge targets 127.0.0.1:4181, never PROD 4180 during validation.

## 16. RC11 PREVIEW live on VPS - 2026-09-30

Verified manually on VPS after deployment:
- PROD remains on 127.0.0.1:4180, observed PID 9388.
- RC11 PREVIEW is live on 127.0.0.1:4181, observed PID 13700.
- PREVIEW /api/health returned status=ok, service=crypto-edge-ai-product, runtime_mode=INTERNAL_BETA.
- PREVIEW build_sha reported 59d5d45bd4c1e1a9e9ee56f54f23f2a29474671f.
- PREVIEW role default = OWNER.
- PREVIEW Kraken mode = SIMULATED.
- PREVIEW CRYPTO_EDGE_EXECUTION = OFF.
- PREVIEW AXI Gateway = ON.
- Bridge launcher was started with endpoint target 127.0.0.1:4181.
- Crypto Engine publishing is still disabled: InpCE_Enabled=false.

Next gate before enabling Engine publishing:
1. independently verify the Bridge process is alive;
2. prove one synthetic/test signal reaches RC11 PREVIEW and is readable in Live Signals;
3. only then set InpCE_Enabled=true on the VPS Crypto Engine.

## 17. Full transport smoke PASS - 2026-09-30

Verified on VPS with a synthetic signal written into the real MetaTrader COMMON CryptoEdge outbox:
- signal id: preview-smoke-20260930123512
- OUTBOX -> Bridge: PASS
- Bridge -> RC11 PREVIEW AXI Gateway: PASS
- signal stored/readable in RC11 PREVIEW
- setup: PREVIEW_SMOKE
- symbol: BTCUSD
- final result: FULL TRANSPORT TEST = PASS

This proves the entire decoupled transport path before enabling the real Engine publisher:
MetaTrader COMMON outbox -> separate Bridge -> RC11 PREVIEW AXI Gateway -> Live Signals storage.

Safety state at PASS:
- PROD 4180 untouched
- PREVIEW 4181 only
- Kraken SIMULATED
- CRYPTO_EDGE_EXECUTION=0
- real Crypto Engine InpCE_Enabled still false

Next canonical step: enable InpCE_Enabled=true on the actual ALLinCrypto Engine chart on the VPS. Do not change setup/trading logic. Then observe the next genuine Engine-generated signal reaching RC11 PREVIEW.

## 18. CORRECTION - canonical PREVIEW port is 4280

This section SUPERSEDES the earlier temporary 4181 preview-port decision in sections 15-17.

User-provided VPS browser evidence confirms the established KRAKEN Copy / Crypto Edge AI PREVIEW used before this session is:
- http://127.0.0.1:4280
- route shown: #live-signals
- this preview already displayed the earlier source-signal smoke record and Kraken Copy navigation.

Correct canonical port ownership:
- 4180 = Crypto Edge AI PROD
- 4280 = canonical Crypto Edge AI / KRAKEN Copy PREVIEW
- 4173 = BSS / bet-smart-system frontend preview; never use for Crypto Edge
- 4181 = temporary owner-review slot accidentally used during 2026-09-30 troubleshooting; NOT canonical KRAKEN Copy preview and must be retired after verification

Operational correction:
- do NOT enable ALLinCrypto Engine publishing while Bridge still targets 4181
- verify 4280 health/build/process first
- stop temporary RC11 product/Bridge processes bound to the accidental 4181 preview stack
- deploy/verify RC11 on canonical PREVIEW 4280 if needed
- retarget Bridge to 127.0.0.1:4280
- repeat one transport smoke against 4280
- only after PASS enable InpCE_Enabled=true on the real VPS Engine

## 19. Canonical RC11 PREVIEW restored on 4280 - 2026-09-30

Verified on VPS after correcting the temporary 4181 detour:
- PROD remains healthy on 127.0.0.1:4180, observed PID 9388.
- canonical KRAKEN Copy / Crypto Edge AI PREVIEW is live on 127.0.0.1:4280, observed PID 14056.
- temporary 4181 preview stack is stopped; 4181 no longer listens.
- PREVIEW health: status=ok, service=crypto-edge-ai-product, runtime_mode=INTERNAL_BETA.
- PREVIEW build_sha: 59d5d45bd4c1e1a9e9ee56f54f23f2a29474671f.
- Bridge target is canonical PREVIEW 4280.
- synthetic outbox smoke id preview4280-smoke-20260930130431 passed:
  OUTBOX -> BRIDGE = PASS
  BRIDGE -> PREVIEW 4280 = PASS
  FULL TRANSPORT TEST 4280 = PASS
- CRYPTO_EDGE_EXECUTION remains OFF.
- real ALLinCrypto Engine publishing remains OFF (InpCE_Enabled=false).

This is the restored canonical baseline. Next step, only after this PASS, is to enable InpCE_Enabled=true on the real VPS ALLinCrypto Engine without changing setup/trading logic, then observe the next genuine Engine signal arriving on PREVIEW 4280.

## 20. Canonical end-to-end acceptance gate before PROD

Do NOT promote KRAKEN Copy to PROD and do NOT treat Engine->Live Signals as sufficient validation.

Current RC11 boundary verified 2026-09-30:
- Kraken account reader exists.
- Equity Planner exists and ends at planned USD notional.
- Kraken order executor does NOT yet exist.
- krakenAccount execution_enabled is hard-coded false.
- Kraken Copy UI explicitly has no copy switch, auto-trading, Kraken order endpoint, or final order quantity.

Therefore the required PREVIEW acceptance path is:
1. Build Kraken Executor in PREVIEW/DRY-RUN mode first.
2. Add Kraken instrument adapter: source symbol -> Kraken Futures instrument + exchange constraints/contract sizing.
3. Convert Equity Planner planned USD notional into an exact Kraken order quantity without guessing contract facts.
4. Produce an idempotent order intent with MARKET/LIMIT, side, quantity, entry constraints, SL/TP linkage, and safe reason codes.
5. Keep real Kraken order submission disabled during initial PREVIEW tests.
6. Only when executor DRY-RUN is ready, enable InpCE_Enabled=true on the real VPS ALLinCrypto Engine while Bridge still targets canonical PREVIEW 4280.
7. Observe a genuine Engine signal through: Engine -> Outbox -> Bridge -> Live Signals -> Equity Planner -> Kraken Executor DRY-RUN.
8. Verify blocked/reduced/error/idempotency behavior and no duplicate orders.
9. Then run a separately approved controlled live Kraken pilot with minimum safe exposure.
10. Only after full E2E PASS and explicit owner approval promote the validated candidate to PROD 4180.

Until step 6, keep real Engine InpCE_Enabled=false. PROD remains untouched.

## 21. Real Engine publisher enabled on VPS - 2026-09-30

Paweł enabled `InpCE_Enabled=true` in the actual ALLinCrypto Engine inputs on the VPS MT4 chart and confirmed it was applied.
No other Engine parameter was intentionally changed.

Current gate:
- wait for the first genuine signal produced by the real Engine after this enablement;
- match the same signal_id from MetaTrader COMMON sent archive through Crypto Edge AI PREVIEW 4280 Live Signals;
- verify setup, symbol, side, entry, SL and TP;
- only then mark `REAL ENGINE -> CRYPTO EDGE AI = PASS`.

Kraken remains out of scope until this gate passes.

## 22. REAL ENGINE -> CRYPTO EDGE AI PREVIEW = PASS - 2026-09-30

Confirmed from Paweł's VPS screenshots of the actual MT4 Engine and Crypto Edge AI PREVIEW 4280.

Real Engine signal:
- setup J / Pullback EMA50
- symbol ETHUSD
- timeframe H4
- side BUY
- source signal entry 2731.235
- stop loss 2652.118
- Engine subsequently opened the MT4 position at fill 2731.810 with 1.26 lots; this fill is execution state and is intentionally separate from the source signal record.

Crypto Edge AI PREVIEW Live Signals showed the corresponding source record:
- ETHUSD H4
- BUY / MARKET
- source entry 2731.235
- stop loss 2652.118
- take profit 3047.702
- RR 1:4
- max hold 14d
- engine ALLinCrypto Engine 1.00
- source signal time 2026-09-30 15:00:00 UTC-equivalent display
- received 2026-09-30 15:00:01

Conclusion: the real runtime path from the actual ALLinCrypto Engine on MT4 through publisher/outbox/Bridge into Crypto Edge AI PREVIEW Live Signals is proven end-to-end.

Canonical gate result: REAL ENGINE -> CRYPTO EDGE AI = PASS.
Kraken work may now proceed on PREVIEW only; PROD 4180 remains untouched.

## 23. Kraken Executor DRY-RUN local candidate - 2026-10-05

Branch: `feature/kraken-copy-03-executor-dry-run` based on canonical integration HEAD `7f7142328bae7db33f4f9ad520f3d6d054419970`.

Implemented locally only:
- public Kraken flexible-futures instrument adapter;
- explicit Engine symbol mapping: BTCUSD -> PF_XBTUSD, ETHUSD -> PF_ETHUSD, SOL-USD -> PF_SOLUSD;
- instrument facts from Kraken public instruments endpoint: tradeable, tick size, contract size, contract value trade precision, max position size;
- quantity calculation for flexible futures as planned USD notional / reference price, rounded down to Kraken trade precision;
- deterministic/idempotent DRY-RUN order intent;
- directional tick alignment for entry/SL/TP that does not worsen source risk;
- OWNER/ADMIN-only GET endpoint per stored signal;
- response is explicitly `execution_submitted=false` and `execution_boundary=NO_KRAKEN_ORDER_SUBMISSION`.

Verification:
- Kraken Executor DRY-RUN tests: 14/14 PASS, including the real J/ETHUSD source geometry from the verified Engine signal;
- existing Bridge tests: 5/5 PASS;
- AXI Signal Gateway: 10/10 PASS;
- Live Signals UI: 5/5 PASS;
- Kraken account/UI: 14/14 PASS;
- Kraken Copy profile/planner: 5/5 PASS;
- total focused/regression tests in this pass: 53 PASS, 0 FAIL;
- INTERNAL_BETA build: PASS;
- git diff check: PASS;
- safety scan: no sendorder/placeOrder/submitOrder/private Kraken order submission path added.

This candidate is NOT deployed yet. PROD remains untouched. Next step: commit/package as RC12 and deploy only to canonical PREVIEW 4280 for validation against the genuine stored Engine signal.

## 24. RC12 Kraken Executor DRY-RUN package ready - 2026-10-05

Source commit: `3273d55ce28e47a23282a9f87e89407379d01738` on `feature/kraken-copy-03-executor-dry-run`.

Release candidate:
- release id: CAMP2026-VPS-RC12
- local archive: `%USERPROFILE%\Documents\GitHub\crypto-edge-ai-kraken-bridge\release-artifacts\CAMP2026-VPS-RC12\crypto-edge-ai-CAMP2026-VPS-RC12-app.zip`
- size: 2303205 bytes
- SHA256: `588179D9D9D5A0E56D0767F98A306FB0E60B02A9C9ED73073D9B3F550216AE35`
- package safety gate: PASS

RC12 is a PREVIEW candidate only. It must be deployed to canonical PREVIEW 4280, reusing preview state, with `CRYPTO_EDGE_EXECUTION=0`. PROD 4180 must remain untouched.

Required first PREVIEW validation after deploy: select the genuine J/ETHUSD signal already stored from the real Engine, call its OWNER/ADMIN-only `kraken-order-intent` DRY-RUN endpoint twice, verify same intent id/quantity, `execution_submitted=false`, instrument `PF_ETHUSD`, and no private Kraken order submission.

## 25. RC12 PREVIEW Kraken Executor DRY-RUN = PASS - 2026-10-05

Confirmed on the VPS canonical PREVIEW 4280 using a genuine ALLinCrypto Engine signal already present in Crypto Edge AI.

Observed real signal:
- signal_id: `acc1246441380-j-1790928000-BUY-MARKET`
- setup: J
- symbol: ETHUSD
- side: BUY
- source entry: 2742.645
- source SL: 2667.171
- source TP: 3044.542

Kraken Executor DRY-RUN result:
- mode: DRY_RUN
- plan status: READY
- Kraken instrument: PF_ETHUSD
- order status: READY
- order side: buy
- order type: mkt
- quantity: 0.662 ETH
- quantity step: 0.001
- planned notional USD: 1816.9468956196797
- intent_id: `ki_a9f5c8e1e7ae895890fe09c3b9e69cc0`
- execution_submitted: false
- execution_boundary: NO_KRAKEN_ORDER_SUBMISSION

Idempotency re-run: PASS (same intent id / same quantity).

Acceptance gates:
- RC12 PREVIEW 4280 = PASS
- REAL ENGINE -> LIVE SIGNALS = PASS
- LIVE SIGNAL -> EQUITY PLANNER = PASS
- EQUITY PLAN -> KRAKEN INSTRUMENT = PASS
- KRAKEN ORDER INTENT DRY-RUN = PASS
- IDEMPOTENCY = PASS
- EXECUTION SUBMITTED = FALSE
- PROD 4180 = UNTOUCHED / RUNNING

Canonical conclusion: PREVIEW DRY-RUN gate is closed with PASS. Real Kraken execution remains disabled and requires a separate owner-approved live pilot design and gate before any order submission is allowed.

## 26. RC13 live-execution safety core local candidate - 2026-10-05

Branch: `feature/kraken-copy-04-live-execution-gate`, based on RC12 checkpoint `f2c52ca61d8da27a6facd1df439676adfe814ddf`.

Official Kraken contract verified before implementation:
- Derivatives REST private base: `https://futures.kraken.com/derivatives/api/v3`;
- send order: POST `/api/v3/sendorder`, General API key with FULL_ACCESS;
- private auth: `APIKey` + `Authent`, signing URL-encoded postData + optional nonce + endpointPath with SHA-256 then HMAC-SHA-512 using base64-decoded secret;
- send order fields used: orderType, symbol, side, size, cliOrdId, optional limitPrice/stopPrice/triggerSignal/reduceOnly/processBefore;
- `result=success` alone is not enough; `sendStatus.status` must be checked;
- reconciliation: POST `/api/v3/orders/status` with `cliOrdIds`, for open orders or recently filled/cancelled orders.

Local RC13 safety core implemented:
- hard pilot ceiling `HARD_MAX_KRAKEN_LIVE_PILOT_NOTIONAL_USD = 25`;
- explicit gate: OWNER only, `CRYPTO_EDGE_EXECUTION=1`, separate `CRYPTO_EDGE_KRAKEN_LIVE_PILOT=1`, KRAKEN_LIVE account, General FULL_ACCESS, exact approved intent id, exact symbol, explicit max notional <= hard cap;
- live pilot request caps source order quantity down to the configured pilot notional and Kraken quantity step;
- deterministic globally unique-style `cliOrdId` derived from intent id;
- SL/TP request builder uses actual filled quantity, opposite side, `reduceOnly=true`, mark trigger; peer cancel is explicitly required after first exit fills;
- `processBefore` stale-request protection on live send;
- persistent SQLite execution ledger reserves intent before transport and prevents duplicate submit across process restarts;
- transport ambiguity/timeout is never auto-retried;
- reconciliation by `cliOrdId` exists as a separate read path;
- read-only OWNER preflight endpoint: `/api/v1/trading/signals/:id/kraken-live-pilot-plan`;
- preflight returns `submission_route_exposed=false` and `execution_submitted=false`;
- no runtime/API/UI reference invokes `createKrakenLiveExecutionService(...).execute()`.

Validation after all changes:
- full focused/regression suite: 67 PASS, 0 FAIL;
- new live gate + transport + ledger + reconciliation + preflight tests PASS;
- INTERNAL_BETA build PASS;
- runtime execution path scan: `NO_RUNTIME_EXECUTION_REFERENCES`;
- `CRYPTO_EDGE_EXECUTION` repository default = false;
- git diff check PASS.

No live Kraken request was made during development or testing; all private send/status tests used mocked transports.

## 27. RC13 package ready - 2026-10-05

Source/app commit: `2c589466c5397d84cbd424f206cf808065ae0108` on `feature/kraken-copy-04-live-execution-gate`.

Release candidate:
- release id: `CAMP2026-VPS-RC13`
- local archive: `%USERPROFILE%\Documents\GitHub\crypto-edge-ai-kraken-bridge\release-artifacts\CAMP2026-VPS-RC13\crypto-edge-ai-CAMP2026-VPS-RC13-app.zip`
- size: 2327087 bytes
- SHA256: `CC90A1BBDDBD7C67CFB0970E53E853C292979E3335BD2CA819AC570C96B82F99`
- packaging/build safety gate: PASS

RC13 deployment rule: PREVIEW 4280 only, with `CRYPTO_EDGE_EXECUTION=0`. The live submit service remains unexposed. First VPS acceptance is read-only preflight only; no real Kraken private order call is permitted.

## 26. RC13 PREVIEW live-pilot preflight = PASS - 2026-10-05

Confirmed from VPS canonical PREVIEW 4280.

Observed genuine Engine signal used by RC13 preflight:
- signal_id: `ACC1246441380-D-1791165600-BUY-MARKET`
- setup: D
- symbol: ETHUSD
- side: BUY
- entry: 2731.17
- SL: 2700.75
- TP: 2807.22

Existing DRY-RUN:
- intent_id: `ki_599c601787c8d758c46d68f6826a2160`
- quantity: 1.643 ETH
- DRY-RUN = PASS

Live-pilot preflight state:
- mode: PREFLIGHT_ONLY
- submission_route_exposed: false
- execution_submitted: false
- live_gate.allowed: false
- blocking reasons include EXECUTION_FLAG_OFF, PILOT_FLAG_OFF, KRAKEN_MODE_NOT_LIVE, ACCOUNT_NOT_LIVE, ACCOUNT_NOT_FULL_ACCESS, APPROVED_INTENT_MISSING, PILOT_SYMBOL_MISSING
- hard max notional: 25 USD
- configured max notional: 25 USD

Acceptance result:
- RC13 PREVIEW 4280 = PASS
- existing DRY-RUN = PASS
- live pilot preflight = PASS
- submission route exposed = false
- execution submitted = false
- CRYPTO_EDGE_EXECUTION = OFF
- live pilot flag = OFF
- hard pilot cap = 25 USD
- PROD 4180 = untouched / running

Canonical conclusion: RC13 PREVIEW safety/preflight gate is PASS. Next gate is live Kraken account readiness on PREVIEW with server-side credentials while both execution flags remain OFF. No real order submission is permitted yet.

## 27. Kraken Futures credentials/auth readiness = PASS - 2026-10-05

Verified manually on VPS against official Kraken Futures private endpoints using a newly generated Futures API key pair.

Result:
- API key format: PASS
- private key Base64 format: PASS (88 chars, 66 decoded bytes)
- Kraken API-key check: AUTH = PASS
- General API permission = FULL_ACCESS
- Transfer/Withdrawal API permission = NO_ACCESS
- live accounts read endpoint = PASS
- keys saved to disk during this verification = false
- order endpoint called = false

Canonical conclusion: the new Kraken Futures key pair is valid and has the exact required permission split for the live pilot. Next step is to store this verified pair only in PREVIEW server-side secrets, switch PREVIEW account source to KRAKEN_LIVE, keep `CRYPTO_EDGE_EXECUTION=0` and `CRYPTO_EDGE_KRAKEN_LIVE_PILOT=0`, then verify connected account readiness and preflight remains blocked only by explicit execution/pilot approval gates.

## 28. Canonical KRAKEN Copy distribution model: LEADER -> FOLLOWERS - 2026-10-05

Owner-confirmed target architecture:

- Paweł's Kraken Futures account is the **KRAKEN LEADER ACCOUNT**.
- The real Crypto Engine signal is first evaluated in Crypto Edge AI and executed on the LEADER account.
- Copy distribution begins only after the LEADER order has a confirmed Kraken order/fill state according to the execution/reconciliation rules.
- Each user who opts into KRAKEN Copy connects their own Kraken Futures account as a **FOLLOWER ACCOUNT** using their own server-side credentials.
- Follower accounts never receive the LEADER position size 1:1. They receive the trade intent and calculate their own quantity using follower equity, risk profile, leverage/caps and exchange constraints.
- Each follower has independent order execution, idempotency, audit trail, failure status and reconciliation.
- One follower failure must not block or duplicate execution for other followers.
- The system must never use Paweł's LEADER credentials to trade on follower accounts.

Canonical high-level flow:
`Crypto Engine -> Crypto Edge AI -> Equity/Risk Planner -> KRAKEN LEADER EXECUTOR -> Kraken LEADER order/fill confirmation -> COPY ORCHESTRATOR -> per-user FOLLOWER Risk Adapter -> per-user Kraken FOLLOWER Executor`.

Planned validation sequence after LEADER live pilot PASS:
1. Leader fill event -> Copy Orchestrator contract.
2. Multi-user follower simulator / DRY-RUN.
3. Per-follower risk sizing and idempotency.
4. First test FOLLOWER account on PREVIEW.
5. Only after follower E2E PASS may KRAKEN Copy distribution be considered for PROD/users.

## 29. Kraken OAuth / API Partner outreach sent - 2026-10-05

A formal technical inquiry was sent from the corporate mailbox:
- from: pawel.krynicki@allintraders.com
- to: vipdesk@kraken.com
- subject: Kraken Connect OAuth for Futures copy trading - API Partner inquiry
- send status: PASS
- UTC send time: 2026-10-05T11:50:43.1365072Z
- BCC copy to sender: yes

The inquiry asks Kraken to confirm the partner-grade follower onboarding path for Futures, specifically:
- whether Kraken Connect OAuth / Fast API Keys can authenticate Kraken Futures / Derivatives endpoints;
- required OAuth scopes for trading with Transfer/Withdrawal disabled;
- Futures authentication model after OAuth;
- IP restriction capability;
- recommended API Partner flow for automated/copy trading;
- fallback partner-grade onboarding if OAuth does not support Futures;
- partner attribution / broker identifiers;
- availability of UAT or sandbox for end-to-end testing.

Canonical decision remains:
- LEADER work may continue.
- FOLLOWER credential/onboarding architecture must not be finalized until Kraken clarifies OAuth/Futures support.

## 30. Corporate email signature rule - 2026-10-05

For all future external communication sent from Paweł's corporate mailbox pawel.krynicki@allintraders.com:
- use the mailbox's existing configured corporate signature exactly as stored in the mail client/webmail;
- do not invent or manually recreate a substitute signature;
- when sending through direct SMTP, remember that the webmail signature is not appended automatically, so retrieve the current signature first and include it explicitly;
- if the signature cannot be read/verified, stop before sending and ask Paweł rather than sending without it.

## 31. RC13 PREVIEW + Bridge restored after VPS reboot; autostart configured - 2026-10-06

Verified directly on the Windows VPS after an unexpected reboot:
- RC13 PREVIEW health on 127.0.0.1:4280 = PASS;
- runtime build SHA = 2c589466c5397d84cbd424f206cf808065ae0108;
- RC13 MT4 Bridge -> 4280 = RUNNING;
- genuine archived ALLinCrypto Engine signal replay through the Bridge to PREVIEW = PASS;
- MT4 terminal processes are running;
- PROD 4180 remained untouched/running;
- CRYPTO_EDGE_EXECUTION remains OFF.

Persistent Windows Scheduled Tasks created:
- Crypto Edge AI KRAKEN Preview RC13
- Crypto Edge AI KRAKEN Bridge RC13

Both tasks use AtStartup triggers, run as SYSTEM with Highest privileges, StartWhenAvailable, automatic restart on failure, and explicit fixed MT4 COMMON bridge root under the VPS user profile so SYSTEM APPDATA is not used accidentally.

Observed task state after manual launch through the same Scheduled Tasks: Running. LastTaskResult 267009 = 0x41301 = task is currently running, not a failure.

Important: autostart configuration is functionally validated through the Scheduled Tasks, but the final reboot-specific acceptance is still pending until the next real VPS restart confirms both PREVIEW 4280 and Bridge return automatically without manual intervention.

## 2026-10-07 — ALLinCrypto Engine 1.10 Crypto Edge default-on deploy PASS
- Canonical VPS MT4 instance: CRYPTO ENGINE.
- Engine source confirmed: ALLinCrypto Engine 1.10.mq4, #property version 1.10, NS=11.
- Crypto Edge integration hooks confirmed: CryptoEdgePublisher.mqh include, CryptoEdgeInit(), CryptoEdgePublishSignal(...).
- Canonical publisher restored on VPS and changed to default InpCE_Enabled=true.
- InpCE_EngineVer synchronized to 1.10.
- Separate CE build compiled with 0 errors / 0 warnings.
- Build SHA256: 92681E45C40511ABBB5C995AFCB80D6D75CB581C629F787071BC0A894DDA1122.
- Active ALLinCrypto Engine 1.10.ex4 on disk replaced with verified build; deploy PASS.
- Backup created under C:\CryptoEdge\backup\ALLinCrypto_1.10\deploy-20261007-100533.
- MT4 was NOT restarted; open orders were NOT touched. The running EA remains the already-loaded in-memory instance until the next EA reload / MT4 restart; after that the new default-on build becomes active.
- Future Engine releases must follow docs/CLAUDE_ENGINE_UPDATE_RULES.md and pass scripts/win/verify-engine-integration-contract.ps1 before deployment.


## 2026-10-07 — Signal lifecycle backend 05A PASS
- Branch: feature/kraken-copy-05-signal-lifecycle
- Commit: e38e5f4b908d487d49eb8b13dc799c4dfaa6a768
- Added append-only AXI signal lifecycle contract linked by signal_id.
- Supported lifecycle events: ORDER_FILLED, SIGNAL_EXPIRED, SIGNAL_CANCELLED, POSITION_CLOSED.
- Resolved statuses: PENDING, ACTIVE, EXPIRED, CANCELLED, CLOSED.
- POSITION_CLOSED stores close_reason (TP/SL/TIME_EXIT/MANUAL/OTHER), close_price and deterministic result_r.
- MARKET starts ACTIVE at source signal price/time; LIMIT starts PENDING and requires ORDER_FILLED before CLOSED.
- Lifecycle events are persisted in the same axi-signals SQLite repository, idempotent by event_id, conflict-detecting, and rebuilt deterministically after repository reopen.
- Added machine-token lifecycle ingress POST /api/v1/trading/signals/axi-lifecycle.
- Added OWNER/ADMIN lifecycle read endpoint GET /api/v1/trading/signals/:id/lifecycle.
- Focused lifecycle + existing gateway tests: 19/19 PASS.
- INTERNAL_BETA build boundary: PASS.
- This is backend/read-model foundation only. Crypto Engine lifecycle emission, Live Signals lifecycle UI, and 10,000 USD reference equity curve are the next layers.
- Do not modify Engine in parallel while Claude is currently applying the separate Engine/publisher release-contract refactor.


## 2026-10-07 — Engine-owned Crypto Edge metadata contract PASS
- Claude's local Engine 1.10 refactor was reviewed and accepted architecturally.
- Canonical rule from now on: ALLinCrypto Engine declares InpCE_Enabled / InpCE_EngineVer / InpCE_StrategyVer / InpCE_TerminalId before including CryptoEdgePublisher.mqh.
- Shared CryptoEdgePublisher.mqh is setup-agnostic AND version-agnostic; it declares no InpCE_* defaults.
- InpCE_Enabled must default true in every released Engine.
- InpCE_EngineVer must match #property version; strategy version is deliberate and may evolve independently.
- Verifier now checks the publisher actually resolved from the MQL4 Include root used for compilation, compiles Engine + publisher in isolation, requires 0 errors / 0 warnings, and treats the verifier-produced EX4 as the release EX4.
- MetaEditor can be auto-discovered; an explicit -MetaEditor path remains supported.
- Engine 1.10 candidate checked against the new contract: 27/27 detailed checks PASS, compile 0/0.
- Verified candidate MQ4 SHA256: 628348293F8FAFD6F095D7ECA85D9672C0827D5AC449917A1023F490F3EB6ABF.
- Shared publisher SHA256: 3C6697085E1DF9D6217B1D14E7AD30D9CB474E67858992C849D0FAF1C588C221.
- MetaEditor EX4 bytes are not assumed deterministic across separate compiles; use the EX4 emitted by the PASS verifier run for any release package.
- Repo branch: feature/kraken-copy-05-signal-lifecycle.
- Contract refactor commits: 289068d92e8b48c904cf43c5044c83a3b7867493 + EOF cleanup 59a0d46b29d7f4ab89b76386e48b3dd52e151b19.
- IMPORTANT: this refactor is NOT deployed to VPS yet. The VPS still has the previously deployed Engine 1.10 build from checkpoint 56e06c8; do not redeploy solely for this refactor. Use this accepted candidate as the baseline for lifecycle 05B and perform one later controlled Engine deployment.


## 2026-10-07 — Signal lifecycle 05B local E2E PASS
- Branch: feature/kraken-copy-05-signal-lifecycle.
- Code checkpoint: 65aa0838684b43613d2be9f8b7efb3ef6a9594b3; EOF cleanup 45997fba9345491b9c9c4d1c60837783438c0ddf.
- Engine remains version 1.10; this is a newer build of the same Engine version, not Engine 1.11.
- Engine now persists source-signal identity metadata per MT4 ticket and emits lifecycle events without changing setup logic A-M.
- MARKET and LIMIT actual fills emit ORDER_FILLED with actual MT4 fill price.
- LIMIT without fill emits SIGNAL_EXPIRED or SIGNAL_CANCELLED.
- Filled positions emit POSITION_CLOSED with canonical close reason TP / SL / TIME_EXIT / MANUAL / OTHER.
- Lifecycle ticket metadata is retained for retry until the outbox event is written successfully; recent MT4 history is scanned to retry terminal lifecycle publication after order history transitions/restarts.
- Shared CryptoEdgePublisher.mqh remains setup-agnostic/version-agnostic and now writes lifecycle JSON into the same FILE_COMMON CryptoEdge outbox.
- Bridge routes SIGNAL_CREATED to /api/v1/trading/signals/axi and lifecycle event types to /api/v1/trading/signals/axi-lifecycle.
- Backend MARKET lifecycle now records actual fill before accepting POSITION_CLOSED; LIMIT remains PENDING until fill.
- Focused Crypto Edge lifecycle/gateway/bridge suite: 26/26 PASS.
- Full local transport test PASS: MT4-style outbox -> Bridge -> API -> SQLite -> CLOSED / TP / +2R.
- INTERNAL_BETA build boundary PASS.
- Engine verifier now includes lifecycle ticket/fill/terminal/retry and publisher lifecycle checks; final lifecycle Engine 1.10 verifier PASS with 0 errors / 0 warnings.
- Final lifecycle Engine MQ4 SHA256: 585667314F383E7F372DE50669A4AD955656BD5E9CF167930163EB775CE3ADF7.
- Final verifier-produced lifecycle Engine EX4 SHA256: 53E7E38EF97BDACC95A56E092097CEB15C96DA2AB5573508725A746CEC070125.
- Final lifecycle publisher SHA256: B21269F5B8B6CF35B9AD382F11A7DC2FD6AD86398AA23F8B2B0516D83E1BFA1C.
- Local release folder: %USERPROFILE%\Documents\ChatGPT\KRAKEN_COPY\release_engine_1.10_lifecycle\out.
- Release ZIP: %USERPROFILE%\Documents\ChatGPT\KRAKEN_COPY\release_engine_1.10_lifecycle\ALLinCrypto_Engine_1.10_CE_Lifecycle.zip; SHA256 D7512FC335B98CFD85400ECFE91CDEFB787BC365A1C5A720702D312AE9A27E83.
- VPS NOT DEPLOYED for 05B yet. Existing VPS Engine 1.10 build remains running/installed as previously recorded. Do not restart or replace it until a controlled deployment is explicitly executed.
- Next product step: 05C Live Signals lifecycle read-model/UI, then 05D reference equity curve from 10,000 USD.


## 2026-10-07 — Live Signals lifecycle UI 05C PASS
- Branch: feature/kraken-copy-05-signal-lifecycle.
- Commit: d2c85bca96c16bd29a56ce6ac50aca74a4a1a4b2.
- Signal list/detail read-model now includes resolved Engine lifecycle state.
- Live Signals shows PENDING / ACTIVE / EXPIRED / CANCELLED / CLOSED with Polish/English labels.
- CLOSED signals show TP / SL / TIME_EXIT / MANUAL / OTHER, actual Engine fill, close price and result in R.
- UI explicitly distinguishes AXI/ALLinCrypto Engine lifecycle from Kraken Copy execution.
- Focused lifecycle + Bridge + gateway + Live Signals suite: 31/31 PASS.
- INTERNAL_BETA build boundary PASS.

## 2026-10-07 — Reference equity curve 05D PASS
- Branch: feature/kraken-copy-05-signal-lifecycle.
- Commit: 508504309d36278cb4afe92cca26427374847952.
- Added canonical reference strategy equity curve derived only from CLOSED ALLinCrypto Engine lifecycle results.
- Starting equity: 10,000 USD.
- Canonical reference risk: 1.0% of current compounded equity per closed trade.
- P/L formula: current equity * 1% * result_r; equity compounds after each closed trade.
- OPEN / PENDING / EXPIRED / CANCELLED signals do not change equity.
- Curve includes: ending equity, net P/L, net return, total R, win rate, max drawdown and per-trade points.
- API: GET /api/v1/trading/signals/equity-curve, protected by the same OWNER/ADMIN signal-read boundary.
- Live Signals now renders the reference equity panel and chart, explicitly labeled as strategy reference and NOT Kraken account equity.
- Mathematical control sequence +2R, -1R, +1R from 10,000 USD at 1% risk produced 10,200 -> 10,098 -> 10,198.98 USD, max DD 1%, as expected.
- Combined lifecycle/Bridge/gateway/UI/equity suite: 32/32 PASS.
- INTERNAL_BETA build boundary PASS.
- NEXT: package/deploy this branch to PREVIEW 4280 only, keep PROD 4180 untouched, then verify real Engine lifecycle events and the equity curve with genuine signals before any PROD consideration.


## 2026-10-07 — RC14 package ready PASS
- Release id: CAMP2026-VPS-RC14.
- Source commit: e51610351c53ba6eab699185c67b86a165530f4a on feature/kraken-copy-05-signal-lifecycle.
- Package includes lifecycle 05B, Live Signals lifecycle UI 05C and 10k reference equity 05D.
- Application archive size: 2,364,232 bytes.
- SHA256: 82F3DF79ABE2A1BC82C53999A68B3AFF67DC1272C22C05B186FF72CAF051C951.
- Packaging safety gate PASS after sanitizing local absolute paths from the repo canonical document.
- Deployment rule: PREVIEW 4280 only. PROD 4180 untouched. CRYPTO_EDGE_EXECUTION remains OFF.
- Next acceptance: deploy RC14 to PREVIEW, keep existing state isolated, verify health, real Engine SIGNAL_CREATED + lifecycle events through Bridge, Live Signals statuses and reference equity endpoint/UI.


## 2026-10-07 — RC14 PREVIEW deploy attempt STOP; automatic rollback PASS
- Target remained PREVIEW 127.0.0.1:4280 only; PROD 4180 was not intentionally touched.
- RC14 package checksum precheck passed and locked dependency install completed successfully (PNPM_INSTALL=PASS).
- RC14 PREVIEW and Bridge launcher preparation passed; RC14 Scheduled Task registration passed.
- During controlled RC13 -> RC14 switch, RC14 PREVIEW failed the health gate: /api/health on 4280 did not become OK within the deployment timeout.
- Deployment script automatically rolled back to RC13.
- Rollback verification: PREVIEW 4280 status=ok; build_sha=2c589466c5397d84cbd424f206cf808065ae0108.
- RC14 must NOT be retried blindly. Next step is read-only diagnosis of RC14 launcher/task/log/startup failure, then FIX and a second controlled PREVIEW-only deployment attempt.
- Real Kraken execution remains OFF. PROD promotion remains blocked.


## 2026-10-07 — RC14 PREVIEW startup root cause identified
- Failed RC14 PREVIEW switch was diagnosed from VPS runtime log.
- RC14 release contents are present and valid under C:\CryptoEdge\releases\CAMP2026-VPS-RC14.
- Failure cause is the generated RC14 autostart launcher using the wrong ReleaseRoot: C:\CryptoEdge\preview\releases\CAMP2026-VPS-RC14.
- The launcher therefore attempted to execute C:\CryptoEdge\preview\releases\CAMP2026-VPS-RC14\scripts\win\start-product-vps.cmd, which does not exist.
- RC13 rollback remains healthy on PREVIEW 4280 with build_sha 2c589466c5397d84cbd424f206cf808065ae0108.
- RC14 tasks remain disabled pending correction.
- Next step: correct RC14 PREVIEW and Bridge ReleaseRoot to C:\CryptoEdge\releases\CAMP2026-VPS-RC14, verify launcher contents, then perform a second controlled PREVIEW-only switch.


## 2026-10-07 — RC14 PREVIEW deployment PASS
- RC14 PREVIEW deployed successfully on canonical port 127.0.0.1:4280.
- Runtime health = ok.
- Runtime mode = INTERNAL_BETA.
- Runtime build_sha = e51610351c53ba6eab699185c67b86a165530f4a.
- RC14 Bridge task started successfully and is Running; LastTaskResult 267009 (0x41301 = currently running).
- RC14 PREVIEW launcher root corrected to C:\CryptoEdge\releases\CAMP2026-VPS-RC14 after the first failed attempt exposed an incorrect C:\CryptoEdge\preview\releases path.
- Safety flags confirmed during deployment: CRYPTO_EDGE_EXECUTION=0 and CRYPTO_EDGE_KRAKEN_LIVE_PILOT=0.
- PROD 4180 integrity check PASS and remained untouched.
- Old RC13 PREVIEW and Bridge tasks were disabled after successful RC14 switch.
- Deployment status: PASS.
- Next acceptance gate: verify Bridge really targets 4280, confirm genuine Engine SIGNAL_CREATED reaches RC14, then deploy/activate the lifecycle-capable Engine 1.10 build and verify real lifecycle event(s), Live Signals status/R, and the reference equity endpoint/UI before any PROD consideration.


## 2026-10-07 — RC14 Bridge acceptance PASS
- PREVIEW 4280 health = ok, runtime_mode=INTERNAL_BETA, build_sha=e51610351c53ba6eab699185c67b86a165530f4a.
- RC14 PREVIEW task = Running, LastTaskResult 267009.
- RC14 Bridge task = Running, LastTaskResult 267009.
- Bridge launcher ReleaseRoot = C:\CryptoEdge\releases\CAMP2026-VPS-RC14.
- Bridge endpoint = http://127.0.0.1:4280/api/v1/trading/signals/axi.
- Active Bridge processes run from the RC14 release tree.
- No RC13 process remains.
- GET /api/v1/trading/signals/equity-curve returned HTTP 200 with schema axi_reference_equity_curve_v1, starting_equity_usd=10000, risk_pct_per_trade=1, closed_trade_count=0, ending_equity_usd=10000 and empty points, which is correct before lifecycle CLOSED trades arrive.
- RC14 PREVIEW + Bridge infrastructure acceptance = PASS.
- Next gate: controlled deployment of lifecycle-capable ALLinCrypto Engine 1.10 to canonical VPS MT4 instance CRYPTO ENGINE, then observe real SIGNAL_CREATED + lifecycle events through RC14 and validate Live Signals status/R plus reference equity updates.


## 2026-10-08 — PROD freeze clarified by owner
- Owner explicitly confirmed that current work remains PREVIEW-only.
- PROD Crypto Edge AI on port 4180 must not be modified during this test phase.
- The canonical VPS MT4 instance CRYPTO ENGINE is also treated as production runtime for change-control purposes. Do NOT deploy the lifecycle-capable Engine 1.10 build there during PREVIEW testing without separate explicit owner approval.
- RC14 PREVIEW 4280 and RC14 Bridge remain the active test surface.
- The previously proposed next step of deploying lifecycle Engine 1.10 to the canonical VPS MT4 is STOPPED.
- Next work must validate lifecycle on an isolated PREVIEW/test MT4 path or equivalent non-production harness, while keeping PROD 4180 and the canonical CRYPTO ENGINE runtime unchanged.
- Real Kraken execution remains OFF.


## 2026-10-08 — RC14 PREVIEW lifecycle acceptance STOP before mutation
- The attempted PREVIEW lifecycle acceptance stopped at the safety gate before any synthetic lifecycle files were written.
- PREVIEW 4280 health/build and PROD 4180 pre-check both passed.
- STOP reason was a test-script false negative: it incorrectly required CRYPTO_EDGE_EXECUTION=0 to be declared inside the RC14 Bridge autostart launcher.
- CRYPTO_EDGE_EXECUTION and CRYPTO_EDGE_KRAKEN_LIVE_PILOT are product-runtime safety flags and must be verified on the PREVIEW product launch chain; the Bridge launcher itself does not need to declare them.
- No lifecycle acceptance payloads were injected and the canonical CRYPTO ENGINE was not modified.
- PROD 4180 remained untouched.
- Next step: read-only verification of the RC14 PREVIEW task/wrapper safety flags and Bridge task/root contract, then rerun lifecycle acceptance using an isolated PREVIEW test root rather than the canonical MT4 outbox.


## 2026-10-08 — RC14 safety contract read-only check PASS
- RC14 PREVIEW wrapper explicitly sets CRYPTO_EDGE_EXECUTION=0, CRYPTO_EDGE_KRAKEN_LIVE_PILOT=0 and CRYPTO_EDGE_PRODUCT_PORT=4280.
- RC14 Bridge wrapper also explicitly keeps CRYPTO_EDGE_EXECUTION=0 and CRYPTO_EDGE_KRAKEN_LIVE_PILOT=0 and targets http://127.0.0.1:4280/api/v1/trading/signals/axi.
- RC14 PREVIEW autostart ReleaseRoot = C:\CryptoEdge\releases\CAMP2026-VPS-RC14 and sets product port 4280 plus both execution flags OFF.
- RC14 Bridge autostart ReleaseRoot = C:\CryptoEdge\releases\CAMP2026-VPS-RC14 and targets PREVIEW 4280.
- Scheduled Tasks Crypto Edge AI KRAKEN Preview RC14 and Crypto Edge AI KRAKEN Bridge RC14 are both Running and execute the RC14 wrappers.
- Safety contract = PASS.
- Next acceptance should use a fully isolated RC14 lifecycle harness with its own localhost port, SQLite state and Bridge root, so neither PROD 4180, PREVIEW 4280 state, nor canonical CRYPTO ENGINE/MT4 outbox are mutated by synthetic lifecycle events.


## 2026-10-08 — RC14 isolated lifecycle acceptance PASS
- Fully isolated RC14 lifecycle harness ran on localhost port 4281 with its own SQLite state and isolated Bridge root.
- Canonical PROD 4180, canonical PREVIEW 4280 and canonical VPS MT4 CRYPTO ENGINE were not modified.
- Synthetic MT4-style lifecycle path PASS: SIGNAL_CREATED -> ORDER_FILLED -> POSITION_CLOSED(TP), POSITION_CLOSED(SL), SIGNAL_EXPIRED, SIGNAL_CANCELLED.
- Lifecycle read model PASS: TP trade resolved CLOSED / TP / +2R; SL trade resolved CLOSED / SL / -1R; LIMIT signals resolved EXPIRED and CANCELLED.
- Reference equity PASS from 10,000 USD at 1% compounded risk: +2R -> 10,200; -1R -> 10,098; total R = +1; max drawdown = 1%.
- Bridge delivery PASS with all test events delivered and no rejected payloads.
- Real-environment integrity PASS: PROD 4180 untouched, PREVIEW 4280 untouched, CRYPTO ENGINE untouched.
- Kraken execution remained OFF.
- Evidence root on VPS: C:\CryptoEdge\preview\acceptance\rc14-lifecycle-20261008-072940.
- Isolated harness was stopped cleanly after acceptance.
- Next gate: UI acceptance for lifecycle/Live Signals and equity rendering, still without touching PROD or canonical CRYPTO ENGINE. Use isolated or preview-safe data only.


## 2026-10-08 — RC14 isolated UI review runtime PASS
- Isolated RC14 UI review runtime started successfully on localhost port 4281 using the previously accepted isolated lifecycle SQLite state.
- UI_REVIEW_RUNTIME=PASS.
- PROD 4180 integrity check PASS and PID unchanged.
- PREVIEW 4280 integrity check PASS and PID unchanged.
- Canonical CRYPTO ENGINE remained untouched.
- Review URL: http://127.0.0.1:4281/#live-signals
- Next gate: visual UI acceptance of Live Signals lifecycle labels/details and reference equity rendering from the isolated accepted state.


## 2026-10-08 — Real stale PENDING mismatch identified on PREVIEW
- Owner compared PREVIEW Live Signals with the canonical MT4 CRYPTO ENGINE screen.
- The ETHUSD SELL LIMIT record shown as OCZEKUJE in PREVIEW matches the real Engine signal by price geometry: entry 2578.589, SL ~2597.03 and cancel price 2551.32.
- MT4 Engine notifications show that this LIMIT was later removed/cancelled, while the current MT4 account has 0 open positions/orders.
- PREVIEW still shows the signal as PENDING because it received SIGNAL_CREATED but no corresponding SIGNAL_CANCELLED lifecycle event from the currently running production Engine integration.
- This is therefore a real stale-state mismatch, not an active pending MT4 order.
- Product/UI must not present such legacy/non-lifecycle records as confidently OCZEKUJE. They need a distinct legacy/unknown-lifecycle treatment until lifecycle telemetry is available.
- PROD and canonical CRYPTO ENGINE remain frozen. Fix/test must stay PREVIEW-only or isolated.


## 2026-10-08 — Stale/unconfirmed lifecycle presentation local FIX PASS
- Branch: feature/kraken-copy-05-signal-lifecycle.
- Read model now exposes lifecycle_event_count for Live Signals list/detail responses.
- Live Signals no longer presents an initial PENDING state or an ACTIVE state without fill evidence as authoritative current MT4 status when lifecycle_event_count=0.
- Such source-only records now show STATUS NIEPOTWIERDZONY / STATUS UNCONFIRMED.
- UI explanation: the record confirms that Engine emitted the source signal, not that an MT4 order still exists.
- Authoritative lifecycle states remain unchanged when Engine lifecycle evidence exists: ACTIVE after ORDER_FILLED, TP/SL/TIME_EXIT/MANUAL/OTHER after POSITION_CLOSED, EXPIRED and CANCELLED.
- Focused validation: AXI gateway 10/10 PASS; Live Signals UI 5/5 PASS; lifecycle/equity suite 11/11 PASS. Combined focused suite 26/26 PASS.
- INTERNAL_BETA build PASS.
- PROD 4180 and canonical VPS MT4 CRYPTO ENGINE were not modified.
- Next: commit/package as a new immutable PREVIEW candidate and deploy only to 4280, then verify the historical ETHUSD record displays unconfirmed rather than OCZEKUJE.


## 2026-10-08 — RC15 PREVIEW package ready PASS
- Release id: CAMP2026-VPS-RC15.
- Source commit: c7702f215e5f569ede643ffd5fb6b43bbbb30a83 on feature/kraken-copy-05-signal-lifecycle.
- Purpose: stale/unconfirmed lifecycle presentation fix for Live Signals.
- Focused validation before packaging: AXI gateway 10/10 PASS; Live Signals UI 5/5 PASS; lifecycle/equity 11/11 PASS; combined 26/26 PASS.
- INTERNAL_BETA build boundary PASS.
- Application archive: release-artifacts\CAMP2026-VPS-RC15\crypto-edge-ai-CAMP2026-VPS-RC15-app.zip.
- Archive size: 2,368,445 bytes.
- SHA256: CF9A7FFBA93C63E66F004BDF877600036DB38F072E67E80E35B5678846E86420.
- Packaging safety gate PASS.
- Deployment rule: PREVIEW 4280 only. PROD 4180 and canonical VPS MT4 CRYPTO ENGINE remain frozen.
- After PREVIEW deployment, verify the real historical ETHUSD source signal shows STATUS NIEPOTWIERDZONY rather than OCZEKUJE and that authoritative lifecycle records still show TP/SL/EXPIRED/CANCELLED/ACTIVE correctly.


## 2026-10-08 — PREVIEW release distribution via GitHub Releases
- To eliminate manual Pablito -> VPS file copying, RC15 was published as a GitHub Release asset in the public repository pawelkrynicki/crypto-edge-ai.
- Release tag: camp2026-vps-rc15.
- Asset: crypto-edge-ai-CAMP2026-VPS-RC15-app.zip.
- Asset SHA256: CF9A7FFBA93C63E66F004BDF877600036DB38F072E67E80E35B5678846E86420.
- Future PREVIEW candidates should use the same pattern where practical: package locally, publish immutable release asset, download on VPS, verify SHA256, then deploy PREVIEW only.
- PROD 4180 and canonical CRYPTO ENGINE remain frozen.


## 2026-10-08 — RC15 VPS download PASS
- RC15 PREVIEW package was downloaded directly from GitHub Releases to C:\CryptoEdge\incoming\crypto-edge-ai-CAMP2026-VPS-RC15-app.zip.
- VPS SHA256 matched the canonical release hash CF9A7FFBA93C63E66F004BDF877600036DB38F072E67E80E35B5678846E86420.
- Manual Pablito -> VPS copying is no longer required for this release.
- Next step: deploy RC15 to PREVIEW 4280 only with rollback to RC14 on any failure. PROD 4180 and canonical CRYPTO ENGINE remain frozen.


## 2026-10-08 — RC15 PREVIEW deploy attempt STOP before switch
- RC15 package SHA256 check PASS.
- PROD 4180 and PREVIEW 4280 pre-deploy health checks PASS.
- RC15 extraction to C:\CryptoEdge\releases\CAMP2026-VPS-RC15 PASS.
- Deployment STOPPED before any RC14 -> RC15 runtime switch because PowerShell execution policy blocked %APPDATA%\npm\pnpm.ps1 during dependency install.
- Root cause is operator-shell command resolution, not RC15 application/runtime failure.
- No PREVIEW process switch occurred; RC14 remains the active 4280 runtime.
- PROD 4180 and canonical CRYPTO ENGINE remain untouched.
- Fix: use pnpm.cmd explicitly (or cmd.exe /c pnpm) for VPS dependency install, then resume RC15 deployment from the extracted release without re-copying/re-downloading.


## 2026-10-08 — RC15 PREVIEW deploy attempt STOP; rollback PASS
- RC15 release files, dependency install via pnpm.cmd, launchers, wrappers and Scheduled Task registration all passed.
- RC15 switch failed because the newly registered RC15 PREVIEW Scheduled Task was disabled when Start-ScheduledTask was called.
- Windows returned HRESULT 0x80041326 / "task has been disabled".
- Automatic rollback to RC14 succeeded.
- PREVIEW 4280 rollback health = ok; build_sha=e51610351c53ba6eab699185c67b86a165530f4a.
- PROD 4180 and canonical CRYPTO ENGINE remained untouched.
- RC15 package/release remains valid. Next fix is deployment orchestration only: explicitly enable the RC15 PREVIEW and Bridge tasks after registration and before starting them.


## 2026-10-08 — RC15 PREVIEW deploy PASS
- RC15 PREVIEW deployment on canonical port 127.0.0.1:4280 PASS.
- Runtime build_sha = c7702f215e5f569ede643ffd5fb6b43bbbb30a83.
- RC15 Bridge task = Running; LastTaskResult 267009.
- RC15 PREVIEW and Bridge tasks were explicitly enabled before start.
- RC14 tasks were disabled after successful switch.
- Safety state preserved: CRYPTO_EDGE_EXECUTION=0 and CRYPTO_EDGE_KRAKEN_LIVE_PILOT=0.
- PROD 4180 integrity PASS and remained untouched.
- Canonical VPS MT4 CRYPTO ENGINE remained untouched.
- Next acceptance: refresh PREVIEW 4280 Live Signals and verify the historical ETHUSD source-only record now shows STATUS NIEPOTWIERDZONY instead of OCZEKUJE, while authoritative lifecycle states remain unchanged.


## 2026-10-08 — RC15 stale lifecycle UI acceptance PASS
- Visual acceptance on canonical PREVIEW 4280 PASS.
- Historical ETHUSD SELL LIMIT record that previously appeared as OCZEKUJE now shows STATUS NIEPOTWIERDZONY.
- UI explanation is visible: no Engine lifecycle event has been received; the record confirms only source-signal emission and does not prove that an MT4 order still exists.
- This resolves the real stale-state mismatch observed against the canonical MT4 screen with zero open positions/orders.
- PROD 4180 remains frozen and untouched.
- Canonical VPS MT4 CRYPTO ENGINE remains frozen and untouched.
- RC15 PREVIEW remains the active test surface.
- Next gate: identify or create a strictly non-production MT4/runtime path for real Engine lifecycle acceptance before any lifecycle-capable Engine deployment to the canonical CRYPTO ENGINE.


## 2026-10-08 — Historical ETHUSD cancellation reconciliation PASS
- PREVIEW RC15 historical ETHUSD SELL LIMIT signal identified exactly as ACC1246441380-C-1791399600-SELL-LIMIT.
- Historical cancellation event injected on PREVIEW only through the canonical RC15 Bridge outbox.
- Canonical lifecycle event type: SIGNAL_CANCELLED.
- Bridge root used: MetaTrader COMMON\Files\CryptoEdge.
- PREVIEW accepted the lifecycle event and resolved the signal status to CANCELLED.
- Acceptance result: ETHUSD_STATUS=ANULOWANY; SIGNAL_CANCELLED=PASS.
- PROD 4180 was not touched.
- Canonical CRYPTO ENGINE was not touched.
- Next check: refresh Live Signals on PREVIEW 4280 and visually confirm the ETHUSD record now shows ANULOWANY.


## 2026-10-08 — Legacy log reconciliation PARTIAL, not final
- PREVIEW log-based reconciliation processed 17 lifecycle events and skipped 10 unmatched records.
- Current PREVIEW reference equity after the partial reconciliation is 9,467.46 USD, total R -5.44, closed trades 7, win rate 14.29%, max DD 5.3254%.
- These equity figures are PROVISIONAL because reconciliation is incomplete.
- A concrete unresolved case remains: setup B BTCUSD SELL MARKET at 83,814.50, SL 84,385.05, TP 82,673.39 was logged as opened with ticket 301285982, but PREVIEW still resolves it ACTIVE even though the owner-provided chart shows price subsequently below the TP level. This needs authoritative broker/terminal history verification before adding POSITION_CLOSED.
- Do not treat 9,467.46 USD as final strategy equity until all recoverable historical events are reconciled or explicitly excluded.
- UI requirement clarified by owner: remove STATUS NIEPOTWIERDZONY and explanatory lifecycle prose entirely. User-facing statuses should remain simple and factual: OCZEKUJE, AKTYWNY, TP, SL, ANULOWANY, WYGASŁ. For source-only records with no factual lifecycle status, do not invent a technical status.
- PROD 4180 and canonical CRYPTO ENGINE remain untouched.


## 2026-10-08 — Broker terminal confirms B BTCUSD TP
- Read-only VPS terminal-log audit found ticket 301285982.
- Order opened: SELL 0.16 BTCUSD at 83814.50, SL 84385.05, TP 82673.39.
- Broker terminal log confirms: order #301285982 closed due take-profit at price 82637.05 on 2026-10-08 05:21:30.389 server/log time.
- Therefore the matching B BTCUSD SELL MARKET source signal must resolve to CLOSED / TP, not ACTIVE.
- Root cause of the partial reconciler miss: it parsed ALLinCrypto MQL log lines but did not consume the broker terminal log English closure line "closed due take-profit".
- Next FIX: reconcile this ticket on PREVIEW using actual broker close price, then extend the reconciler to include terminal-log close events so future historical reconciliation is complete.
- PROD 4180 and canonical CRYPTO ENGINE remain untouched.


## 2026-10-08 — B BTCUSD TP reconciliation PASS
- PREVIEW signal ACC1246441380-B-1791376200-SELL-MARKET was reconciled using broker terminal evidence.
- Broker ticket: 301285982.
- Entry: 83814.50; SL: 84385.05; configured TP: 82673.39.
- Broker terminal close: take-profit at 82637.05.
- PREVIEW lifecycle now resolves CLOSED / TP.
- Result R = +2.06371.
- Reference equity updated from 9,467.46 USD to 9,662.84 USD.
- Total R updated to -3.37629; closed trades = 8.
- This confirms the equity pipeline reacts correctly once authoritative lifecycle close data is present.
- Remaining ACTIVE/source-only records still require reconciliation against broker terminal history. Current equity remains provisional until that audit is completed.
- User-facing requirement remains: remove STATUS NIEPOTWIERDZONY and technical explanatory prose. Source-only records without factual execution evidence should be shown simply as SYGNAŁ; executed lifecycle statuses remain AKTYWNY / TP / SL / ANULOWANY / WYGASŁ.
- PROD 4180 and canonical CRYPTO ENGINE remain untouched.


## 2026-10-08 — Unresolved broker audit STOP before execution
- Read-only unresolved-signal broker audit did not execute because PowerShell parser rejected the regex string containing $symbol: as an invalid variable reference.
- This was a script syntax issue only. No PREVIEW data, PROD data or CRYPTO ENGINE state was changed.
- Fix: delimit the interpolated variable as ${symbol} before the literal colon in the regex.


## 2026-10-08 — Unresolved broker audit result
- Read-only audit found 12 currently ACTIVE/PENDING records on PREVIEW.
- 3 are synthetic PREVIEW_SMOKE_4280 records and are not real trades.
- 8 real records are SOURCE_SIGNAL_ONLY: no matching MT4 order ticket was found. These are source signals emitted before/without broker execution and must not be treated as open trades or included in reference equity.
- 1 real executed trade remains to reconcile: setup E ETHUSD BUY MARKET, source entry 2745.885, broker ticket 300745776, broker close classified SL at 2669.43.
- This explains why the previous UI presentation was misleading: source-signal emission and broker execution are distinct.
- Product presentation requirement: source-only records should display simply SYGNAŁ / SIGNAL, with no technical warning prose. Executed records use factual lifecycle labels only: OCZEKUJE, AKTYWNY, TP, SL, ANULOWANY, WYGASŁ.
- Reference equity must include only broker-executed CLOSED trades.
- PROD 4180 and canonical CRYPTO ENGINE remain untouched.


## 2026-10-08 — E ETHUSD reconciliation STOP before mutation
- Attempted reconciliation of setup E ETHUSD BUY MARKET, signal ACC1246441380-E-1790992600-BUY-MARKET, broker ticket 300745776.
- Script stopped before writing any lifecycle event because a strict MQL open-line lookup returned 0 matches.
- This is a reconciliation-script lookup issue only. Earlier read-only broker audit already identified ticket 300745776 and broker SL close at 2669.43.
- No PREVIEW lifecycle mutation occurred in this attempt. PROD 4180 and canonical CRYPTO ENGINE remained untouched.
- Next fix: resolve open/close timestamps directly from broker terminal logs by ticket, and reuse existing filled_at when already present instead of requiring a Polish MQL 'otwarto' line.


## 2026-10-08 — E ETHUSD SL reconciliation PASS
- PREVIEW signal ACC1246441380-E-1790992600-BUY-MARKET reconciled from broker ticket 300745776.
- Broker evidence: BUY 1.31 ETHUSD opened at 2745.850; broker closed due stop-loss at 2669.430.
- PREVIEW lifecycle now resolves CLOSED / SL.
- Result R = -1.002151.
- Reference equity updated to 9,566.01 USD.
- Total R = -4.378441; closed trades = 9; win rate = 22.22%; max DD = 6.2741%.
- This is the last broker-executed unresolved trade found by the current audit. Remaining unresolved real records are source-signal-only with no matching MT4 ticket and must not be treated as open trades or included in reference equity.
- PROD 4180 and canonical CRYPTO ENGINE remained untouched.


## 2026-10-08 — Automatic refresh + immediate MARKET visibility local PASS
- Owner requirement: Crypto Edge AI must refresh automatically like token snapshots and MARKET signals must appear without manual F5.
- Implemented full product data refresh every 15 minutes using the existing bounded last-known-good refresh path. This refreshes product data without reloading the browser route or losing the current section.
- Implemented dedicated Live Signals background polling every 2 seconds. It refreshes the signal list and reference equity without putting the page back into a loading state.
- When a source record is selected, its lifecycle detail is also refreshed in the same live poll.
- Window focus triggers an immediate Live Signals refresh.
- This keeps MARKET delivery independent from the 15-minute product snapshot. With the existing Bridge poll of ~1 second, a new Engine SIGNAL_CREATED should normally become visible on an open Live Signals page within a few seconds.
- Source-only UI simplification remains part of the candidate: no STATUS NIEPOTWIERDZONY and no technical explanatory paragraph; source-only records display SYGNAŁ / SIGNAL.
- Validation: Live Signals UI 7/7 PASS, Product refresh flow 8/8 PASS, AXI gateway 10/10 PASS, lifecycle/equity 11/11 PASS, INTERNAL_BETA build PASS.
- PROD 4180 and canonical CRYPTO ENGINE were not modified.
- Next: package immutable PREVIEW candidate, publish via GitHub Releases, deploy to 4280 only and visually verify auto-refresh behavior.


## 2026-10-08 — RC17 PREVIEW package ready PASS
- Release id: CAMP2026-VPS-RC17.
- Source commit: 6e627c1b019c30fd0ac3abc48a3fe92ebf5541d4.
- Purpose: automatic data refresh and immediate Live Signals visibility, plus simplified source-only status.
- Product-wide snapshot refresh cadence: 15 minutes.
- Live Signals + reference equity background poll: 2 seconds.
- Window focus triggers immediate Live Signals refresh.
- Selected signal lifecycle detail refreshes with the live poll.
- Source-only records with no factual execution lifecycle render as SYGNAŁ / SIGNAL, with no STATUS NIEPOTWIERDZONY and no technical explanatory paragraph.
- Validation: Live Signals 7/7 PASS; Product refresh flow 8/8 PASS; AXI gateway 10/10 PASS; lifecycle/equity 11/11 PASS; INTERNAL_BETA build PASS.
- Archive: crypto-edge-ai-CAMP2026-VPS-RC17-app.zip.
- Archive size: 2,372,875 bytes.
- SHA256: 818A933636D0ECEF9598F77265BB6C66B4FDB074F737DF96C8CEFB21872A8919.
- Packaging safety gate PASS.
- GitHub Release published under tag camp2026-vps-rc17.
- Deployment rule: PREVIEW 4280 only. PROD 4180 and canonical CRYPTO ENGINE remain frozen.
