import assert from "node:assert/strict";
import test from "node:test";
import { createNewsService, NewsService, newsProviderSettings } from "../src/server/news-service.js";

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

test("resolves provider settings from environment variables", () => {
  assert.deepEqual(newsProviderSettings({}), { newsApi: null, twitter: null });
  assert.deepEqual(newsProviderSettings({ NEWSAPI_KEY: "key" }), { newsApi: { apiKey: "key" }, twitter: null });
  assert.deepEqual(
    newsProviderSettings({ NEWSAPI_KEY: "key", TWITTER_BEARER_TOKEN: "token" }),
    { newsApi: { apiKey: "key" }, twitter: { bearerToken: "token" } }
  );
});

test("reports whether any provider is configured", () => {
  assert.equal(new NewsService({ newsApi: null, twitter: null }).isConfigured(), false);
  assert.equal(new NewsService({ newsApi: { apiKey: "x" }, twitter: null }).isConfigured(), true);
  assert.equal(new NewsService({ newsApi: null, twitter: { bearerToken: "x" } }).isConfigured(), true);
});

test("rejects when asked to fetch symbols without a configured provider", async () => {
  const service = new NewsService({ newsApi: null, twitter: null });
  await assert.rejects(() => service.forSymbols(["AAPL"]), /not configured/);
});

test("sanitizes quote and backslash characters out of provider queries", async () => {
  const requests = [];
  const request = async (url) => {
    requests.push(url.toString());
    return jsonResponse({ articles: [], data: [] });
  };
  const service = new NewsService({ newsApi: { apiKey: "key" }, twitter: { bearerToken: "token" } }, request);
  await service.forSymbols(["AAPL"], () => 'Evil" OR "\\injection');
  const newsUrl = new URL(requests.find((url) => new URL(url).hostname === "newsapi.org"));
  const twitterUrl = new URL(requests.find((url) => new URL(url).hostname === "api.twitter.com"));
  assert.equal(newsUrl.searchParams.get("q"), '"AAPL" OR "Evil OR injection"');
  assert.equal(twitterUrl.searchParams.get("query"), "AAPL lang:en -is:retweet");
});

test("aggregates, dedupes and sorts articles from both providers", async () => {
  const requests = [];
  const request = async (url, options) => {
    requests.push({ url: url.toString(), options });
    if (new URL(url.toString()).hostname === "newsapi.org") {
      return jsonResponse({
        articles: [
          { title: "Apple unveils new product", description: "desc", url: "https://example.com/1", author: "A. Writer", publishedAt: "2024-01-01T00:00:00.000Z" },
          { title: "", url: "https://example.com/bad", publishedAt: "2024-01-02T00:00:00.000Z" }
        ]
      });
    }
    return jsonResponse({
      data: [
        { text: "Apple stock is up today", id: "42", author_id: "user1", created_at: "2024-01-03T00:00:00.000Z" }
      ]
    });
  };
  const service = new NewsService(
    { newsApi: { apiKey: "key" }, twitter: { bearerToken: "token" } },
    request,
    () => Date.parse("2024-01-04T00:00:00.000Z")
  );
  const articles = await service.forSymbols(["AAPL", "AAPL"], (symbol) => (symbol === "AAPL" ? "Apple" : ""));
  assert.equal(articles.length, 2);
  assert.equal(articles[0].source, "twitter");
  assert.equal(articles[1].source, "news");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.headers["X-Api-Key"], "key");
  assert.equal(requests[1].options.headers.Authorization, ["Bearer", "token"].join(" "));
});

test("quotes a bare symbol query when no name is available", async () => {
  let query;
  const request = async (url) => {
    query = new URL(url.toString()).searchParams.get("q");
    return jsonResponse({ articles: [] });
  };
  const service = new NewsService({ newsApi: { apiKey: "key" }, twitter: null }, request);
  await service.forSymbols(["AAPL"]);
  assert.equal(query, '"AAPL"');
});

test("caches results per symbol until the ttl expires", async () => {
  let calls = 0;
  const request = async () => {
    calls += 1;
    return jsonResponse({ articles: [{ title: `Headline ${calls}`, url: `https://example.com/${calls}`, publishedAt: "2024-01-01T00:00:00.000Z" }] });
  };
  let now = Date.parse("2024-01-01T00:00:00.000Z");
  const service = new NewsService({ newsApi: { apiKey: "key" }, twitter: null }, request, () => now);
  const first = await service.forSymbols(["AAPL"]);
  const second = await service.forSymbols(["AAPL"]);
  assert.equal(calls, 1);
  assert.deepEqual(first, second);
  now += 6 * 60 * 1000;
  const third = await service.forSymbols(["AAPL"]);
  assert.equal(calls, 2);
  assert.notDeepEqual(first, third);
});

test("ignores a provider that fails or returns a non-ok response", async () => {
  const request = async (url) => (new URL(url.toString()).hostname === "newsapi.org"
    ? jsonResponse({}, false, 500)
    : Promise.reject(new Error("network error")));
  const service = new NewsService({ newsApi: { apiKey: "key" }, twitter: { bearerToken: "token" } }, request);
  const articles = await service.forSymbols(["AAPL"]);
  assert.deepEqual(articles, []);
});

test("treats a missing articles or tweets list as empty", async () => {
  const request = async () => jsonResponse({});
  const service = new NewsService({ newsApi: { apiKey: "key" }, twitter: { bearerToken: "token" } }, request);
  assert.deepEqual(await service.forSymbols(["AAPL"]), []);
});

test("ignores a non-ok twitter response", async () => {
  const request = async () => jsonResponse({}, false, 503);
  const service = new NewsService({ newsApi: null, twitter: { bearerToken: "token" } }, request);
  assert.deepEqual(await service.forSymbols(["AAPL"]), []);
});

test("creates a news service wired to the environment", async () => {
  const service = createNewsService({ NEWSAPI_KEY: "key" }, async () => jsonResponse({ articles: [] }));
  assert.equal(service.isConfigured(), true);
  assert.deepEqual(await service.forSymbols(["AAPL"]), []);
});
