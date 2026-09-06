# Current Production State — 06.09.2026

This document records non-secret production facts for the AIKINTEL
integration. It contains no secrets or API keys.

## Canonical source

- Source commit: `d55892dc04421c50ea94ebc18918e1dfe842e47e`
- Product runtime: `RC9`
- Product code path: `C:\CryptoEdge\releases\CAMP2026-VPS-RC9`
- Product data-poc root: `C:\CryptoEdge\releases\CAMP2026-VPS-RC8\tools\data-poc`

## Runtime

- AI Worker: RC9-capable code deployed; persistent task intentionally **DISABLED** and process **STOPPED**.
- Central Automation: `RC8`
- Central Automation state: **ENABLED**
- Central Automation runtime: compiled Node runner; it does not compile runtime TypeScript.
- Persistent lifecycle state: `C:\CryptoEdge\state`
- New Inbox retention: `ACTIVE`
- Retention policy: 7 days from `last_seen_at`
- Archive SQLite: `C:\CryptoEdge\state\lifecycle\new-inbox-archive.sqlite`

## Automatic AI Lifecycle Analysis V1

- New / Observation: no automatic heavy AI.
- Follow-up and Main Radar: automatic shared AI qualification.
- Analysis: system-shared, not per-user.
- Same evidence: for the same `chain`, `contract_address`,
  `snapshot_fingerprint` and prompt/model/schema identity, the existing shared
  result/job is reused.
- PL / EN: changing presentation locale does not create another heavy AI
  analysis; both locales consume the same shared heavy result.
- Changed evidence: when material canonical evidence changes and therefore the
  canonical `snapshot_fingerprint` changes, the system may create exactly one
  new current shared analysis identity. The previous valid result may remain
  last-known-good under existing AI v7 semantics.
- Repeated reconciliation for the same new fingerprint does not create
  duplicate heavy jobs. A routine scanner refresh does not automatically imply
  a new AI call.
- Reconciliation: worker-side with a persistent fair cursor.
- Queue: shared and deduplicated by canonical cache identity.
- Provider: existing AI v7 unchanged.
- Lifecycle: fail-open; AI state does not block Follow-up/Main Radar promotion.

### TART production acceptance

- Token: TART / TartSwap
- Network: BSC
- Contract: `0x7ab8d02cbb51ff7223fde700eaaaa2a91bf750314`
- Test type: controlled RC9 one-shot deployment acceptance.
- Persistent scheduled AI Worker remained **DISABLED**.
- Observed: Follow-up -> automatic lifecycle reconciliation -> exactly one new
  shared queue record -> exactly one worker claim -> exactly one OpenAI
  provider call -> provider result `VALID` -> analysis status `READY` ->
  result displayed automatically in Product UI.
- Manual `Zleć analizę AI` was **NOT USED**.

This acceptance proves Automatic AI V1 end-to-end behavior. It does not mean
the persistent Worker was enabled for continuous production at that moment.

## Access and integration status

- Public URL: <https://cryptoedge.crmallintraders.pl>
- Cloudflare Tunnel: active.
- Temporary Cloudflare Access email OTP remains in place for the owner and testers.
- AIKINTEL auth mode: **NOT CUT OVER YET**.
- AIKINTEL receiver: present.
- Current CAMP/default access: working.
- AI v7 and Automatic AI: accepted in RC9 through the existing shared queue/
  worker path; the persistent Worker remains intentionally disabled before CAMP.

The current Cloudflare Access model remains temporary until the final cutover
sequence is completed. Do not include or infer any secret, API key or token
from this document.
