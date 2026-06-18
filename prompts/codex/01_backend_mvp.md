# Codex Prompt: Backend MVP

You are working on Crypto Edge AI, a real web-based research assistant for crypto traders.

Build the backend MVP using FastAPI and Python.

Important boundaries:

- Do not build a trading bot.
- Do not create buy or sell signals.
- Do not integrate exchanges.
- Do not integrate MT4.
- Do not integrate Telegram, Discord, or payments.
- Do not commit API keys.
- Do not add real AI provider calls yet unless explicitly requested later.

Backend MVP requirements:

- FastAPI app structure.
- SQLite database.
- User model.
- Roles: `admin` and `user`.
- Topic model.
- Analysis model.
- Topic statuses:
  - `new`
  - `to_review`
  - `watching`
  - `rejected`
  - `played`
  - `archived`
- AI categories:
  - `narrative`
  - `risk`
  - `hype`
  - `setup_candidate`
  - `scam_suspicious`
  - `fundamental_event`
  - `low_value_noise`
- Mock analysis service returning:
  - `category`
  - `score`
  - `summary`
  - `reasoning`
  - `risks`
  - `checklist`
  - `recommended_status`
  - `disclaimer_note`
- Usage limit foundation.
- Per-user data isolation.

Keep the implementation small, clear, and ready for frontend integration.
