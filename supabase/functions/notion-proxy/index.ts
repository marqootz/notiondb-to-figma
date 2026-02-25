/**
 * CORS proxy for Notion API.
 * Deploy to Supabase Edge Functions. Set NOTION_API_KEY via supabase secrets.
 *
 * Proxy URL format: https://[PROJECT_REF].supabase.co/functions/v1/notion-proxy
 * Widget uses: ${proxyUrl}/notion/databases/:id/query and ${proxyUrl}/notion/pages/:id
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  // Path is /functions/v1/notion-proxy/notion/databases/xxx/query
  // Extract /notion/... part
  const match = url.pathname.match(/\/notion-proxy(\/notion\/.*)/);
  const notionPath = match ? match[1].replace(/^\/notion/, "") : "";
  const notionUrl = `https://api.notion.com/v1${notionPath}${url.search}`;

  const NOTION_API_KEY = Deno.env.get("NOTION_API_KEY");
  if (!NOTION_API_KEY) {
    return new Response(
      JSON.stringify({ error: "NOTION_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const headers = new Headers({
    Authorization: `Bearer ${NOTION_API_KEY}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  });

  const body = req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined;

  const response = await fetch(notionUrl, {
    method: req.method,
    headers,
    body,
  });

  const result = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
  result.headers.set("Access-Control-Allow-Origin", "*");
  result.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  result.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return result;
});
