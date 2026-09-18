// Cloudflare Worker code for Edge TTS proxy
const TRUSTED = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WSS = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED}`;
const VER = "1-143.0.3650.75";

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }
    try {
      const { text, voice, rate } = await request.json();
      // Call Edge TTS via fetch or similar if possible, or return worker instructions
      return new Response(JSON.stringify({ error: "Use client-side fetch or direct proxy" }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
    }
  }
};
