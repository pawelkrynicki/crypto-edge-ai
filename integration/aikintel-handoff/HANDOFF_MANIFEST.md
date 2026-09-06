# AIKINTEL Crypto Edge Handoff v2

HANDOFF: AIKINTEL Crypto Edge Handoff v2

CANONICAL SOURCE: `d55892dc04421c50ea94ebc18918e1dfe842e47e`

PRODUCT RUNTIME: `RC9`

PUBLIC URL: <https://cryptoedge.crmallintraders.pl>

OWNER: Paweł Grądziuk

AUTH MODEL: `AIKINTEL users.id -> signed HMAC launch -> Crypto Edge session`

ACTOR MODEL: `aikintel-<HMAC-SHA256(actor key, users.id)>`

CREDENTIAL TTL: `60 seconds`

JTI: `single-use`

ROLE: `CAMP_USER only`

AI: AI v7 + Automatic AI Lifecycle Analysis V1

WORKER: Crypto Edge-owned; currently intentionally disabled; owner enables
normal production configuration before CAMP

CENTRAL AUTOMATION: Crypto Edge-owned. AIKINTEL must not port, replace,
repoint or schedule its own replacement, or take ownership of scanner/data
collection orchestration. The current Central Automation runtime remains on
the Crypto Edge VPS.

DATA: existing Crypto Edge Central Automation unchanged

PRIVATE STATE: existing Crypto Edge state unchanged

CLOUDFLARE: cutover last

## Handoff files

- `.env.example`
- `ARCHITECTURE.md`
- `AUTH_CONTRACT.md`
- `CLOUDFLARE_CUTOVER.md`
- `CURRENT_PRODUCTION_STATE.md`
- `HANDOFF_MANIFEST.md`
- `OWNER_INTEGRATION_CHECKLIST.md`
- `PAWEL_GRADZIUK_START_HERE.md`
- `README.md`
- `SECURITY.md`
- `VPS_RUNTIME_FREEZE.md`
- `aikintel-snippets/App.route.snippet.tsx`
- `aikintel-snippets/Sidebar.snippet.ts`
- `aikintel-snippets/client/pages/CryptoEdge.tsx`
- `aikintel-snippets/server/routers/cryptoEdge.ts`
