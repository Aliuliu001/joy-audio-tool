// Deploy this module as a Cloudflare Worker, then put its URL in config.js.
const ALLOWED_AUDIO_URLS = [
  /^https:\/\/www\.oxfordlearnersdictionaries\.com\/media\/english\//,
  /^https:\/\/dictionary\.cambridge\.org\/(?:us\/)?media\/english\//
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "86400"
};

function isAllowedAudioUrl(value) {
  return ALLOWED_AUDIO_URLS.some(function (pattern) { return pattern.test(value); });
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
    }

    const sourceUrl = new URL(request.url).searchParams.get("url");
    if (!sourceUrl || !isAllowedAudioUrl(sourceUrl)) {
      return new Response("Unsupported audio URL", { status: 400, headers: CORS_HEADERS });
    }

    const upstream = await fetch(sourceUrl, { redirect: "follow" });
    if (!upstream.ok) {
      return new Response("Audio source unavailable", { status: upstream.status, headers: CORS_HEADERS });
    }

    const headers = new Headers(CORS_HEADERS);
    headers.set("Content-Type", upstream.headers.get("Content-Type") || "audio/mpeg");
    headers.set("Cache-Control", "public, max-age=86400");
    return new Response(upstream.body, { status: 200, headers: headers });
  }
};
