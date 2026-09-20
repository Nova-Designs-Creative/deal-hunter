# DealHunter

AI shopping **research agent** for the YouTube video **"I Built an AI to Find Better Deals Than Google"**.

Gemini reasons. Decodo supplies live web data. Location-aware. Dynamic product specs. Lowest price ≠ recommended deal.

## Setup

```bash
npm install
cp .env.example .env.local   # or create .env.local
```

| Variable | Required | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | yes (preferred) | [OpenRouter](https://openrouter.ai/settings/keys) key — default model `nvidia/nemotron-3.5-lightning:free` |
| `OPENROUTER_MODEL` | no | Override OpenRouter model id |
| `GEMINI_API_KEY` | optional | Fallback if OpenRouter unset |
| `DECODO_API_KEY` | yes* | Decodo Web Scraping API token |
| `DECODO_USERNAME` / `DECODO_PASSWORD` | alt* | Alternative auth |
| `CSC_API_KEY` | recommended | [Country State City](https://docs.countrystatecity.in/api/introduction) key. Cached on disk under `.cache/csc/` for 30 days so the free 100 calls/day limit is barely touched. |
| `DECODO_GEO` | no | Optional Decodo geo hint |
| `DECODO_PROXY_POOL` | no | `standard` (default) or `premium` — universal scrapes only |

```bash
npm run dev
```

## Pipeline

USER → LOCATION → GEMINI (product understanding) → SEARCH PLAN → RETAILER DISCOVERY → DECODO → EXTRACTION → MATCHING → RETAILER/SELLER EVAL → SHIPPING → EFFECTIVE PRICE → RANKING → RECOMMENDED + LOWEST PRICE → GOOGLE COMPARE (manual)

## Ranking weights (`lib/ranking-config.ts`)

- Product Match 35%
- Effective Price 30%
- Retailer/Seller Confidence 20%
- Availability 10%
- Data Completeness 5%

## Video checkpoints

1. `v1-basic-search`
2. `v2-decodo`
3. `v3-product-understanding`
4. `v4-product-matching`
5. `v5-retailer-verification`
6. `v6-effective-price`
7. `v7-final-ranking`
8. `v8-google-comparison`

## Test queries

- Find the cheapest MacBook Air M4 (US + PH)
- Find me a leather work bag (PH)
- Find the best deal on Sony WH-1000XM6
- Find the cheapest RTX 5070
- Find Nike running shoes under $150
