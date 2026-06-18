# Roadmap

## Stage 1: Repository, Documentation, Architecture

Create the initial repository foundation:

- Folder structure.
- Product documentation.
- MVP requirements.
- Technical architecture.
- AI scoring model description.
- Security and disclaimer rules.
- Prompt files for future implementation steps.

## Stage 2: Backend MVP

Build the FastAPI backend skeleton:

- App structure.
- Health endpoint.
- User model.
- Topic model.
- Analysis model.
- SQLite setup.
- Authentication foundation.
- Role handling.

## Stage 3: Frontend MVP

Build the React, Vite, TypeScript frontend:

- Login screen.
- Topic list.
- Topic create form.
- Analysis result view.
- Status controls.
- Basic admin view.
- Disclaimer display.

## Stage 4: Mock AI Scoring

Implement deterministic mock scoring through the backend:

- Category classification.
- Score 0 to 100.
- Summary.
- Reasoning.
- Risks.
- Checklist.
- Recommended status.

## Stage 5: Real AI Provider Through Backend

Add provider abstraction:

- Environment-based configuration.
- OpenAI or Claude provider option.
- No frontend provider calls.
- No committed API keys.
- Safe output rules.

## Stage 6: Login, Limits, History

Harden user workflows:

- Per-user data isolation.
- Usage limits.
- Analysis history.
- Admin visibility.
- Better error states.

## Stage 7: Hosting and Camp Version

Prepare camp deployment:

- Hosting plan.
- Database persistence.
- Environment variables.
- Admin bootstrap flow.
- Backup and restore procedure.

## Stage 8: Tests, Demo Backup, Stabilization

Prepare for real use:

- Backend tests.
- Frontend smoke tests.
- Seed/demo data.
- Backup demo instance.
- Production-readiness checklist.
