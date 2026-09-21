export function mean(values) {
  if (!values || values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function median(values) {
  if (!values || values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function standardDeviation(values) {
  if (!values || values.length < 2) return null;
  const average = mean(values);
  const variance = values.reduce((total, value) => total + (value - average) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function percentile(values, level) {
  if (!values || values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = Math.min(sorted.length - 1, Math.max(0, Math.round(level * (sorted.length - 1))));
  return sorted[position];
}

export function simpleReturns(closes) {
  if (!closes || closes.length < 2) return [];
  return closes.slice(1).map((close, index) => close / closes[index] - 1);
}

export function covariance(left, right) {
  const length = Math.min(left.length, right.length);
  if (length < 2) return null;
  const leftMean = mean(left.slice(0, length));
  const rightMean = mean(right.slice(0, length));
  let total = 0;
  for (let index = 0; index < length; index += 1) {
    total += (left[index] - leftMean) * (right[index] - rightMean);
  }
  return total / (length - 1);
}

export function correlation(left, right) {
  const covariances = covariance(left, right);
  const leftDeviation = standardDeviation(left);
  const rightDeviation = standardDeviation(right);
  if (covariances === null || !leftDeviation || !rightDeviation) return null;
  return covariances / (leftDeviation * rightDeviation);
}

export function beta(assetReturns, benchmarkReturns) {
  const covariances = covariance(assetReturns, benchmarkReturns);
  const variance = standardDeviation(benchmarkReturns);
  if (covariances === null || !variance) return null;
  return covariances / variance ** 2;
}

export function maxDrawdown(closes) {
  if (!closes || closes.length < 2) return null;
  let peak = closes[0];
  let worst = 0;
  for (const close of closes) {
    if (close > peak) peak = close;
    worst = Math.min(worst, close / peak - 1);
  }
  return worst;
}

export function autocorrelation(values, lag = 1) {
  if (!values || values.length <= lag + 1) return null;
  return correlation(values.slice(lag), values.slice(0, values.length - lag));
}

export function tStatistic(values) {
  const deviation = standardDeviation(values);
  if (deviation === null || deviation === 0) return null;
  return mean(values) / (deviation / Math.sqrt(values.length));
}

export function isSignificant(tStat, observations) {
  if (tStat === null || observations < 3) return false;
  return Math.abs(tStat) >= 1.96;
}

export function winRate(values) {
  if (!values || values.length === 0) return null;
  return values.filter((value) => value > 0).length / values.length;
}
