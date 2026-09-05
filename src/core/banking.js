export const TRANSFER_LIMIT = 1_000_000;
export const TRANSFER_DIRECTIONS = Object.freeze(["deposit", "withdrawal"]);
export const SUPPORTED_TRANSFER_CURRENCIES = Object.freeze(["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "INR"]);
export const RTGS_MINIMUM_INR = 200_000;

const IBAN_PATTERN = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/;
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const INDIAN_ACCOUNT_PATTERN = /^[0-9]{9,18}$/;
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

export function isValidIfsc(value) {
  return IFSC_PATTERN.test(normalizeBankIdentifier(value));
}

export function isValidIndianAccountNumber(value) {
  return INDIAN_ACCOUNT_PATTERN.test(normalizeBankIdentifier(value));
}

export function isDomesticIndiaTransfer(transfer) {
  return normalizeBankIdentifier(transfer?.currency) === "INR" || isValidIfsc(transfer?.ifsc);
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
  if (isDomesticIndiaTransfer(transfer)) return Number(transfer?.amount) >= RTGS_MINIMUM_INR ? "RTGS" : "IMPS";
  const inSepaZone = SEPA_COUNTRIES.has(ibanCountry(transfer?.iban));
  return normalizeBankIdentifier(transfer?.currency) === "EUR" && inSepaZone ? "SEPA" : "SWIFT";
}

export function minorUnits(amount, currency) {
  const factor = ZERO_DECIMAL_CURRENCIES.has(normalizeBankIdentifier(currency)) ? 1 : 100;
  return Math.round(amount * factor);
}

function minorUnitFactor(currency) {
  return ZERO_DECIMAL_CURRENCIES.has(normalizeBankIdentifier(currency)) ? 1 : 100;
}

function hasIndianAccountDetails(value) {
  return isValidIfsc(value?.ifsc)
    && isValidIndianAccountNumber(value?.accountNumber)
    && normalizeBankIdentifier(value?.currency) === "INR";
}

export function isBankAccount(value) {
  return Boolean(value)
    && typeof value === "object"
    && typeof value.id === "string"
    && value.id.length > 0
    && typeof value.name === "string"
    && (hasIndianAccountDetails(value) || (isValidIban(value.iban) && isValidBic(value.bic)))
    && SUPPORTED_TRANSFER_CURRENCIES.includes(normalizeBankIdentifier(value.currency))
    && Number.isFinite(value.balance);
}

export function sanitizeBankAccount(account) {
  if (!isBankAccount(account)) throw new TypeError("Invalid bank account.");
  const domestic = hasIndianAccountDetails(account);
  return Object.freeze({
    id: account.id.slice(0, 64),
    name: String(account.name).slice(0, 120),
    bank: String(account.bank ?? "").slice(0, 120),
    maskedAccount: maskAccountIdentifier(domestic ? account.accountNumber : account.iban),
    bic: isValidBic(account.bic) ? normalizeBankIdentifier(account.bic) : "",
    routingCode: domestic ? normalizeBankIdentifier(account.ifsc) : "",
    country: domestic ? "IN" : ibanCountry(account.iban),
    currency: normalizeBankIdentifier(account.currency),
    balance: Math.round(account.balance * 100) / 100
  });
}

export function validateTransfer(portfolio, transfer) {
  const amount = Number(transfer?.amount);
  const currency = normalizeBankIdentifier(transfer?.currency);
  const factor = minorUnitFactor(currency);
  if (!TRANSFER_DIRECTIONS.includes(transfer?.direction)) return "Choose deposit or withdrawal.";
  if (!Number.isFinite(amount) || amount <= 0) return "Enter an amount greater than zero.";
  if (Math.round(amount * factor) / factor !== amount) return factor === 1
    ? "Amounts for this currency must be whole numbers."
    : "Amounts support at most two decimal places.";
  if (amount > TRANSFER_LIMIT) return `Transfers are limited to ${TRANSFER_LIMIT.toLocaleString("en-US")} per instruction.`;
  if (!SUPPORTED_TRANSFER_CURRENCIES.includes(currency)) return "Choose a supported ISO 4217 currency.";
  if (isDomesticIndiaTransfer(transfer)) {
    if (currency !== "INR") return "Indian bank transfers must be sent in INR.";
    if (!isValidIfsc(transfer?.ifsc)) return "Enter a valid IFSC code.";
    if (!isValidIndianAccountNumber(transfer?.accountNumber)) return "Enter a valid Indian bank account number.";
  } else {
    if (!isValidIban(transfer?.iban)) return "Enter a valid IBAN.";
    if (!isValidBic(transfer?.bic)) return "Enter a valid BIC (SWIFT) code.";
  }
  if (transfer.direction === "withdrawal" && amount > portfolio.cash) return "This transfer exceeds your available cash.";
  return "";
}

export function buildPaymentInstruction(transfer, { messageId, endToEndId, createdAt } = {}) {
  const currency = normalizeBankIdentifier(transfer.currency);
  const domestic = isDomesticIndiaTransfer(transfer);
  const iban = normalizeBankIdentifier(domestic ? transfer.accountNumber : transfer.iban);
  const amountMinorUnits = minorUnits(Number(transfer.amount), currency);
  return Object.freeze({
    standard: "ISO20022:pain.001.001.09",
    scheme: transferScheme(transfer),
    messageId: String(messageId ?? "").slice(0, 35),
    endToEndId: String(endToEndId ?? "").slice(0, 35),
    createdAt: (createdAt instanceof Date ? createdAt : new Date()).toISOString(),
    direction: transfer.direction,
    amount: {
      currency,
      value: amountMinorUnits / minorUnitFactor(currency),
      minorUnits: amountMinorUnits
    },
    counterparty: Object.freeze({
      name: String(transfer.accountName ?? "Account holder").slice(0, 140),
      maskedAccount: maskAccountIdentifier(iban),
      bic: domestic ? "" : normalizeBankIdentifier(transfer.bic),
      routingCode: domestic ? normalizeBankIdentifier(transfer.ifsc) : "",
      country: domestic ? "IN" : ibanCountry(iban)
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
