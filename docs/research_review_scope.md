# Research Review Scope

## Purpose

Research Review is the manual-input mode of Crypto Edge AI.

It helps traders evaluate whether a market topic, token, news item, event, link, narrative, or personal observation deserves further analysis.

## Inputs

Supported input types:

- News.
- Link.
- Token description.
- Market event.
- Personal observation.
- Narrative description.
- Contract address.
- Ticker.
- Screenshot described as text.

## Categories

Research Review categories:

- `news_event`.
- `token_review`.
- `narrative`.
- `risk_alert`.
- `market_observation`.
- `setup_review`.
- `low_value_noise`.
- `scam_suspicious`.

## Output

Research Review should return:

- `category`.
- `score`.
- `bias`.
- `confidence`.
- `risk_level`.
- `summary`.
- `reasoning`.
- `risk_factors`.
- `checklist`.
- `decision_label`.
- `disclaimer_note`.

## History and Status

Research reviews may later support:

- User history.
- Status updates.
- Review notes.
- Mapping to existing AIKINTEL Market News / Crypto.

Suggested statuses:

- `new`.
- `to_review`.
- `watching`.
- `rejected`.
- `played`.
- `archived`.

## AIKINTEL Market News Mapping

AIKINTEL already has Market News with Crypto category, sentiment filters, and AI Analysis.

Research Review should not duplicate the general news system. If accessible, it should:

- Reference existing Market News records.
- Use news analysis as context.
- Map relevant news into a review.
- Avoid creating a second generic news feed.

## Safety

Research Review helps decide whether a topic is worth deeper analysis. It does not provide buy/sell signals, trading instructions, or financial advice.
