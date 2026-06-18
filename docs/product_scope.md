# Product Scope

## What Crypto Edge AI Does

Crypto Edge AI lets a crypto trader add a market topic, such as a token, news item, narrative, protocol event, market observation, or possible setup candidate. The system stores the topic and returns a structured analysis.

The analysis should help the user understand:

- What the topic appears to be.
- Which category it belongs to.
- How relevant it may be for further research.
- Which risks are visible.
- Which checklist items should be reviewed.
- Which non-trading status is appropriate for tracking.

## MVP v1 Features

MVP v1 should include:

- User login.
- Admin and user roles.
- User-specific topics and analyses.
- Topic creation.
- AI analysis or mock AI analysis.
- Topic category.
- Score from 0 to 100.
- Short summary.
- Reasoning.
- Risks.
- Checklist.
- Recommended topic status.
- Topic status management.
- Analysis history.
- Basic admin panel.
- Usage limits.
- Security disclaimer.

## Topic Statuses

Supported topic statuses:

- `new`
- `to_review`
- `watching`
- `rejected`
- `played`
- `archived`

## AI Categories

Supported AI categories:

- `narrative`
- `risk`
- `hype`
- `setup_candidate`
- `scam_suspicious`
- `fundamental_event`
- `low_value_noise`

## Analysis Result Shape

Every analysis should eventually return:

```json
{
  "category": "narrative",
  "score": 72,
  "summary": "Short neutral summary of the topic.",
  "reasoning": "Why the system classified and scored the topic this way.",
  "risks": ["Risk item 1", "Risk item 2"],
  "checklist": ["Checklist item 1", "Checklist item 2"],
  "recommended_status": "to_review",
  "disclaimer_note": "This is research support, not investment advice."
}
```

## Out of Scope for MVP v1

The following are intentionally out of scope:

- Automated trading.
- Buy or sell signals.
- Exchange integrations.
- MT4 integration.
- Telegram or Discord integrations.
- Payment systems.
- Real external AI provider keys committed to the repository.
- Profit promises.
- Portfolio management.
- Copy trading.
