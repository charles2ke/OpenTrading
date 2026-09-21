import { securityBySymbol } from "./dataset.js";

export const DEFAULT_BENCHMARK = "S&P 500";

export function createResearchPortfolio({ name, cash = 0, benchmark = DEFAULT_BENCHMARK, currency = "USD" } = {}) {
  const label = String(name ?? "").trim();
  if (label === "") throw new TypeError("A portfolio needs a name.");
  if (!Number.isFinite(cash) || cash < 0) throw new TypeError("Cash must be zero or more.");
  return { id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: label, currency, cash, benchmark, positions: {}, transactions: [] };
}

export function recordTransaction(portfolio, transaction) {
  const security = securityBySymbol(transaction?.symbol);
  const quantity = Number(transaction?.quantity);
  const price = Number(transaction?.price);
  const fees = Number.isFinite(transaction?.fees) ? transaction.fees : 0;
  if (!security) return { portfolio, error: "Unknown security." };
  if (!Number.isFinite(quantity) || quantity <= 0) return { portfolio, error: "Quantity must be positive." };
  if (!Number.isFinite(price) || price <= 0) return { portfolio, error: "Price must be positive." };
  if (transaction.side !== "buy" && transaction.side !== "sell") return { portfolio, error: "Side must be buy or sell." };

  const existing = portfolio.positions[security.symbol] ?? { quantity: 0, costBasis: 0 };
  if (transaction.side === "sell" && quantity > existing.quantity) return { portfolio, error: "You cannot sell more than you hold." };
  const gross = quantity * price;
  const positions = { ...portfolio.positions };
  if (transaction.side === "buy") {
    positions[security.symbol] = { quantity: existing.quantity + quantity, costBasis: existing.costBasis + gross + fees };
  } else {
    const remaining = existing.quantity - quantity;
    const averageCost = existing.costBasis / existing.quantity;
    if (remaining === 0) delete positions[security.symbol];
    else positions[security.symbol] = { quantity: remaining, costBasis: averageCost * remaining };
  }
  return {
    portfolio: {
      ...portfolio,
      cash: portfolio.cash + (transaction.side === "buy" ? -(gross + fees) : gross - fees),
      positions,
      transactions: [...portfolio.transactions, { ...transaction, symbol: security.symbol, quantity, price, fees }]
    },
    error: ""
  };
}

export function summarizeResearchPortfolio(portfolio) {
  const positions = Object.entries(portfolio.positions).map(([symbol, position]) => {
    const security = securityBySymbol(symbol);
    const marketValue = security.price * position.quantity;
    return {
      symbol,
      name: security.name,
      sector: security.sector,
      quantity: position.quantity,
      costBasis: position.costBasis,
      averageCost: position.costBasis / position.quantity,
      marketValue,
      unrealizedGain: marketValue - position.costBasis,
      unrealizedGainPercent: (marketValue / position.costBasis - 1) * 100
    };
  });
  const holdingsValue = positions.reduce((total, position) => total + position.marketValue, 0);
  const investedCost = positions.reduce((total, position) => total + position.costBasis, 0);
  return {
    name: portfolio.name,
    benchmark: portfolio.benchmark,
    cash: portfolio.cash,
    positions: positions.sort((left, right) => right.marketValue - left.marketValue),
    holdingsValue,
    totalValue: holdingsValue + portfolio.cash,
    unrealizedGain: holdingsValue - investedCost,
    unrealizedGainPercent: investedCost === 0 ? 0 : (holdingsValue / investedCost - 1) * 100,
    weights: positions.map((position) => ({
      symbol: position.symbol,
      weightPercent: holdingsValue === 0 ? 0 : (position.marketValue / holdingsValue) * 100
    }))
  };
}

export function holdingsForRisk(portfolio) {
  return Object.entries(portfolio.positions).map(([symbol, position]) => ({ symbol, quantity: position.quantity }));
}
