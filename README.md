# SplitEasy

A lightweight, self-hosted Splitwise alternative for small travel groups. No sign-ups, no daily expense limits, no ads. One shared password gates the site; inside, you add group members by name and track expenses with flexible splitting, settlement optimization, and a mobile-first UI.

Built for a Budapest & Vienna trip, reusable for any group trip or shared living situation.

## How it works

```
┌─────────────────────────────────────┐
│         Netlify (hosting)           │
│                                     │
│  ┌───────────┐   ┌───────────────┐  │
│  │ React SPA │   │ Netlify Fns   │  │
│  │  (Vite)   │◄─►│ (serverless)  │  │
│  └───────────┘   └──────┬────────┘  │
│                         │           │
│                    ┌────▼────┐      │
│                    │ JSON DB │      │
│                    │ (Blobs) │      │
│                    └─────────┘      │
└─────────────────────────────────────┘
```

- **Frontend** — React 18 + Vite + Tailwind, deployed as a Netlify static site.
- **Backend** — Netlify Functions (Node). Every data mutation goes through them.
- **Database** — a single JSON document in [Netlify Blobs](https://docs.netlify.com/blobs/overview/). No external database. Fine for < 20 people and < 500 expenses.
- **Auth** — one shared password, checked against an environment variable, exchanged for an HMAC-signed HttpOnly cookie.

## Deploy it

### 1. Push to GitHub

This repo is ready to deploy as-is.

### 2. Connect to Netlify

In the Netlify dashboard: **Add new site → Import an existing project**, pick the repo. The build settings come from `netlify.toml`, so leave them alone:

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Publish directory | `dist` |
| Functions directory | `netlify/functions` |

### 3. Set environment variables

Under **Site configuration → Environment variables**, add both:

| Variable | What it is |
| --- | --- |
| `APP_PASSWORD` | The shared password you give the trip group |
| `SESSION_SECRET` | A random string used to sign session cookies |

Generate the secret with:

```bash
openssl rand -hex 32
```

Neither value lives in this repo. The app fails closed (500) if either is missing, rather than falling back to a default.

### 4. Deploy, then test the password gate on your phone

Share the URL and the password with the group.

## Run it locally

```bash
npm install
npm install -g netlify-cli   # if you don't have it
```

Create a `.env` file in the project root (it is gitignored):

```
APP_PASSWORD=whatever-you-want
SESSION_SECRET=some-long-random-string
```

Then:

```bash
netlify dev
```

This serves the Vite frontend and the functions together on one origin (usually http://localhost:8888) so `/api/*` routing and cookies behave exactly like production.

`npm run dev` alone runs only the frontend — the API calls will fail without the functions.

## Tests

```bash
npm test
```

Covers the split math (equal, percentage, exact, rounding), balance computation, debt simplification, and auth token signing/validation.

## How the money math works

Every amount is stored as an **integer in minor units** (cents, fillér) so there is no floating-point drift. The UI converts for display.

**Equal splits.** The total is divided by the number of participants and floored. The leftover minor units (usually 1 or 2) go to participants in **alphabetical order by name** — so €10.00 split three ways between Alice, Bob and Cara gives Alice €3.34 and the other two €3.33. It is deterministic, and the same rule is applied everywhere the split is recomputed.

**Percentage splits** must sum to 100%; **exact splits** must sum to the expense total. The app blocks saving otherwise.

**Balances.** For each member:

```
net = (what they paid) - (what they owe across all splits)
    + (settlements received) - (settlements sent)
```

Positive means the group owes them, negative means they owe the group. All nets always sum to zero.

**Settling up** uses greedy creditor-debtor matching: sort debtors and creditors by size, repeatedly match the largest of each and emit a payment for the smaller of the two amounts. This produces a small number of transactions and always clears every balance. It is not guaranteed to be the mathematical minimum for every case — that problem is NP-hard — but it is correct and easy to reason about.

**Multiple currencies.** Each expense stores its own currency. The app does **not** convert between them. If a group has expenses in more than one currency, the balances screen says so and you settle per currency.

## API

All routes are under `/api` and require the session cookie, except `/api/auth`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/auth` | Check whether the session is valid |
| POST | `/api/auth` | Validate the password, set cookies |
| POST | `/api/auth/logout` | Clear cookies |
| GET | `/api/groups` | List groups |
| POST | `/api/groups` | Create a group |
| GET | `/api/groups/:id` | Group with members, expenses, settlements, activity |
| PUT | `/api/groups/:id` | Update name, currency, members |
| DELETE | `/api/groups/:id` | Delete a group and everything in it |
| GET | `/api/groups/:id/expenses` | List expenses |
| POST | `/api/groups/:id/expenses` | Add an expense |
| PUT | `/api/groups/:id/expenses/:eid` | Edit an expense |
| DELETE | `/api/groups/:id/expenses/:eid` | Delete an expense |
| GET | `/api/groups/:id/balances` | Net balances + simplified settlement plan |
| GET | `/api/groups/:id/settlements` | List settlements |
| POST | `/api/groups/:id/settlements` | Record a payment |
| DELETE | `/api/groups/:id/settlements/:sid` | Delete a settlement |
| GET | `/api/groups/:id/export` | CSV export |

## Project layout

```
netlify/functions/     serverless API (_shared/ holds storage, auth, http helpers)
src/lib/               types, split math, settlement algorithm, API client
src/context/           auth state
src/pages/             Login, GroupList, GroupView, AddExpense
src/components/        UI building blocks
test/                  vitest unit tests
```

## A note on the security model

This is a password wall, not an account system. Everyone with the password sees and can edit everything — appropriate for a trip group, not for anything sensitive. The session cookie is HMAC-signed so it cannot be forged, is `HttpOnly` and `SameSite=Strict`, and expires after 30 days. There is no rate limiting; the password gate is considered sufficient for a small private group.
