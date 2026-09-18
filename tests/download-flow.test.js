const test = require("node:test");
const assert = require("node:assert/strict");

global.document = {
  addEventListener() {},
  getElementById() { return null; }
};
const { buildProxyUrl } = require("../app.js");

test("builds a proxy URL that preserves the audio source URL", () => {
  assert.equal(
    buildProxyUrl(
      "https://audio-proxy.example.workers.dev/audio",
      "https://www.oxfordlearnersdictionaries.com/media/english/uk_pron/a/anc/anch_/anchor__gb_1.mp3"
    ),
    "https://audio-proxy.example.workers.dev/audio?url=https%3A%2F%2Fwww.oxfordlearnersdictionaries.com%2Fmedia%2Fenglish%2Fuk_pron%2Fa%2Fanc%2Fanch_%2Fanchor__gb_1.mp3"
  );
});
