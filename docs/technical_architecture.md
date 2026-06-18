# Technical Architecture

## Recommended MVP Stack

### Frontend

- React.
- Vite.
- TypeScript.

The frontend should provide a simple authenticated web interface for users and admins.

### Backend

- FastAPI.
- Python.

The backend should own authentication, authorization, user data isolation, topic management, analysis storage, usage limits, and future AI provider access.

### Database

- SQLite for local MVP development and the first camp version.
- PostgreSQL as the likely future production database.

SQLite is acceptable for the MVP because it keeps setup simple and supports fast iteration.

### AI Layer

AI must be accessed through the backend only. The frontend should never call AI providers directly and should never store external AI keys.

Stage 1 includes only architecture documentation and future prompts. Stage 2 or later may include a mock AI service. A real provider can be added later through backend configuration.

Future provider options:

- OpenAI API.
- Claude API.

No real external API keys should be committed to the repository.

## High-Level Flow

1. User logs in.
2. User creates a crypto topic.
3. Backend stores the topic.
4. User requests analysis.
5. Backend checks usage limits.
6. Backend calls mock AI scoring service in MVP.
7. Backend stores the analysis result.
8. Frontend shows category, score, reasoning, risks, checklist, status, and disclaimer.

## Suggested Backend Modules

Future backend structure:

```text
backend/
  app/
    main.py
    api/
    core/
    db/
    models/
    schemas/
    services/
    tests/
```

## Suggested Frontend Modules

Future frontend structure:

```text
frontend/
  src/
    app/
    components/
    pages/
    services/
    types/
```

## Security Principles

- Keep secrets out of the repository.
- Use environment variables for provider keys.
- Keep AI calls on the backend.
- Enforce per-user data access.
- Validate inputs.
- Rate-limit or usage-limit analysis requests.
- Show disclaimer near analysis output.

## Integration Boundaries

The MVP must not include:

- Exchange execution.
- MT4.
- Telegram.
- Discord.
- Payments.
- Automated trading.
