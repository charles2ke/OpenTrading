export const STARTING_CASH = 100_000;

export const instruments = Object.freeze([
  { symbol: "AAPL", name: "Apple", exchange: "NASDAQ", country: "US", price: 232.14, previousClose: 228.76 },
  { symbol: "MSFT", name: "Microsoft", exchange: "NASDAQ", country: "US", price: 418.79, previousClose: 420.43 },
  { symbol: "TSLA", name: "Tesla", exchange: "NASDAQ", country: "US", price: 351.62, previousClose: 342.11 },
  { symbol: "7203", name: "Toyota Motor", exchange: "TSE", country: "JP", price: 18.42, previousClose: 18.19 },
  { symbol: "SAP", name: "SAP", exchange: "XETRA", country: "DE", price: 271.24, previousClose: 267.8 },
  { symbol: "HSBA", name: "HSBC", exchange: "LSE", country: "GB", price: 13.76, previousClose: 13.59 }
]);

export const indices = Object.freeze([
  { name: "S&P 500", code: "SPX", flag: "🇺🇸", value: 6481.4, change: 0.72 },
  { name: "FTSE 100", code: "UKX", flag: "🇬🇧", value: 9312.05, change: 0.31 },
  { name: "Nikkei 225", code: "NKY", flag: "🇯🇵", value: 42520.27, change: -0.46 },
  { name: "DAX", code: "DAX", flag: "🇩🇪", value: 24309.62, change: 0.58 }
]);

export function createPortfolio() {
  return { cash: STARTING_CASH, positions: {} };
}

export function getInstrument(symbol) {
  return instruments.find((instrument) => instrument.symbol === symbol);
}

export function validateOrder(portfolio, order) {
  const instrument = getInstrument(order.symbol);
  const quantity = Number(order.quantity);
  if (!instrument) return "Select a supported stock.";
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10_000) return "Shares must be a whole number between 1 and 10,000.";
  if (order.side !== "buy" && order.side !== "sell") return "Choose buy or sell.";
  const currentShares = portfolio.positions[order.symbol]?.quantity ?? 0;
  if (order.side === "buy" && instrument.price * quantity > portfolio.cash) return "This order exceeds your available cash.";
  if (order.side === "sell" && quantity > currentShares) return "You cannot sell more shares than you own.";
  return "";
}

export function executeOrder(portfolio, order) {
  const error = validateOrder(portfolio, order);
  if (error) return { portfolio, error };

  const quantity = Number(order.quantity);
  const instrument = getInstrument(order.symbol);
  const existing = portfolio.positions[order.symbol] ?? { quantity: 0, averagePrice: 0 };
  const direction = order.side === "buy" ? 1 : -1;
  const nextQuantity = existing.quantity + direction * quantity;
  const nextPositions = { ...portfolio.positions };

  if (nextQuantity === 0) {
    delete nextPositions[order.symbol];
  } else {
    nextPositions[order.symbol] = {
      quantity: nextQuantity,
      averagePrice: order.side === "buy"
        ? ((existing.averagePrice * existing.quantity) + (instrument.price * quantity)) / nextQuantity
        : existing.averagePrice
    };
  }

  return {
    portfolio: {
      cash: portfolio.cash - direction * instrument.price * quantity,
      positions: nextPositions
    },
    error: ""
  };
}

export function summarizePortfolio(portfolio) {
  const positions = Object.entries(portfolio.positions).map(([symbol, position]) => {
    const instrument = getInstrument(symbol);
    const value = instrument.price * position.quantity;
    const returnValue = (instrument.price - position.averagePrice) * position.quantity;
    return { ...instrument, ...position, value, returnValue };
  });
  const holdingsValue = positions.reduce((total, position) => total + position.value, 0);
  return {
    cash: portfolio.cash,
    positions,
    portfolioValue: portfolio.cash + holdingsValue,
    dailyChange: positions.reduce(
      (total, position) => total + (position.price - position.previousClose) * position.quantity,
      0
    )
  };
}

export function isPortfolio(value) {
  if (!value || typeof value !== "object" || !Number.isFinite(value.cash) || value.cash < 0) return false;
  if (!value.positions || typeof value.positions !== "object" || Array.isArray(value.positions)) return false;
  return Object.entries(value.positions).every(([symbol, position]) =>
    Boolean(getInstrument(symbol)) &&
    Number.isSafeInteger(position?.quantity) &&
    position.quantity > 0 &&
    Number.isFinite(position.averagePrice) &&
    position.averagePrice > 0
  );
}
