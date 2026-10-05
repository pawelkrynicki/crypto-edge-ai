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

## Current verified PREVIEW state — 2026-10-05
- **RC13 PREVIEW is live on `127.0.0.1:4280`.**
- PREVIEW health = `ok`.
- PREVIEW RC13 runtime build SHA = `2c589466c5397d84cbd424f206cf808065ae0108`.
- Bridge targets PREVIEW `4280`.
- Genuine Engine signals reach Live Signals and Kraken Executor DRY-RUN end-to-end.
- RC13 OWNER-only live-pilot preflight is PASS with submission route hidden, execution not submitted and both live flags OFF.
- Hard live-pilot code ceiling = 25 USD notional.
- PROD `4180` remained untouched and running.

## What is NOT yet proven / implemented
- **PROVEN:** genuine runtime Crypto Engine signals reach Crypto Edge AI PREVIEW 4280 end-to-end.
- **PROVEN ON PREVIEW:** RC12 Kraken Executor DRY-RUN converts a genuine Engine signal through Equity Planner -> Kraken instrument -> exact quantity -> deterministic/idempotent order intent.
- **PROVEN ON PREVIEW:** RC13 live-pilot safety/preflight is deployed and PASS with submission route hidden, execution not submitted, both live flags OFF and hard pilot cap 25 USD.
- **NOT YET PROVEN:** Kraken live account readiness on PREVIEW with server-side credentials and General API FULL_ACCESS while execution remains OFF.
- **NOT YET PROVEN:** a separately owner-approved minimum-exposure live Kraken pilot and post-trade reconciliation.

## Current hard safety state
- `InpCE_Enabled=true` on the real VPS Crypto Engine.
- Bridge targets PREVIEW `4280`.
- RC13 PREVIEW 4280 is currently running.
- `CRYPTO_EDGE_EXECUTION=0`.
- `CRYPTO_EDGE_KRAKEN_LIVE_PILOT=0`.
- `submission_route_exposed=false` and `execution_submitted=false` are confirmed on PREVIEW.
- RC13 live gate requires OWNER + execution flag + separate pilot flag + exact approved intent id + exact approved Kraken symbol + KRAKEN_LIVE + General API FULL_ACCESS + explicit pilot max notional.
- Hard code ceiling for the first live pilot candidate = **25 USD notional**; configured pilot cap must be <= this value.
- Timeout/ambiguous send is never automatically retried; same intent remains duplicate-blocked and requires `cliOrdId` reconciliation.
- PROD `4180` remains blocked from any KRAKEN Copy promotion until live pilot + reconciliation PASS.

## NEXT SINGLE STEP
**Configure and verify Kraken live account readiness on PREVIEW 4280 using server-side credentials while `CRYPTO_EDGE_EXECUTION=0` and `CRYPTO_EDGE_KRAKEN_LIVE_PILOT=0`. No real Kraken order may be submitted.**

Required next acceptance sequence:
1. Keep RC13 on PREVIEW `4280`; PROD `4180` untouched.
2. Add Kraken Futures credentials only to the PREVIEW server-side environment/secrets source; never expose them to browser/UI/logs/chat.
3. Switch PREVIEW account source to `KRAKEN_LIVE` while keeping both execution flags OFF.
4. Verify API-key readiness: account is connected, General API permission is FULL_ACCESS, Transfer permission should remain NO_ACCESS, and secrets are absent from all responses/logs.
5. Re-run OWNER-only `kraken-live-pilot-plan` on a genuine Engine signal. It must remain blocked only by execution/pilot approval gates, not by account-readiness reasons.
6. Confirm exact capped pilot quantity, PF_* symbol, deterministic `cliOrdId`, and max notional <= 25 USD while `submission_route_exposed=false` and `execution_submitted=false`.
7. Present the exact pilot parameters to Paweł for explicit approval before exposing/enabling any submit path.
8. PROD `4180` promotion remains blocked until controlled live pilot and post-trade reconciliation both PASS.

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
