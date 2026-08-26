import { buildNewsFeed, normalizeArticle } from "../core/news.js";

const CACHE_TTL_MS = 5 * 60 * 1000;

export function newsProviderSettings(environment) {
  return {
    newsApi: environment.NEWSAPI_KEY ? { apiKey: environment.NEWSAPI_KEY } : null,
    twitter: environment.TWITTER_BEARER_TOKEN ? { bearerToken: environment.TWITTER_BEARER_TOKEN } : null
  };
}

function sanitizeQueryTerm(value) {
  return value.replace(/["\\]/g, "").trim();
}

async function fetchNewsApiArticles(symbol, name, settings, request) {
  const safeSymbol = sanitizeQueryTerm(symbol);
  const safeName = sanitizeQueryTerm(name);
  const url = new URL("https://newsapi.org/v2/everything");
  url.searchParams.set("q", safeName ? `"${safeSymbol}" OR "${safeName}"` : `"${safeSymbol}"`);
  url.searchParams.set("sortBy", "publishedAt");
  url.searchParams.set("pageSize", "10");
  url.searchParams.set("language", "en");
  const response = await request(url.href, { headers: { "X-Api-Key": settings.apiKey } });
  if (!response.ok) throw new Error(`NewsAPI request failed with status ${response.status}.`);
  const payload = await response.json();
  return (payload.articles ?? []).map((article) => normalizeArticle({
    title: article.title,
    summary: article.description,
    url: article.url,
    author: article.author,
    publishedAt: article.publishedAt
  }, symbol, "news"));
}

async function fetchTwitterArticles(symbol, name, settings, request) {
  const url = new URL("https://api.twitter.com/2/tweets/search/recent");
  url.searchParams.set("query", `${sanitizeQueryTerm(symbol)} lang:en -is:retweet`);
  url.searchParams.set("max_results", "10");
  url.searchParams.set("tweet.fields", "created_at,author_id");
  const response = await request(url.href, { headers: { Authorization: "Bearer " + settings.bearerToken } });
  if (!response.ok) throw new Error(`Twitter request failed with status ${response.status}.`);
  const payload = await response.json();
  return (payload.data ?? []).map((tweet) => normalizeArticle({
    title: tweet.text,
    url: `https://twitter.com/i/web/status/${tweet.id}`,
    author: tweet.author_id,
    publishedAt: tweet.created_at
  }, symbol, "twitter"));
}

export class NewsService {
  constructor(providers, request = fetch, now = () => Date.now()) {
    this.providers = providers;
    this.request = request;
    this.now = now;
    this.cache = new Map();
  }

  isConfigured() {
    return Boolean(this.providers.newsApi || this.providers.twitter);
  }

  async fetchSymbol(symbol, name = "") {
    const cached = this.cache.get(symbol);
    if (cached && cached.expiresAt > this.now()) return cached.articles;

    const tasks = [];
    if (this.providers.newsApi) tasks.push(fetchNewsApiArticles(symbol, name, this.providers.newsApi, this.request));
    if (this.providers.twitter) tasks.push(fetchTwitterArticles(symbol, name, this.providers.twitter, this.request));

    const results = await Promise.allSettled(tasks);
    const articles = buildNewsFeed(results.filter((result) => result.status === "fulfilled").flatMap((result) => result.value));
    this.cache.set(symbol, { articles, expiresAt: this.now() + CACHE_TTL_MS });
    return articles;
  }

  async forSymbols(symbols, nameForSymbol = () => "") {
    if (!this.isConfigured()) throw new Error("News feed is not configured.");
    const uniqueSymbols = [...new Set(symbols)];
    const perSymbol = await Promise.all(uniqueSymbols.map((symbol) => this.fetchSymbol(symbol, nameForSymbol(symbol))));
    return buildNewsFeed(perSymbol.flat());
  }
}

export function createNewsService(environment, request = fetch, now = () => Date.now()) {
  return new NewsService(newsProviderSettings(environment), request, now);
}
