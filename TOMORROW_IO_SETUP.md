# Tomorrow.io API Key Setup

## Overview

DiveOps uses the [Tomorrow.io](https://www.tomorrow.io/) weather API for real-time
lightning detection and flash-rate density data. This powers the **Weather & Lightning**
widget on the operations dashboard, which enforces USACE EM 385-1-1 §30 stop-work rules
when lightning is detected within 5 nautical miles of a dive site.

The environment variable `TOMORROW_IO_API_KEY` is **currently set as a placeholder** in
the Azure Container App. Replace it with a real key to enable live lightning data.

---

## Free Tier Sign-Up (< 5 minutes)

1. Go to <https://app.tomorrow.io/signup> and create a free account.
2. After email verification, navigate to **Development → API Keys**.
3. Copy the default key (or create a new one labelled `diveops-production`).
4. The free tier allows **500 API calls/day** — sufficient for a single-site operation
   polling every 60 seconds (1 440 calls/day requires the **Starter** plan at $0/month
   with 1 000 calls/day, or the **Developer** plan at $99/month for unlimited calls).

---

## Setting the Key in Azure Container Apps

```bash
az containerapp update \
  --name diveops-mvp \
  --resource-group precisionsubsea-rg \
  --set-env-vars TOMORROW_IO_API_KEY=<your-key-here>
```

Replace `<your-key-here>` with the key copied from the Tomorrow.io dashboard.

---

## Behaviour Without a Valid Key

When `TOMORROW_IO_API_KEY` is absent or set to the placeholder value, the lightning
widget falls back gracefully:

- If `OPENWEATHER_API_KEY` is present, OpenWeatherMap forecast data is used to detect
  thunderstorm conditions (less precise — no flash-rate density or distance estimate).
- If neither key is configured, the widget displays:
  > "Lightning data not configured. Add TOMORROW_IO_API_KEY or OPENWEATHER_API_KEY."

No server errors are thrown; the endpoint returns HTTP 200 with `configured: false`.

---

## Relevant Source Files

| File | Purpose |
|------|---------|
| `server/routes.ts` (line ~1002) | Weather/lightning API handler |
| `TOMORROW_IO_SETUP.md` | This document |

---

## Plan Tiers (as of 2025)

| Plan | Price | Calls/day | Lightning data |
|------|-------|-----------|----------------|
| Free | $0 | 500 | Yes |
| Starter | $0 | 1 000 | Yes |
| Developer | $99/mo | Unlimited | Yes |

For a single-vessel operation polling every 60 s, the **Starter** plan is sufficient.
For multi-vessel or high-frequency polling, use the **Developer** plan.
