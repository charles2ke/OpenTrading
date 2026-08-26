export function watchedSymbols(portfolio) {
  return Object.keys(portfolio?.positions ?? {}).sort();
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isSafeUrl(value) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function isArticle(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    normalizeText(value.id) &&
    normalizeText(value.title) &&
    normalizeText(value.url) &&
    normalizeText(value.source) &&
    normalizeText(value.symbol) &&
    !Number.isNaN(Date.parse(value.publishedAt))
  );
}

export function normalizeArticle(raw, symbol, source) {
  const title = normalizeText(raw?.title);
  const url = normalizeText(raw?.url);
  const publishedAt = new Date(raw?.publishedAt ?? Date.now()).toISOString();
  if (!title || !url || !isSafeUrl(url)) return null;
  return {
    id: `${source}:${url}`,
    title,
    summary: normalizeText(raw?.summary),
    url,
    source,
    author: normalizeText(raw?.author),
    symbol,
    publishedAt
  };
}

export function dedupeArticles(articles) {
  const seen = new Set();
  const unique = [];
  for (const article of articles) {
    if (!isArticle(article) || seen.has(article.id)) continue;
    seen.add(article.id);
    unique.push(article);
  }
  return unique;
}

export function sortByRecency(articles) {
  return [...articles].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

export function buildNewsFeed(articles, limit = 30) {
  return sortByRecency(dedupeArticles(articles)).slice(0, Math.max(0, limit));
}
