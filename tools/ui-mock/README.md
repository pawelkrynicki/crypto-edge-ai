# Crypto Edge AI — Camp BETA UI Mock

This directory contains the first UI mock / frontend preview for the **Crypto Edge AI Camp BETA**. 

It demonstrates the visual direction, product structure, and trader value proposition (research, risk, scam filtering) before the full backend integration.

## Features
- **Dark, professional UI**: Aligned with the AIKINTEL aesthetic.
- **Scanner Radar**: Main table view showing token candidates with market data, basic filter status, security checks, and final labels.
- **Candidate Detail Panel**: In-depth breakdown of a selected token, including a trader checklist and risk reasons.
- **Research Review (Mock)**: A text area to paste news/events and see a mock AI risk categorization.
- **Watchlist & Risk Alerts**: Dedicated tabs for tracking eligible candidates and critical risks.
- **Methodology**: Explanation of the staged review process.

## Important Product Rules
- **No Buy Signals**: Crypto Edge AI is a research tool, not a trading bot.
- **WATCHLIST ≠ Buy**: The `WATCHLIST` label strictly means "eligible for further review". It explicitly states "Further review only, not a buy signal."
- **Mock Data Only**: This preview uses hardcoded mock data aligned with the `CombinedScanner` output from `tools/data-poc`. It does not make real API calls, connect to a database, or use real OpenAI models yet.

## Development

This is a Vite + React + TypeScript + Tailwind CSS project.

### Commands

```bash
cd tools/ui-mock
npm install     # or pnpm install
npm run dev     # Start local development server
npm run build   # Build for production
```

## Next Steps
- Connect this UI to the persistable JSON outputs from `tools/data-poc` or a real backend API.
- Replace mock data with live combined scanner data.
- Integrate real OpenAI calls for the Research Review tab.
