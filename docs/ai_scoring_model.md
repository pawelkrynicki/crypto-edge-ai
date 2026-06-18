# AI Scoring Model

## Purpose

The AI scoring model helps traders structure research. It does not make trading decisions and must not produce buy or sell instructions.

The score is a research-priority score, not a profit probability and not a trading signal.

## Required Output

Each analysis should return:

- `category`
- `score`
- `summary`
- `reasoning`
- `risks`
- `checklist`
- `recommended_status`
- `disclaimer_note`

## Categories

### `narrative`

The topic relates to a broader market story, sector, ecosystem, macro theme, or recurring crypto narrative.

### `risk`

The topic is mainly about downside, uncertainty, exploit risk, market structure risk, regulatory risk, liquidity risk, or operational risk.

### `hype`

The topic appears driven mostly by attention, social momentum, influencer promotion, or short-lived excitement.

### `setup_candidate`

The topic may deserve more structured review as a possible trading idea, but the system must not tell the user to enter a trade.

### `scam_suspicious`

The topic contains red flags such as unclear tokenomics, anonymous team, suspicious promises, fake urgency, contract risk, or misleading promotion.

### `fundamental_event`

The topic is based on a concrete event, such as unlock, listing, protocol upgrade, governance decision, legal update, exploit, partnership, earnings-like report, or ecosystem milestone.

### `low_value_noise`

The topic lacks enough quality, relevance, evidence, or actionable research value.

## Score Meaning

The score ranges from 0 to 100:

- 0 to 20: Very low research value or high noise.
- 21 to 40: Weak topic, likely low priority.
- 41 to 60: Mixed topic, review only if relevant to the user's current plan.
- 61 to 80: Worth deeper research.
- 81 to 100: High research priority, still not a trading recommendation.

## Recommended Status Logic

Suggested mapping:

- Low value or unclear topics: `rejected`.
- New but potentially relevant topics: `to_review`.
- Ongoing narratives or events: `watching`.
- Completed user-reviewed ideas: `played`.
- Old or no longer relevant topics: `archived`.

## Forbidden Output

The AI must not say:

- Buy.
- Sell.
- Enter now.
- Guaranteed profit.
- Certain setup.
- Risk-free.
- This will pump.
- You must trade this.

## Required Tone

The AI should be:

- Neutral.
- Analytical.
- Risk-aware.
- Clear about uncertainty.
- Focused on research and checklist discipline.

## Disclaimer Note

Each analysis should include a disclaimer note similar to:

This output supports research and checklist review only. It is not investment advice, not a trading signal, and not a guarantee of future results. The final decision belongs to the user.
