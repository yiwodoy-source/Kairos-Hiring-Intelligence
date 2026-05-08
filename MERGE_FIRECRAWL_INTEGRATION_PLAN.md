# Merge.dev + Firecrawl Integration Note

## What was added

The backend now includes optional integration clients and protected routes for:

- `Firecrawl` for web search and scrape support
- `Merge.dev` for ATS-normalized candidate, job, and application access
- `ScrapeGraphAI` for public-page scraping, extraction, and search enrichment

## Backend routes

- `GET /api/integrations/status`
- `POST /api/integrations/firecrawl/search`
- `POST /api/integrations/firecrawl/scrape`
- `GET /api/integrations/merge/candidates`
- `GET /api/integrations/merge/jobs`
- `GET /api/integrations/merge/applications`
- `POST /api/integrations/scrapegraph/search-public`
- `POST /api/integrations/scrapegraph/scrape-public`
- `POST /api/integrations/scrapegraph/extract-public-profile`

These routes are protected by the existing JWT auth middleware.

## Current behavior

- If no keys are configured, the routes fail safely and the app continues normally.
- If `FIRECRAWL_API_KEY` is configured, sourcing can prefer Firecrawl search before Serper/DDG fallback.
- If `MERGE_API_KEY` and `MERGE_ACCOUNT_TOKEN` are configured, the app can read ATS data through Merge's unified Recruiting API.
- If `SCRAPEGRAPH_API_KEY` is configured, the app can use ScrapeGraphAI for public-page extraction and search.
- ScrapeGraphAI is intentionally blocked from LinkedIn and Indeed profile scraping in this project.

## Environment variables

Add these to `backend/.env` when ready:

```env
FIRECRAWL_API_KEY=fc_your_firecrawl_api_key
FIRECRAWL_BASE_URL=https://api.firecrawl.dev

MERGE_API_KEY=your_merge_api_key
MERGE_ACCOUNT_TOKEN=your_merge_linked_account_token
MERGE_BASE_URL=https://api.merge.dev/api/ats/v1

SCRAPEGRAPH_API_KEY=sgai-your-scrapegraph-api-key
SCRAPEGRAPH_BASE_URL=https://v2-api.scrapegraphai.com
```

## Best use in this project

### Firecrawl

Use for:

- sourcing from public web profiles
- scraping profile pages and job pages
- extracting cleaner context for candidate discovery

### Merge.dev

Use for:

- normalizing ATS data from supported recruiting systems
- syncing jobs, applications, and candidates into Talent Operations Console
- avoiding custom one-off ATS integrations where Merge already covers them

### ScrapeGraphAI

Use for:

- public portfolio or personal-site enrichment
- company page extraction
- job page analysis
- search-plus-extract workflows on permitted public sources

Do not use for:

- LinkedIn profile scraping
- Indeed profile scraping
- unsupported harvesting of restricted candidate platforms

## Recommendation

Keep these integrations optional until:

1. the local orchestration path is stable enough for daily use
2. we decide which external ATS or sourcing systems are truly needed
3. valid API credentials are available

## Official references

- Firecrawl MCP and API docs:
  - https://docs.firecrawl.dev/mcp-server
  - https://docs.firecrawl.dev/api-reference/v2-introduction
- Merge MCP and ATS docs:
  - https://docs.merge.dev/basics/mcp/
  - https://docs.merge.dev/merge-unified/ats/overview
- ScrapeGraphAI API and SDK docs:
  - https://docs.scrapegraphai.com/api-reference/introduction
  - https://docs.scrapegraphai.com/sdks/javascript
