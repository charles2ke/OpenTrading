import { DATA_AS_OF, DATA_PROVIDER, DATA_SOURCE, securities } from "./core/research/dataset.js";
import { SCREENER_FIELDS, screen, toCsv } from "./core/research/screener.js";
import { runDcf, runScenarios, waccExitMultipleMatrix, waccTerminalGrowthMatrix } from "./core/research/dcf.js";
import { analyzeEarnings } from "./core/research/earnings.js";
import { analyzeTechnicals, tradePlan } from "./core/research/technicals.js";
import { analyzeQuantPatterns } from "./core/research/quant.js";
import { competitiveLandscape } from "./core/research/competition.js";
import { analyzeDividendPortfolio, dividendProfile, simulateDrip } from "./core/research/dividends.js";
import { buildPortfolio } from "./core/research/portfolio-builder.js";
import { analyzePortfolioRisk } from "./core/research/risk.js";
import { macroAnalysis } from "./core/research/macro.js";
import { companyHeader, defaultDcfAssumptions, searchSecurities } from "./core/research/workspace.js";
import { addToWatchlist, createWatchlist, evaluateAlerts, createAlert, watchlistView } from "./core/research/watchlists.js";
import { listReports, reportToCsv } from "./core/research/reports.js";
import { runResearch } from "./core/research/orchestrator.js";

const byId = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function number(value, digits = 2) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "n/a";
}

function table(caption, headers, rows) {
  return `<table class="research-table">
    <caption>${escapeHtml(caption)}</caption>
    <thead><tr>${headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
  </table>`;
}

function download(name, contents, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function initResearch() {
  const state = {
    symbol: "AAPL",
    assumptions: defaultDcfAssumptions("AAPL"),
    watchlist: createWatchlist("Research watchlist"),
    holdings: [{ symbol: "AAPL", quantity: 120 }, { symbol: "JNJ", quantity: 200 }, { symbol: "XOM", quantity: 150 }],
    reports: [],
    screenRows: []
  };

  byId("security").innerHTML = securities
    .map((security) => `<option value="${security.symbol}">${escapeHtml(`${security.symbol} · ${security.name} · ${security.exchange}`)}</option>`)
    .join("");
  byId("screener-sector").innerHTML = ['<option value="">All sectors</option>']
    .concat([...new Set(securities.map((security) => security.sector))]
      .map((sector) => `<option value="${escapeHtml(sector)}">${escapeHtml(sector)}</option>`))
    .join("");

  function renderHeader() {
    const header = companyHeader(state.symbol);
    byId("company-header").innerHTML = `
      <div><p class="eyebrow">${escapeHtml(`${header.sector} · ${header.industry}`)}</p>
      <h2>${escapeHtml(header.name)} (${escapeHtml(header.symbol)})</h2>
      <p>${escapeHtml(header.exchange)} · ${escapeHtml(header.currency)} ${number(header.price)}
      <span class="${header.changePercent >= 0 ? "positive" : "negative"}">${number(header.changePercent)}%</span></p></div>
      <p class="data-provenance">Data: ${escapeHtml(header.provenance.provider)} (${escapeHtml(header.provenance.source)}) ·
      as of ${escapeHtml(header.provenance.asOf)} · freshness ${escapeHtml(header.dataFreshness.label)}</p>`;
  }

  function renderOverview() {
    const research = runResearch(state.symbol, { assumptions: state.assumptions });
    byId("overview-narrative").innerHTML = research.interpretation.narrative
      .map((line) => `<li>${escapeHtml(line)}</li>`).join("");
    byId("overview-grounding").textContent =
      `Grounded on ${research.interpretation.grounding.fields.length} calculated fields from ${DATA_PROVIDER} (${DATA_SOURCE}) as of ${DATA_AS_OF}.` +
      (research.packet.unavailable.length > 0 ? ` Unavailable and not estimated: ${research.packet.unavailable.join(", ")}.` : "");
    state.lastResearch = research;
  }

  function renderScreener() {
    const filters = {};
    const sector = byId("screener-sector").value;
    if (sector) filters.sectors = [sector];
    const maxPe = Number(byId("screener-pe").value);
    if (Number.isFinite(maxPe) && maxPe > 0) filters.pe = { max: maxPe };
    const minGrowth = Number(byId("screener-growth").value);
    if (Number.isFinite(minGrowth) && byId("screener-growth").value !== "") filters.revenueGrowth = { min: minGrowth };
    const minYield = Number(byId("screener-yield").value);
    if (Number.isFinite(minYield) && byId("screener-yield").value !== "") filters.dividendYield = { min: minYield };
    const result = screen({ filters, sort: { field: byId("screener-sort").value, direction: "desc" } });
    state.screenRows = result.rows;
    byId("screener-summary").textContent = `${result.matched} of ${result.universeSize} securities match. Values come from structured financial data, not generated estimates.`;
    byId("screener-results").innerHTML = table(
      "Screener results",
      ["Symbol", "Name", "Sector", "Market cap ($m)", "P/E", "Revenue growth %", "ROIC %", "Dividend yield %"],
      result.rows.map((row) => [row.symbol, row.name, row.sector, number(row.marketCap, 0), number(row.pe), number(row.revenueGrowth), number(row.roic), number(row.dividendYield)])
    );
  }

  function readAssumptions() {
    const next = { ...state.assumptions };
    for (const input of document.querySelectorAll("#dcf-form input")) {
      const value = Number(input.value);
      if (Number.isFinite(value)) next[input.name] = value;
    }
    return next;
  }

  function renderValuation() {
    const result = runDcf(state.assumptions);
    if (!result.valid) {
      byId("dcf-output").innerHTML = `<p class="alert" role="alert">${escapeHtml(result.errors.join(" "))}</p>`;
      return;
    }
    const perpetuity = result.perpetuityGrowth;
    const sensitivity = waccTerminalGrowthMatrix(
      state.assumptions,
      [state.assumptions.wacc - 1, state.assumptions.wacc, state.assumptions.wacc + 1],
      [state.assumptions.terminalGrowth - 0.5, state.assumptions.terminalGrowth, state.assumptions.terminalGrowth + 0.5]
    );
    const exitMatrix = waccExitMultipleMatrix(
      state.assumptions,
      [state.assumptions.wacc - 1, state.assumptions.wacc, state.assumptions.wacc + 1],
      [state.assumptions.exitMultiple - 2, state.assumptions.exitMultiple, state.assumptions.exitMultiple + 2]
    );
    byId("dcf-output").innerHTML = `
      <p id="dcf-value">Implied value per share: <strong>${number(perpetuity.valuePerShare)}</strong> versus ${number(perpetuity.currentPrice)} today
      (<span class="${perpetuity.upsidePercent >= 0 ? "positive" : "negative"}">${number(perpetuity.upsidePercent, 1)}%</span>).</p>
      <p>Exit-multiple method: ${number(result.exitMultiple?.valuePerShare)} per share. Enterprise value ${number(perpetuity.enterpriseValue, 0)}, equity value ${number(perpetuity.equityValue, 0)}.</p>
      ${table("Five-year forecast", ["Year", "Revenue", "EBIT", "Taxes", "NOPAT", "D&A", "CapEx", "Working capital", "Unlevered FCF"],
        result.forecast.map((row) => [row.year, number(row.revenue, 0), number(row.ebit, 0), number(row.taxes, 0), number(row.nopat, 0), number(row.depreciation, 0), number(row.capex, 0), number(row.workingCapital, 0), number(row.freeCashFlow, 0)]))}
      ${table("Scenarios", ["Scenario", "Value per share", "Upside %"],
        runScenarios(state.assumptions).map((scenario) => [scenario.label, number(scenario.result.perpetuityGrowth?.valuePerShare), number(scenario.result.perpetuityGrowth?.upsidePercent, 1)]))}
      ${table("WACC × terminal growth", ["WACC %", ...sensitivity.columns.map((column) => `g ${number(column, 1)}%`)],
        sensitivity.values.map((row, index) => [number(sensitivity.rows[index], 1), ...row.map((value) => number(value))]))}
      ${table("WACC × exit multiple", ["WACC %", ...exitMatrix.columns.map((column) => `${number(column, 1)}x`)],
        exitMatrix.values.map((row, index) => [number(exitMatrix.rows[index], 1), ...row.map((value) => number(value))]))}`;
  }

  function renderEarnings() {
    const result = analyzeEarnings(state.symbol);
    if (!result.valid) {
      byId("earnings-output").innerHTML = `<p class="empty-state">${escapeHtml(result.errors.join(" "))}</p>`;
      return;
    }
    byId("earnings-output").innerHTML = `
      <p>Next reporting date: <strong>${escapeHtml(result.nextDate)}</strong>. Implied move: ${
        result.impliedMove.available === false ? "not available (no reliable options data)" : `${number(result.impliedMove.percent, 1)}%`}.</p>
      ${table("Last four quarters", ["Period", "Reported EPS", "Consensus EPS", "EPS surprise %", "Reported revenue", "Consensus revenue", "Revenue surprise %", "Price reaction %"],
        result.quarters.map((quarter) => [quarter.period, number(quarter.reportedEps), number(quarter.consensusEps), number(quarter.epsSurprisePercent, 1), number(quarter.reportedRevenue, 0), number(quarter.consensusRevenue, 0), number(quarter.revenueSurprisePercent, 1), number(quarter.priceReaction, 1)]))}
      ${table("Guidance versus consensus", ["Metric", "Low", "High", "Consensus", "Midpoint vs consensus"],
        result.guidance.map((item) => [item.metric, number(item.low, 1), number(item.high, 1), number(item.consensus, 1), number(item.versusConsensus, 1)]))}
      ${table("Company KPIs", ["KPI", "Value"], result.kpis.map((kpi) => [kpi.label, `${number(kpi.value, 1)} ${kpi.unit}`]))}
      ${table("Scenarios", ["Scenario", "Description", "Price change %", "Implied price"],
        result.scenarios.map((scenario) => [scenario.scenario, scenario.description, number(scenario.priceChangePercent, 1), number(scenario.impliedPrice)]))}`;
  }

  function renderTechnicals() {
    const result = analyzeTechnicals(state.symbol, { timeframe: byId("timeframe").value });
    const indicators = result.indicators;
    byId("technicals-output").innerHTML = `
      ${table("Indicators", ["Indicator", "Value"], [
        ["SMA 20", number(indicators.sma20)], ["SMA 50", number(indicators.sma50)], ["SMA 100", number(indicators.sma100)],
        ["SMA 200", number(indicators.sma200)], ["EMA 20", number(indicators.ema20)], ["RSI 14", number(indicators.rsi14, 1)],
        ["MACD histogram", number(indicators.macdResult?.histogram, 3)], ["Bollinger upper", number(indicators.bands?.upper)],
        ["Bollinger lower", number(indicators.bands?.lower)], ["ATR 14", number(indicators.atr14)],
        ["Average volume", number(indicators.volumeAverage, 0)], ["Support", number(indicators.levels.support)],
        ["Resistance", number(indicators.levels.resistance)], ["52-week range position %", number(indicators.range.positionPercent, 1)],
        ["Relative strength vs benchmark %", number(indicators.relativeStrength, 1)]
      ])}
      ${table("Signals", ["Signal", "Direction", "Detail", "Confidence"],
        result.signals.map((signal) => [signal.name, signal.direction, signal.detail, signal.confidence]))}
      ${table("Fibonacci retracement", ["Ratio", "Price"], result.fibonacci.map((level) => [level.ratio, number(level.price)]))}
      <p class="disclaimer">Technical signals describe probabilities observed in past prices; they are not forecasts.</p>`;
  }

  function renderTradePlan() {
    const plan = tradePlan({
      entry: Number(byId("trade-entry").value),
      stop: Number(byId("trade-stop").value),
      target: Number(byId("trade-target").value),
      capital: Number(byId("trade-capital").value)
    });
    byId("trade-output").textContent = plan.valid
      ? `Shares ${plan.shares}, risk ${number(plan.riskAmount)}, reward ${number(plan.rewardAmount)}, risk/reward ${number(plan.riskReward)} — hypothetical plan from your assumptions.`
      : plan.errors.join(" ");
  }

  function renderQuant() {
    const result = analyzeQuantPatterns(state.symbol);
    byId("quant-output").innerHTML = `
      <p>${result.observations} observations · annualised volatility ${number(result.annualizedVolatilityPercent, 1)}% ·
      max drawdown ${number(result.maxDrawdownPercent, 1)}% · win rate ${number(result.winRatePercent, 1)}%.</p>
      ${table("Monthly seasonality", ["Period", "Observations", "Mean %", "Median %", "Win rate %", "t-stat", "Significant"],
        result.seasonality.monthly.map((row) => [row.period, row.observations, number(row.meanPercent, 2), number(row.medianPercent, 2), number(row.winRatePercent, 0), number(row.tStatistic, 2), row.significant ? "yes" : "no"]))}
      ${table("Day-of-week returns", ["Period", "Observations", "Mean %", "Win rate %", "t-stat", "Significant"],
        result.seasonality.dayOfWeek.map((row) => [row.period, row.observations, number(row.meanPercent, 3), number(row.winRatePercent, 0), number(row.tStatistic, 2), row.significant ? "yes" : "no"]))}
      ${table("Earnings event study (T−5 → T+5)", ["Offset", "Average cumulative %"],
        result.events.earnings.average.map((row) => [row.offset, number(row.averageCumulativePercent, 2)]))}
      ${table("Additional datasets", ["Dataset", "Status"], Object.entries(result.alternativeData)
        .map(([key, value]) => [key, `unavailable — ${value.reason}`]))}
      <p class="disclaimer">${escapeHtml(result.caveat)}</p>`;
  }

  function renderCompetition() {
    const result = competitiveLandscape(state.symbol);
    const shareRows = Array.isArray(result.marketShare)
      ? table("Market share trend", ["Year", "Share %"], result.marketShare.map((entry) => [entry.year, number(entry.share, 1)]))
      : `<p class="empty-state">Market share: unavailable — ${escapeHtml(result.marketShare.reason)}. No figure has been invented.</p>`;
    byId("competition-output").innerHTML = `
      ${table("Peer comparison", ["Metric", result.symbol, ...result.peers],
        result.comparison.map((row) => [row.metric, number(row.company, 1), ...row.peers.map((peer) => number(peer.value, 1))]))}
      ${table("Competitive dimensions", ["Dimension", "Assessment", "Basis"],
        result.dimensions.map((dimension) => [dimension.dimension, dimension.assessment, dimension.note]))}
      ${shareRows}
      ${table("Risks and catalysts", ["Type", "Detail"], [
        ...result.risks.map((risk) => [risk.risk, risk.detail]),
        ...result.catalysts.map((catalyst) => [catalyst.catalyst, catalyst.detail])
      ])}`;
  }

  function renderDividends() {
    const profile = dividendProfile(state.symbol);
    const portfolio = analyzeDividendPortfolio(state.holdings);
    const profileHtml = profile.valid
      ? `${table("Dividend profile", ["Metric", "Value"], [
          ["Yield %", number(profile.yieldPercent)], ["Annual dividend", number(profile.annualDividend)],
          ["Payments per year", profile.frequency], ["Ex-dividend date", profile.exDate],
          ["Payout ratio %", number(profile.payoutRatioPercent, 1)], ["FCF payout ratio %", number(profile.fcfPayoutRatioPercent, 1)],
          ["Consecutive growth years", profile.consecutiveGrowthYears], ["3y CAGR %", number(profile.cagr.threeYear, 1)],
          ["5y CAGR %", number(profile.cagr.fiveYear, 1)], ["10y CAGR %", number(profile.cagr.tenYear, 1)],
          ["Last cut", profile.lastCutYear ?? "none recorded"], ["Debt/equity", number(profile.balanceSheet.debtToEquity)]
        ])}
        ${table(`Dividend safety: ${profile.safety.rating} (${profile.safety.score}/${profile.safety.maximum})`, ["Factor", "Value", "Points"],
          profile.safety.factors.map((factor) => [factor.factor, factor.value ?? "none", factor.points]))}`
      : `<p class="empty-state">${escapeHtml(profile.errors.join(" "))}</p>`;
    byId("dividend-output").innerHTML = `${profileHtml}
      ${table("Portfolio income", ["Metric", "Value"], [
        ["Weighted yield %", number(portfolio.weightedYieldPercent)],
        ["Estimated annual income", number(portfolio.annualIncome, 0)],
        ["Estimated quarterly income", number(portfolio.quarterlyIncome, 0)],
        ["Estimated monthly income", number(portfolio.monthlyIncome, 0)],
        ["Largest income share %", number(portfolio.incomeConcentrationPercent, 1)]
      ])}`;
  }

  function renderDrip() {
    const simulation = simulateDrip({
      initialInvestment: Number(byId("drip-initial").value),
      annualContribution: Number(byId("drip-contribution").value),
      startingYieldPercent: Number(byId("drip-yield").value),
      dividendGrowthPercent: Number(byId("drip-growth").value),
      priceGrowthPercent: Number(byId("drip-price").value),
      reinvest: byId("drip-reinvest").checked,
      years: 20
    });
    byId("drip-output").innerHTML = simulation.valid
      ? table("DRIP projection", ["Year", "Income", "Portfolio value", "Yield on cost %"],
        simulation.milestones.map((row) => [row.year, number(row.income, 0), number(row.value, 0), number(row.yieldOnCostPercent, 2)]))
      : `<p class="alert" role="alert">${escapeHtml(simulation.errors.join(" "))}</p>`;
  }

  function renderPortfolio() {
    const plan = buildPortfolio({
      investmentAmount: Number(byId("profile-amount").value),
      horizonYears: Number(byId("profile-horizon").value),
      riskTolerance: byId("profile-risk").value,
      incomeRequirementPercent: Number(byId("profile-income").value),
      liquidityRequirementPercent: Number(byId("profile-liquidity").value),
      accountType: byId("profile-account").value,
      monthlyContribution: Number(byId("profile-contribution").value)
    });
    byId("builder-output").innerHTML = plan.valid
      ? `<p>Benchmark: ${escapeHtml(plan.benchmark)} · expected return ${number(plan.statistics.expectedReturnPercent, 1)}% ·
        volatility ${number(plan.statistics.volatilityPercent, 1)}% · income ${number(plan.statistics.incomeYieldPercent, 1)}%.</p>
        ${table("Target allocation", ["Asset class", "ETF", "Target %", "Current %", "Target value", "Suggested trade"],
          plan.allocation.map((row) => [row.label, row.etf, number(row.targetPercent, 1), number(row.currentPercent, 1), number(row.targetValue, 0), number(row.tradeValue, 0)]))}
        ${table("Contribution allocation", ["Asset class", "Amount"], plan.contributions.map((row) => [row.id, number(row.amount, 0)]))}
        ${table("Rebalancing rules", ["Rule"], plan.rebalancingRules.map((rule) => [rule]))}
        ${table("Tax notes", ["Note"], plan.taxNotes.map((note) => [note]))}`
      : `<p class="alert" role="alert">${escapeHtml(plan.errors.join(" "))}</p>`;
  }

  function renderRisk() {
    const analysis = analyzePortfolioRisk(state.holdings);
    if (!analysis.valid) {
      byId("risk-output").innerHTML = `<p class="alert" role="alert">${escapeHtml(analysis.errors.join(" "))}</p>`;
      return;
    }
    byId("risk-output").innerHTML = `
      ${table("Risk metrics", ["Metric", "Value"], [
        ["Portfolio value", number(analysis.totalValue, 0)],
        ["Annualised volatility %", number(analysis.metrics.annualizedVolatilityPercent, 1)],
        ["Beta", number(analysis.metrics.beta)],
        ["Weighted beta", number(analysis.metrics.weightedBeta)],
        ["Max drawdown %", number(analysis.metrics.maxDrawdownPercent, 1)],
        ["Daily VaR 95 %", number(analysis.metrics.valueAtRisk95Percent, 2)],
        ["Expected shortfall 95 %", number(analysis.metrics.expectedShortfall95Percent, 2)],
        ["Interest-rate factor beta", number(analysis.interestRate.portfolioSensitivity)]
      ])}
      ${table("Exposures", ["Grouping", "Name", "Weight %"], [
        ...analysis.concentration.bySector.map((row) => ["Sector", row.name, number(row.weightPercent, 1)]),
        ...analysis.concentration.byRegion.map((row) => ["Region", row.name, number(row.weightPercent, 1)]),
        ...analysis.concentration.byCurrency.map((row) => ["Currency", row.name, number(row.weightPercent, 1)])
      ])}
      ${table("Correlation matrix", ["", ...analysis.correlations.symbols],
        analysis.correlations.values.map((row, index) => [analysis.correlations.symbols[index], ...row.map((value) => number(value))]))}
      ${table("Stress scenarios", ["Scenario", "Estimated impact %"],
        analysis.scenarios.map((scenario) => [scenario.label, number(scenario.estimatedImpactPercent, 1)]))}
      ${table("Risk heat map", ["Risk", "Exposure", "Severity", "Contributors", "Potential mitigation"],
        analysis.heatMap.map((row) => [row.risk, row.exposure, row.severity, row.contributors.join(", "), row.mitigation]))}
      <p class="disclaimer">Scenario estimates are illustrative, not guaranteed outcomes.</p>`;
  }

  function renderMacro() {
    const weights = analyzePortfolioRisk(state.holdings);
    const holdings = weights.valid
      ? weights.positions.map((position) => ({ symbol: position.symbol, weightPercent: position.weight * 100 }))
      : [];
    const analysis = macroAnalysis(holdings);
    byId("macro-output").innerHTML = `
      ${table("Observed macro data", ["Indicator", "Latest", "Change (1 period)", "Change (3 periods)"],
        analysis.dashboard.series.map((series) => [series.label, `${number(series.latest, 2)} ${series.unit}`, number(series.changeOnePeriod, 2), number(series.changeThreePeriods, 2)]))}
      <p>Yield-curve spread: ${number(analysis.dashboard.yieldCurveSpread, 2)} percentage points.</p>
      ${table("Macro calendar", ["Date", "Event", "Region"], analysis.dashboard.calendar.map((event) => [event.date, event.event, event.region]))}
      ${table("Macro-to-portfolio exposure", ["Factor", "Holding", "Mechanism", "Sensitivity"],
        analysis.exposures.map((row) => [row.factor, row.symbol, row.mechanism, number(row.sensitivity, 1)]))}
      ${table("Scenario impact", ["Scenario", "Estimated portfolio impact %"],
        analysis.scenarios.map((scenario) => [scenario.label, number(scenario.portfolioImpactPercent, 1)]))}
      <p class="disclaimer">${escapeHtml(analysis.dashboard.note)}</p>`;
  }

  function renderWatchlist() {
    const rows = watchlistView(state.watchlist);
    byId("watchlist-output").innerHTML = rows.length === 0
      ? '<p class="empty-state">No securities on this watchlist yet.</p>'
      : table("Watchlist", ["Symbol", "Name", "Price", "Change %", "Forward P/E", "Yield %", "Next earnings"],
        rows.map((row) => [row.symbol, row.name, number(row.price), number(row.changePercent, 2), number(row.forwardPe), number(row.dividendYieldPercent), row.nextEarnings ?? "n/a"]));
    const alerts = evaluateAlerts(
      state.watchlist.symbols.map((symbol) => createAlert({ type: "earnings", symbol })),
      { horizonDate: "2026-03-31" }
    );
    byId("alerts-output").innerHTML = table("Alerts", ["Alert", "Triggered"],
      alerts.map((alert) => [`${alert.type} · ${alert.symbol}`, alert.triggered ? "yes" : "no"]));
  }

  function renderReports() {
    byId("reports-output").innerHTML = state.reports.length === 0
      ? '<p class="empty-state">No saved reports yet.</p>'
      : table("Saved reports", ["Title", "Module", "Security", "Generated", "Data as of", "Calculation version"],
        listReports(state.reports).map((report) => [report.title, report.module, report.symbol ?? "Portfolio", report.createdAt, report.dataSnapshot.asOf, report.calculationVersion]));
  }

  function renderAll() {
    renderHeader();
    renderOverview();
    renderScreener();
    renderValuation();
    renderEarnings();
    renderTechnicals();
    renderQuant();
    renderCompetition();
    renderDividends();
    renderPortfolio();
    renderRisk();
    renderMacro();
    renderWatchlist();
    renderReports();
  }

  function showTab(id) {
    for (const panel of document.querySelectorAll(".research-panel")) panel.hidden = panel.id !== `panel-${id}`;
    for (const tab of document.querySelectorAll(".research-tab")) {
      const selected = tab.dataset.tab === id;
      tab.classList.toggle("active", selected);
      tab.setAttribute("aria-selected", String(selected));
    }
  }

  byId("security").addEventListener("change", (event) => {
    state.symbol = event.target.value;
    state.assumptions = defaultDcfAssumptions(state.symbol);
    for (const input of document.querySelectorAll("#dcf-form input")) {
      if (input.name in state.assumptions) input.value = state.assumptions[input.name];
    }
    renderAll();
  });
  byId("global-search").addEventListener("input", (event) => {
    const matches = searchSecurities(event.target.value);
    byId("search-results").innerHTML = matches
      .map((match) => `<button type="button" class="chip" data-symbol="${match.symbol}">${escapeHtml(`${match.symbol} · ${match.name}`)}</button>`)
      .join("");
  });
  byId("search-results").addEventListener("click", (event) => {
    const symbol = event.target.closest("[data-symbol]")?.dataset.symbol;
    if (!symbol) return;
    byId("security").value = symbol;
    byId("security").dispatchEvent(new Event("change"));
  });
  for (const tab of document.querySelectorAll(".research-tab")) {
    tab.addEventListener("click", () => showTab(tab.dataset.tab));
  }
  byId("dcf-form").addEventListener("submit", (event) => {
    event.preventDefault();
    state.assumptions = readAssumptions();
    renderValuation();
    renderOverview();
  });
  byId("screener-form").addEventListener("submit", (event) => {
    event.preventDefault();
    renderScreener();
  });
  byId("screener-export").addEventListener("click", () => download("screen.csv", toCsv(state.screenRows), "text/csv"));
  byId("screener-watch").addEventListener("click", () => {
    for (const row of state.screenRows) state.watchlist = addToWatchlist(state.watchlist, row.symbol);
    renderWatchlist();
    showTab("watchlists");
  });
  byId("timeframe").addEventListener("change", renderTechnicals);
  byId("trade-form").addEventListener("submit", (event) => {
    event.preventDefault();
    renderTradePlan();
  });
  byId("drip-form").addEventListener("submit", (event) => {
    event.preventDefault();
    renderDrip();
  });
  byId("profile-form").addEventListener("submit", (event) => {
    event.preventDefault();
    renderPortfolio();
  });
  byId("holdings-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const symbol = byId("holding-symbol").value.trim().toUpperCase();
    const quantity = Number(byId("holding-quantity").value);
    if (!securities.some((security) => security.symbol === symbol) || !Number.isFinite(quantity) || quantity <= 0) {
      byId("holdings-status").textContent = "Enter a supported ticker and a positive quantity.";
      return;
    }
    state.holdings = [...state.holdings.filter((holding) => holding.symbol !== symbol), { symbol, quantity }];
    byId("holdings-status").textContent = `${symbol} added to the analysed portfolio.`;
    renderRisk();
    renderMacro();
    renderDividends();
  });
  byId("save-report").addEventListener("click", () => {
    state.reports = [...state.reports, state.lastResearch.report];
    renderReports();
    showTab("reports");
  });
  byId("export-report").addEventListener("click", () => {
    const report = state.reports.at(-1) ?? state.lastResearch.report;
    download(`${report.symbol}-research.csv`, reportToCsv(report), "text/csv");
  });
  byId("print-report").addEventListener("click", () => window.print());

  byId("screener-sort").innerHTML = SCREENER_FIELDS
    .map((field) => `<option value="${field.key}">${escapeHtml(field.label)}</option>`)
    .join("");
  byId("screener-sort").value = "marketCap";
  for (const input of document.querySelectorAll("#dcf-form input")) {
    if (input.name in state.assumptions) input.value = state.assumptions[input.name];
  }
  renderAll();
  renderTradePlan();
  renderDrip();
  showTab("overview");
}
