// SRecette CORS proxy — déployé sur Cloudflare Workers (plan gratuit : 100k requêtes/jour).
//
// Usage : GET https://<worker>.workers.dev/?url=<urlencoded URL cible>
// Whitelist stricte des domaines pour ne pas devenir un proxy ouvert.

const ALLOWED = [
  "marmiton.org",
  "750g.com",
  "cuisineaz.com",
];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const u = new URL(request.url);
    const target = u.searchParams.get("url");
    if (!target) {
      return new Response("Missing ?url= parameter", { status: 400, headers: corsHeaders() });
    }

    let targetUrl;
    try { targetUrl = new URL(target); }
    catch { return new Response("Invalid url", { status: 400, headers: corsHeaders() }); }

    const host = targetUrl.hostname.toLowerCase();
    if (!ALLOWED.some((d) => host === d || host.endsWith("." + d))) {
      return new Response("Domain not allowed", { status: 403, headers: corsHeaders() });
    }

    const upstream = await fetch(targetUrl.toString(), {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      cf: { cacheTtl: 300, cacheEverything: true },
    });

    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        ...corsHeaders(),
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  },
};
