# MVP Requirements

## Goal

Build a usable MVP for a trading camp audience. The MVP should let users log in, add crypto topics, receive structured AI-style analysis through a mock or future backend provider, and manage topic status over time.

## User Roles

### User

A user can:

- Log in.
- Add crypto topics.
- View only their own topics.
- Request mock analysis.
- View analysis history.
- Update topic status.
- See usage limits and disclaimer.

### Admin

An admin can:

- View basic user list.
- View usage counts.
- Review topics across users.
- Manage user access in a basic way.
- Monitor system usage.

## Topic Fields

A topic should include:

- ID.
- User ID.
- Title.
- Description or notes.
- Source URL, optional.
- Status.
- Created timestamp.
- Updated timestamp.

## Analysis Fields

An analysis should include:

- ID.
- Topic ID.
- Category.
- Score from 0 to 100.
- Summary.
- Reasoning.
- Risks.
- Checklist.
- Recommended status.
- Disclaimer note.
- Provider type, initially `mock`.
- Created timestamp.

## Required Statuses

- `new`
- `to_review`
- `watching`
- `rejected`
- `played`
- `archived`

## Required Categories

- `narrative`
- `risk`
- `hype`
- `setup_candidate`
- `scam_suspicious`
- `fundamental_event`
- `low_value_noise`

## Usage Limits

The MVP should support simple usage limits, such as:

- Maximum analyses per user per day.
- Admin-visible usage count.
- Clear error message when a limit is reached.

## Disclaimer Requirement

Every analysis view should clearly state that:

- The result is research support only.
- It is not investment advice.
- The user makes the final decision.
- The system does not guarantee outcomes.
