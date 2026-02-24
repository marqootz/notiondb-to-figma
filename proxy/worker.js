/**
 * CORS proxy for Notion API.
 * Deploy to Cloudflare Workers (wrangler deploy). Set NOTION_API_KEY in dashboard or wrangler secret.
 */
export default {
  async fetch(request, env, ctx) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const url = new URL(request.url);
    const notionPath = url.pathname.replace(/^\/notion/, "");
    const notionUrl = `https://api.notion.com/v1${notionPath}${url.search}`;

    const NOTION_API_KEY = env.NOTION_API_KEY;
    if (!NOTION_API_KEY) {
      return new Response(
        JSON.stringify({ error: "NOTION_API_KEY not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const headers = new Headers(request.headers);
    headers.set("Authorization", `Bearer ${NOTION_API_KEY}`);
    headers.set("Notion-Version", "2022-06-28");

    const body =
      request.method !== "GET" && request.method !== "HEAD"
        ? await request.text()
        : undefined;

    const response = await fetch(notionUrl, {
      method: request.method,
      headers,
      body,
    });

    const result = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    result.headers.set("Access-Control-Allow-Origin", "*");
    result.headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PATCH, OPTIONS"
    );
    result.headers.set("Access-Control-Allow-Headers", "Content-Type");
    return result;
  },
};
