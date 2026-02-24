# Notion Table Sync — Figma Widget

A custom Figma widget that renders a **Notion database** as an interactive, two-way synced table on the Figma canvas.

## Architecture

1. **Figma Widget** (`widget-src/code.tsx`) — Renders the table, handles sync and cell editing via property menu and modal UI.
2. **CORS Proxy** (`proxy/worker.js`) — Cloudflare Worker that forwards requests to the Notion API and adds `Access-Control-Allow-Origin: *` so the widget can call it from the Figma sandbox.
3. **Notion API** — Read (query database) and write (patch page properties) through the proxy.

The proxy is required because the Notion API does not allow `null` origin (Figma’s widget iframe), so direct `fetch()` from the widget would fail with CORS.

## Project structure

```
notion-to-figma/
├── widget-src/
│   ├── code.tsx          # Widget UI + logic
│   ├── notion-types.ts   # Notion API types
│   └── notion-parsers.ts  # Parse Notion props → display; build PATCH payloads
├── proxy/
│   ├── worker.js         # Cloudflare Worker
│   └── wrangler.toml
├── dist/
│   ├── code.js           # Built widget (from npm run build)
│   └── ui.html
├── manifest.json
├── package.json
└── tsconfig.json
```

## Setup

### 1. Widget (Figma)

```bash
npm install
npm run build
# or: npm run watch
```

- Open **Figma Desktop** → **Menu → Widgets → Development → Import widget from manifest**.
- Choose the project folder (where `manifest.json` lives).
- Insert the widget from **Menu → Widgets → Development → Notion Table Sync**.

### 2. Proxy (Cloudflare Workers)

```bash
cd proxy
# Set your Notion API key (create one at https://www.notion.so/my-integrations)
wrangler secret put NOTION_API_KEY
wrangler deploy
```

Note the worker URL (e.g. `https://notion-cors-proxy.<your-subdomain>.workers.dev`). The widget will call this URL with paths like `/notion/databases/:id/query` and `/notion/pages/:id`.

### 3. Notion

- Create an integration at [Notion → My integrations](https://www.notion.so/my-integrations) and copy the **Internal Integration Token**.
- Create or use a database and **share it with the integration** (••• → Add connections → your integration).
- Copy the **Database ID** from the database URL:  
  `https://www.notion.so/workspace/DATABASE_ID?v=...`

### 4. Configure the widget

1. Insert the widget on the canvas.
2. Use the widget **⋯** menu → **Configure Notion DB**.
3. Enter:
   - **Proxy URL**: your worker URL (e.g. `https://notion-cors-proxy.xxx.workers.dev`) with no trailing slash.
   - **Notion Database ID**: the 32-char ID from the Notion database URL.
4. **Save**, then **⋯ → Sync from Notion**.

The table will fill with columns and rows. Click a cell to edit; changes are sent to Notion via the proxy and the widget state updates.

## Manifest and network access

In `manifest.json`, `networkAccess.allowedDomains` must include the **hostname** of your proxy (no `https://`), e.g.:

```json
"allowedDomains": ["notion-cors-proxy.your-subdomain.workers.dev"]
```

Replace with your actual Workers subdomain. For multiple environments you can add several domains.

## Notion property types

- **Read (table display):** title, rich_text, number, select, multi_select, checkbox, date, url, status, formula, rollup.
- **Write (cell edit):** title, rich_text, number, select, checkbox, date, url. Other types are read-only; editing sends a rich_text value where possible.

## Development

- Run `npm run watch` and re-import the widget (or use Development → Reload) after code changes.
- Test in **Figma Desktop**; widget network requests are subject to the manifest’s `allowedDomains`.

## License

MIT.
