import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPETITIVE_DIMENSIONS,
  COMPARISON_METRICS,
  competitiveLandscape,
  marketShareTrend,
  peerSet
} from "../src/core/research/competition.js";
import { fundamentals, securities } from "../src/core/research/dataset.js";

const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !== ${expected}`);

test("exports the supported comparison metrics and dimensions", () => {
  assert.equal(COMPARISON_METRICS.length, 9);
  assert.deepEqual(COMPARISON_METRICS[0], { key: "marketCap", label: "Market cap", unit: "$m" });
  assert.deepEqual(COMPETITIVE_DIMENSIONS, [
    "Brand",
    "Cost position",
    "Switching costs",
    "Network effects",
    "Scale",
    "Distribution",
    "Intellectual property",
    "Regulation",
    "Ecosystem"
  ]);
});

test("finds peer sets from same-industry and explicit peer data", () => {
  assert.deepEqual(peerSet("MSFT"), ["SAP", "AAPL", "NVDA"]);
  assert.deepEqual(peerSet("MSFT", 1), ["SAP"]);
  assert.deepEqual(peerSet("unknown"), []);
});

test("returns market-share trends or unavailable provenance", () => {
  assert.deepEqual(marketShareTrend("MSFT"), [
    { year: 2023, share: 23.1 },
    { year: 2024, share: 24.4 },
    { year: 2025, share: 25.6 }
  ]);
  const missing = marketShareTrend("AAPL");
  assert.equal(missing.available, false);
  assert.equal(missing.field, "marketShare");
  assert.equal(marketShareTrend("bad").reason, "no reliable market-share series available");
});

test("builds a competitive landscape with comparisons, advantages, risks, and catalysts", () => {
  const defaultLandscape = competitiveLandscape("MSFT");
  assert.deepEqual(defaultLandscape.peers, ["SAP", "AAPL", "NVDA"]);

  const landscape = competitiveLandscape("MSFT", { peers: ["SAP", "AAPL"] });
  assert.equal(landscape.valid, true);
  assert.equal(landscape.symbol, "MSFT");
  assert.equal(landscape.industry, "Software");
  assert.deepEqual(landscape.peers, ["SAP", "AAPL"]);
  assert.deepEqual(landscape.comparison[0], {
    metric: "Market cap",
    key: "marketCap",
    unit: "$m",
    company: 3_110_000,
    peers: [{ symbol: "SAP", value: 316_000 }, { symbol: "AAPL", value: 3_510_000 }]
  });
  const byDimension = Object.fromEntries(landscape.dimensions.map((dimension) => [dimension.dimension, dimension]));
  assert.equal(byDimension.Brand.assessment, "advantaged");
  assert.equal(byDimension["Cost position"].assessment, "advantaged");
  assert.equal(byDimension.Regulation.assessment, "unknown");
  assert.equal(byDimension.Regulation.evidence, null);
  closeTo(byDimension.Ecosystem.evidence.company, (78_600 / 281_700) * 100);
  closeTo(landscape.innovation.rAndDIntensityPercent, (31_800 / 281_700) * 100);
  assert.equal(landscape.innovation.source, "reported R&D expense / revenue");
  assert.deepEqual(landscape.capitalAllocation, {
    dividendYieldPercent: 0.78,
    payoutRatioPercent: 24.8,
    freeCashFlow: 78_600,
    source: "reported fundamentals"
  });
  assert.match(landscape.risks[0].detail, /Forward P\/E of 27.8x versus a peer average of 31.8x\./);
  assert.match(landscape.catalysts[1].detail, /44.6%/);
});

test("handles requested-peer filtering, unknown evidence, and missing innovation data", () => {
  assert.deepEqual(competitiveLandscape("bad"), { valid: false, errors: ["Unknown security."] });

  const noPeers = competitiveLandscape("AAPL", { peers: ["bad"] });
  assert.deepEqual(noPeers.peers, []);
  assert.equal(noPeers.dimensions.find((dimension) => dimension.dimension === "Brand").assessment, "unknown");

  const bank = competitiveLandscape("JPM", { peers: ["HSBA"] });
  assert.equal(bank.innovation.field, "innovation");
  assert.equal(bank.innovation.available, false);
  const bankDimensions = Object.fromEntries(bank.dimensions.map((dimension) => [dimension.dimension, dimension]));
  assert.equal(bankDimensions["Cost position"].assessment, "unknown");
  assert.equal(bankDimensions.Brand.assessment, "in line");

  const tesla = competitiveLandscape("TSLA", { peers: ["7203"] });
  const dimensions = Object.fromEntries(tesla.dimensions.map((dimension) => [dimension.dimension, dimension]));
  assert.equal(dimensions.Brand.assessment, "disadvantaged");
  assert.equal(dimensions["Network effects"].assessment, "advantaged");
});

test("covers edge cases for peer fallback, zero averages, and zero revenue", () => {
  const msft = securities.find((security) => security.symbol === "MSFT");
  const originalPeers = msft.peers;
  msft.peers = undefined;
  try {
    assert.deepEqual(peerSet("MSFT"), ["SAP"]);
  } finally {
    msft.peers = originalPeers;
  }

  const apple = fundamentals.AAPL;
  const sap = fundamentals.SAP;
  const originalAppleRevenue = apple.revenue;
  const originalAppleOperatingMargin = apple.operatingMargin;
  const originalSapOperatingMargin = sap.operatingMargin;
  const originalSapForwardPe = sap.forwardPe;
  apple.revenue = 0;
  apple.operatingMargin = 10;
  sap.operatingMargin = 0;
  sap.forwardPe = null;
  try {
    const landscape = competitiveLandscape("AAPL", { peers: ["SAP"] });
    const dimensions = Object.fromEntries(landscape.dimensions.map((dimension) => [dimension.dimension, dimension]));
    assert.equal(landscape.comparison.find((item) => item.key === "fcfMargin").company, null);
    assert.equal(dimensions.Brand.assessment, "unknown");
    assert.deepEqual(dimensions.Brand.evidence, { field: "operatingMargin", company: 10, peerAverage: 0 });
    assert.equal(landscape.innovation.rAndDIntensityPercent, Infinity);
    assert.match(landscape.risks[0].detail, /peer average of 0.0x/);
  } finally {
    apple.revenue = originalAppleRevenue;
    apple.operatingMargin = originalAppleOperatingMargin;
    sap.operatingMargin = originalSapOperatingMargin;
    sap.forwardPe = originalSapForwardPe;
  }
});
