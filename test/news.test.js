import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNewsFeed,
  dedupeArticles,
  isArticle,
  normalizeArticle,
  sortByRecency,
  watchedSymbols
} from "../src/core/news.js";

test("lists watched symbols sorted alphabetically", () => {
  assert.deepEqual(watchedSymbols({ positions: { TSLA: {}, AAPL: {} } }), ["AAPL", "TSLA"]);
  assert.deepEqual(watchedSymbols({ positions: {} }), []);
  assert.deepEqual(watchedSymbols({}), []);
  assert.deepEqual(watchedSymbols(null), []);
});

test("validates article shape", () => {
  const article = {
    id: "news:https://example.com/a",
    title: "Apple unveils new product",
    url: "https://example.com/a",
    source: "news",
    symbol: "AAPL",
    publishedAt: new Date().toISOString()
  };
  assert.equal(isArticle(article), true);
  assert.equal(isArticle({ ...article, title: "" }), false);
  assert.equal(isArticle({ ...article, publishedAt: "not-a-date" }), false);
  assert.equal(isArticle(null), false);
  assert.equal(isArticle("nope"), false);
});

test("normalizes a raw provider article", () => {
  const article = normalizeArticle({
    title: "Tesla deliveries beat estimates",
    summary: "  Deliveries rose  ",
    url: "https://example.com/tesla",
    author: "Reporter",
    publishedAt: "2024-01-01T00:00:00.000Z"
  }, "TSLA", "news");
  assert.equal(article.id, "news:https://example.com/tesla");
  assert.equal(article.symbol, "TSLA");
  assert.equal(article.source, "news");
  assert.equal(article.summary, "Deliveries rose");
  assert.equal(article.publishedAt, "2024-01-01T00:00:00.000Z");
});

test("normalizes missing publishedAt to the current time", () => {
  const article = normalizeArticle({ title: "Headline", url: "https://example.com/x" }, "AAPL", "news");
  assert.equal(typeof article.publishedAt, "string");
  assert.equal(Number.isNaN(Date.parse(article.publishedAt)), false);
});

test("returns null for a raw article missing a title or url", () => {
  assert.equal(normalizeArticle({ title: "", url: "https://example.com/x" }, "AAPL", "news"), null);
  assert.equal(normalizeArticle({ title: "Headline", url: "" }, "AAPL", "news"), null);
  assert.equal(normalizeArticle(undefined, "AAPL", "news"), null);
});

test("rejects unsafe url schemes", () => {
  assert.equal(normalizeArticle({ title: "Headline", url: "javascript:alert(1)" }, "AAPL", "news"), null);
  assert.equal(normalizeArticle({ title: "Headline", url: "not a url" }, "AAPL", "news"), null);
  assert.equal(normalizeArticle({ title: "Headline", url: "http://example.com/x" }, "AAPL", "news")?.url, "http://example.com/x");
});
test("dedupes articles by id and drops invalid entries", () => {
  const base = {
    id: "news:https://example.com/a",
    title: "Apple unveils new product",
    url: "https://example.com/a",
    source: "news",
    symbol: "AAPL",
    publishedAt: "2024-01-01T00:00:00.000Z"
  };
  const unique = dedupeArticles([base, { ...base }, null, { ...base, title: "" }]);
  assert.equal(unique.length, 1);
});

test("sorts articles by most recent first without mutating the input", () => {
  const older = { publishedAt: "2024-01-01T00:00:00.000Z" };
  const newer = { publishedAt: "2024-02-01T00:00:00.000Z" };
  const input = [older, newer];
  const sorted = sortByRecency(input);
  assert.deepEqual(sorted, [newer, older]);
  assert.deepEqual(input, [older, newer]);
});

test("builds a deduped, sorted, limited news feed", () => {
  const older = {
    id: "news:https://example.com/older",
    title: "Older headline",
    url: "https://example.com/older",
    source: "news",
    symbol: "AAPL",
    publishedAt: "2024-01-01T00:00:00.000Z"
  };
  const newer = { ...older, id: "news:https://example.com/newer", url: "https://example.com/newer", publishedAt: "2024-02-01T00:00:00.000Z" };
  assert.deepEqual(buildNewsFeed([older, newer, { ...newer }], 1), [newer]);
  assert.deepEqual(buildNewsFeed([older, newer]), [newer, older]);
  assert.deepEqual(buildNewsFeed([older, newer], 0), []);
});
