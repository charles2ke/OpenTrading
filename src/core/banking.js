export const TRANSFER_LIMIT = 1_000_000;
export const TRANSFER_DIRECTIONS = Object.freeze(["deposit", "withdrawal"]);
export const SUPPORTED_TRANSFER_CURRENCIES = Object.freeze(["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD"]);

const IBAN_PATTERN = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/;
const BIC_PATTERN = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/;
const ZERO_DECIMAL_CURRENCIES = new Set(["JPY"]);
const SEPA_COUNTRIES = new Set([
  "AD", "AT", "BE", "BG", "CH", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GB", "GR", "HR", "HU", "IE",
  "IS", "IT", "LI", "LT", "LU", "LV", "MC", "MT", "NL", "NO", "PL", "PT", "RO", "SE", "SI", "SK", "SM", "VA"
]);

export function normalizeBankIdentifier(value) {
  return typeof value === "string" ? value.replace(/[\s-]/g, "").toUpperCase() : "";
}

function ibanChecksum(iban) {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const character of rearranged) {
    const value = character >= "A" && character <= "Z" ? character.charCodeAt(0) - 55 : Number(character);
    remainder = (remainder * (value > 9 ? 100 : 10) + value) % 97;
  }
  return remainder;
}

export function isValidIban(value) {
  const iban = normalizeBankIdentifier(value);
  return IBAN_PATTERN.test(iban) && ibanChecksum(iban) === 1;
}

export function isValidBic(value) {
  return BIC_PATTERN.test(normalizeBankIdentifier(value));
}

export function maskAccountIdentifier(value) {
  const identifier = normalizeBankIdentifier(value);
  if (identifier.length < 5) return "••••";
  return `${identifier.slice(0, 2)}••••${identifier.slice(-4)}`;
}

export function ibanCountry(value) {
  return normalizeBankIdentifier(value).slice(0, 2);
}

export function transferScheme(transfer) {
  const inSepaZone = SEPA_COUNTRIES.has(ibanCountry(transfer?.iban));
  return normalizeBankIdentifier(transfer?.currency) === "EUR" && inSepaZone ? "SEPA" : "SWIFT";
}

export function minorUnits(amount, currency) {
  const factor = ZERO_DECIMAL_CURRENCIES.has(normalizeBankIdentifier(currency)) ? 1 : 100;
  return Math.round(amount * factor);
}

export function isBankAccount(value) {
  return Boolean(value)
    && typeof value === "object"
    && typeof value.id === "string"
    && value.id.length > 0
    && typeof value.name === "string"
    && isValidIban(value.iban)
    && isValidBic(value.bic)
    && SUPPORTED_TRANSFER_CURRENCIES.includes(normalizeBankIdentifier(value.currency))
    && Number.isFinite(value.balance);
}

export function sanitizeBankAccount(account) {
  if (!isBankAccount(account)) throw new TypeError("Invalid bank account.");
  return Object.freeze({
    id: account.id.slice(0, 64),
    name: String(account.name).slice(0, 120),
    bank: String(account.bank ?? "").slice(0, 120),
    maskedIban: maskAccountIdentifier(account.iban),
    bic: normalizeBankIdentifier(account.bic),
    country: ibanCountry(account.iban),
    currency: normalizeBankIdentifier(account.currency),
    balance: Math.round(account.balance * 100) / 100
  });
}

export function validateTransfer(portfolio, transfer) {
  const amount = Number(transfer?.amount);
  if (!TRANSFER_DIRECTIONS.includes(transfer?.direction)) return "Choose deposit or withdrawal.";
  if (!Number.isFinite(amount) || amount <= 0) return "Enter an amount greater than zero.";
  if (Math.round(amount * 100) / 100 !== amount) return "Amounts support at most two decimal places.";
  if (amount > TRANSFER_LIMIT) return `Transfers are limited to ${TRANSFER_LIMIT.toLocaleString("en-US")} per instruction.`;
  if (!SUPPORTED_TRANSFER_CURRENCIES.includes(normalizeBankIdentifier(transfer?.currency))) return "Choose a supported ISO 4217 currency.";
  if (!isValidIban(transfer?.iban)) return "Enter a valid IBAN.";
  if (!isValidBic(transfer?.bic)) return "Enter a valid BIC (SWIFT) code.";
  if (transfer.direction === "withdrawal" && amount > portfolio.cash) return "This transfer exceeds your available cash.";
  return "";
}

export function buildPaymentInstruction(transfer, { messageId, endToEndId, createdAt } = {}) {
  const currency = normalizeBankIdentifier(transfer.currency);
  const iban = normalizeBankIdentifier(transfer.iban);
  return Object.freeze({
    standard: "ISO20022:pain.001.001.09",
    scheme: transferScheme(transfer),
    messageId: String(messageId ?? "").slice(0, 35),
    endToEndId: String(endToEndId ?? "").slice(0, 35),
    createdAt: (createdAt instanceof Date ? createdAt : new Date()).toISOString(),
    direction: transfer.direction,
    amount: {
      currency,
      value: Math.round(Number(transfer.amount) * 100) / 100,
      minorUnits: minorUnits(Number(transfer.amount), currency)
    },
    counterparty: Object.freeze({
      name: String(transfer.accountName ?? "Account holder").slice(0, 140),
      maskedIban: maskAccountIdentifier(iban),
      bic: normalizeBankIdentifier(transfer.bic),
      country: ibanCountry(iban)
    }),
    remittanceInformation: String(transfer.reference ?? "OpenTrading transfer").slice(0, 140),
    chargeBearer: "SLEV",
    strongCustomerAuthentication: "required"
  });
}

export function applyTransfer(portfolio, transfer) {
  const error = validateTransfer(portfolio, transfer);
  if (error) return { portfolio, error };
  const amount = Number(transfer.amount);
  const direction = transfer.direction === "deposit" ? 1 : -1;
  return {
    portfolio: {
      ...portfolio,
      cash: Math.round((portfolio.cash + direction * amount) * 100) / 100
    },
    error: ""
  };
}
