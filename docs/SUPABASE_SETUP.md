# Supabase Proxy Setup

Host the Notion CORS proxy on Supabase Edge Functions.

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) installed:
  ```bash
  brew install supabase/tap/supabase
  # or: npm install -g supabase
  ```
- A [Supabase project](https://database.new) (free tier works)
- A [Notion integration](https://www.notion.so/my-integrations) with API key

## Step 1: Create Supabase Project

1. Go to [database.new](https://database.new)
2. Sign in and create a new project
3. Note your **Project ID** (Settings → General)

## Step 2: Link and Deploy

```bash
cd notiondb-to-figma

# Log in to Supabase (opens browser)
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_ID

# Set your Notion API key as a secret
supabase secrets set NOTION_API_KEY=your_notion_integration_secret

# Deploy the function (no JWT verification - widget calls it directly)
supabase functions deploy notion-proxy --no-verify-jwt
```

## Step 3: Get Your Proxy URL

After deployment, your proxy URL is:

```
https://YOUR_PROJECT_ID.supabase.co/functions/v1/notion-proxy
```

Example: `https://abcdefgh.supabase.co/functions/v1/notion-proxy`

## Step 4: Update Figma Widget

1. In the widget, enter the proxy URL in the **Proxy URL** field (no trailing slash)
2. Enter your **Notion Database ID** (from the database URL: `notion.so/xxx?v=...` — the 32-char ID)
3. Use menu (⋯) → **Sync**

## Step 5: Update manifest.json (for published widgets)

If you publish the widget, add your Supabase domain to `manifest.json`:

```json
"networkAccess": {
  "allowedDomains": ["https://YOUR_PROJECT_ID.supabase.co"],
  "reasoning": "Fetches and updates Notion database via CORS proxy."
}
```

Use `*.supabase.co` so all Supabase project URLs are allowed.

## Local Testing (optional)

```bash
supabase start
supabase functions serve notion-proxy

# Test (replace with your anon key from supabase status)
curl -X POST "http://localhost:54321/functions/v1/notion-proxy/notion/databases/YOUR_DB_ID/query" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Troubleshooting

- **NOTION_API_KEY not configured**: Run `supabase secrets set NOTION_API_KEY=xxx` and redeploy
- **CORS errors**: The function adds CORS headers; ensure you're using the exact proxy URL
- **403 from Notion**: Share your database with the Notion integration (database → ⋯ → Connections → Add)
