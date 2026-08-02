# Rent vs Buy Calculator

A client-side TypeScript web app that computes a credible, side-by-side financial comparison of renting versus buying a home over a user-defined horizon.

**For:** aspiring first-time homebuyers who want to settle the rent-vs-buy question with real numbers, not rules of thumb.

**Live at:** https://manual-circuit.github.io/rent-vs-buy/

## Tech stack

| Concern          | Choice                         |
| ---------------- | ------------------------------ |
| Language         | TypeScript, strict mode        |
| Build            | Vite                           |
| UI               | React (function components)    |
| Styling          | Tailwind CSS                   |
| Charting         | Recharts                       |
| Data export      | SheetJS (xlsx)                 |
| Input validation | Zod                            |
| Tests            | Vitest + React Testing Library |
| Lint / format    | ESLint + Prettier              |
| CI / deploy      | GitHub Actions → GitHub Pages  |

No backend, no database, no auth — the entire tool runs in the browser. Sharing and persistence both happen without a server: a scenario's full input state is encoded directly into the page URL.

## How the calculator is organized

**Basic Inputs** — the handful of numbers that drive most of the comparison: purchase price, down payment, interest rate, monthly rent, analysis horizon (1–40 years), expected investment return, and how much of any monthly savings gets invested versus spent.

**Advanced Options** — loan details (term, PMI rate, closing costs, selling costs), property costs (tax rate, insurance, HOA, maintenance), year-over-year escalation rates for each cost category, and rental-side details (pet rent, parking, deposits, admin fees).

**Expert Options** — federal tax effects (mortgage interest deduction, SALT cap, itemize vs. standard, capital gains on sale), the "show in today's dollars" display toggle, and an optional one-time refinance event (new rate, new term, new closing costs at a chosen month).

**Results** — a headline verdict and margin, a tabbed chart (Net Worth, Annual Costs, Monthly Costs) with an inline horizon slider, a sensitivity strip showing the ±1 percentage point impact of the four key rates, and a full line-item cost breakdown table comparing buying and renting.

**Export Data** — downloads a multi-sheet Excel workbook (Summary, Amortization schedule, one sheet per chart, and every input used) so the numbers can be taken into a spreadsheet, a lender conversation, or your own model.

**Sharing** — every input is encoded into the URL. Copy the address bar to hand a scenario to someone else, or bookmark it to come back to later. There's no server-side save, no account, and no import/export of a scenario file — the URL is the only save format, by design.

## What it models

- Full amortization with PMI removal at 80% LTV of purchase price
- One-time refinance event: new rate, new term, and new closing costs at a chosen month, with the pre/post-event schedules stitched at the exact remaining balance
- Opportunity cost on down payment, closing costs, and refundable deposits (capital the renter keeps invested, refunded at horizon end)
- Monthly cost differential invested at a user-adjustable return rate — entered as a real (inflation-adjusted) rate when viewing figures in today's dollars, automatically converted to its nominal equivalent for the underlying compounding
- Sale proceeds at horizon end (appreciated home value minus loan balance minus selling costs), net of federal capital gains tax (IRC §121 primary-residence exclusion)
- Federal tax effects: mortgage interest deduction, SALT cap, itemize vs. standard deduction, state income tax estimate
- Optional inflation adjustment — display figures in today's dollars without changing the underlying model
- Variable analysis horizon (1–40 years)
- Year-over-year escalation of all costs (rent, HOA, maintenance, insurance, utilities)

## Model assumptions and limitations

This tool does **not** model:

- Adjustable-rate mortgages or non-conventional loan products (FHA/VA/jumbo)
- Geographic variation in tax rates or appreciation
- Multiple scenarios side-by-side in one view (open separate tabs with different URLs, or use Export Data to compare numbers in your own spreadsheet)
- Tax on the invested cost differential (a closed design decision, not a gap)
- Monthly-granularity escalation changes (e.g., rent increasing 4%/yr for years 1–5 then 6%/yr after) — all costs escalate at a single flat annual rate

Shared URLs embed your full financial scenario and are visible in browser history, host access logs, and referrer headers.
