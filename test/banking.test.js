import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTransfer,
  buildPaymentInstruction,
  ibanCountry,
  isBankAccount,
  isDomesticIndiaTransfer,
  isValidBic,
  isValidIban,
  isValidIfsc,
  isValidIndianAccountNumber,
  maskAccountIdentifier,
  minorUnits,
  normalizeBankIdentifier,
  RTGS_MINIMUM_INR,
  sanitizeBankAccount,
  SUPPORTED_TRANSFER_CURRENCIES,
  TRANSFER_LIMIT,
  transferScheme,
  validateTransfer
} from "../src/core/banking.js";

const IBAN = "DE89 3704 0044 0532 0130 00";
const BIC = "COBADEFFXXX";

function account(overrides = {}) {
  return { id: "acc-1", name: "Everyday account", bank: "Commerzbank", iban: IBAN, bic: BIC, currency: "eur", balance: 1234.567, ...overrides };
}

function transfer(overrides = {}) {
  return { direction: "deposit", amount: 250.5, currency: "EUR", iban: IBAN, bic: BIC, accountName: "Ada Lovelace", ...overrides };
}

test("normalizes bank identifiers", () => {
  assert.equal(normalizeBankIdentifier(" de89-3704 "), "DE893704");
  assert.equal(normalizeBankIdentifier(42), "");
});

test("validates IBANs with the mod-97 checksum", () => {
  assert.equal(isValidIban(IBAN), true);
  assert.equal(isValidIban("GB82WEST12345698765432"), true);
  assert.equal(isValidIban("DE89370400440532013001"), false);
  assert.equal(isValidIban("DE89"), false);
  assert.equal(isValidIban(null), false);
});

test("validates BIC codes", () => {
  assert.equal(isValidBic("COBADEFF"), true);
  assert.equal(isValidBic(BIC), true);
  assert.equal(isValidBic("COBA1EFF"), false);
});

test("masks account identifiers", () => {
  assert.equal(maskAccountIdentifier(IBAN), "DE••••3000");
  assert.equal(maskAccountIdentifier("DE89"), "••••");
});

test("derives the IBAN country and settlement scheme", () => {
  assert.equal(ibanCountry(IBAN), "DE");
  assert.equal(transferScheme(transfer()), "SEPA");
  assert.equal(transferScheme(transfer({ currency: "USD" })), "SWIFT");
  assert.equal(transferScheme(transfer({ iban: "TR330006100519786457841326" })), "SWIFT");
  assert.equal(transferScheme(undefined), "SWIFT");
});

test("converts amounts to ISO 4217 minor units", () => {
  assert.equal(minorUnits(12.34, "EUR"), 1234);
  assert.equal(minorUnits(1200, "JPY"), 1200);
});

test("recognizes and sanitizes bank accounts", () => {
  assert.equal(isBankAccount(account()), true);
  assert.equal(isBankAccount(null), false);
  assert.equal(isBankAccount({ ...account(), id: "" }), false);
  assert.equal(isBankAccount({ ...account(), name: 5 }), false);
  assert.equal(isBankAccount({ ...account(), iban: "invalid" }), false);
  assert.equal(isBankAccount({ ...account(), bic: "nope" }), false);
  assert.equal(isBankAccount({ ...account(), currency: "XXX" }), false);
  assert.equal(isBankAccount({ ...account(), balance: "1" }), false);

  const sanitized = sanitizeBankAccount(account());
  assert.deepEqual(sanitized, {
    id: "acc-1",
    name: "Everyday account",
    bank: "Commerzbank",
    maskedAccount: "DE••••3000",
    bic: BIC,
    routingCode: "",
    country: "DE",
    currency: "EUR",
    balance: 1234.57
  });
  assert.equal(Object.isFrozen(sanitized), true);
  assert.equal(sanitizeBankAccount({ ...account(), bank: undefined }).bank, "");
  assert.throws(() => sanitizeBankAccount({}), TypeError);
});

test("validates transfers against the portfolio and payment standards", () => {
  const portfolio = { cash: 1000, positions: {} };
  assert.equal(validateTransfer(portfolio, transfer()), "");
  assert.equal(validateTransfer(portfolio, transfer({ direction: "gift" })), "Choose deposit or withdrawal.");
  assert.equal(validateTransfer(portfolio, transfer({ amount: 0 })), "Enter an amount greater than zero.");
  assert.equal(validateTransfer(portfolio, transfer({ amount: "abc" })), "Enter an amount greater than zero.");
  assert.equal(validateTransfer(portfolio, transfer({ amount: 10.005 })), "Amounts support at most two decimal places.");
  assert.equal(validateTransfer(portfolio, transfer({ currency: "JPY", amount: 10.5 })), "Amounts for this currency must be whole numbers.");
  assert.equal(validateTransfer(portfolio, transfer({ amount: TRANSFER_LIMIT + 1 })), "Transfers are limited to 1,000,000 per instruction.");
  assert.equal(validateTransfer(portfolio, transfer({ currency: "XYZ" })), "Choose a supported ISO 4217 currency.");
  assert.equal(validateTransfer(portfolio, transfer({ iban: "DE00" })), "Enter a valid IBAN.");
  assert.equal(validateTransfer(portfolio, transfer({ bic: "SHORT" })), "Enter a valid BIC (SWIFT) code.");
  assert.equal(validateTransfer(portfolio, transfer({ direction: "withdrawal", amount: 5000 })), "This transfer exceeds your available cash.");
  assert.equal(validateTransfer(portfolio, transfer({ direction: "withdrawal", amount: 500 })), "");
  assert.equal(SUPPORTED_TRANSFER_CURRENCIES.includes("USD"), true);
});

test("builds an ISO 20022 payment instruction", () => {
  const createdAt = new Date("2026-01-02T03:04:05.000Z");
  const instruction = buildPaymentInstruction(transfer({ reference: "Funding" }), { messageId: "msg-1", endToEndId: "e2e-1", createdAt });
  assert.equal(instruction.standard, "ISO20022:pain.001.001.09");
  assert.equal(instruction.scheme, "SEPA");
  assert.equal(instruction.messageId, "msg-1");
  assert.equal(instruction.endToEndId, "e2e-1");
  assert.equal(instruction.createdAt, createdAt.toISOString());
  assert.deepEqual(instruction.amount, { currency: "EUR", value: 250.5, minorUnits: 25_050 });
  assert.deepEqual(instruction.counterparty, { name: "Ada Lovelace", maskedAccount: "DE••••3000", bic: BIC, routingCode: "", country: "DE" });
  assert.equal(instruction.remittanceInformation, "Funding");
  assert.equal(instruction.chargeBearer, "SLEV");
  assert.equal(instruction.strongCustomerAuthentication, "required");
  assert.equal(Object.isFrozen(instruction), true);

  const defaults = buildPaymentInstruction(transfer({ accountName: undefined }));
  assert.equal(defaults.counterparty.name, "Account holder");
  assert.equal(defaults.remittanceInformation, "OpenTrading transfer");
  assert.equal(defaults.messageId, "");
  assert.equal(Number.isNaN(Date.parse(defaults.createdAt)), false);

  const jpyInstruction = buildPaymentInstruction(transfer({ currency: "JPY", amount: 250 }));
  assert.deepEqual(jpyInstruction.amount, { currency: "JPY", value: 250, minorUnits: 250 });
});

test("applies valid transfers to the portfolio cash balance", () => {
  const portfolio = { cash: 1000, positions: {} };
  const deposit = applyTransfer(portfolio, transfer({ amount: 100.25 }));
  assert.equal(deposit.error, "");
  assert.equal(deposit.portfolio.cash, 1100.25);
  const withdrawal = applyTransfer(portfolio, transfer({ direction: "withdrawal", amount: 100.25 }));
  assert.equal(withdrawal.portfolio.cash, 899.75);
  const rejected = applyTransfer(portfolio, transfer({ amount: -5 }));
  assert.equal(rejected.error, "Enter an amount greater than zero.");
  assert.equal(rejected.portfolio, portfolio);
});

const IFSC = "HDFC0001234";
const INDIAN_ACCOUNT = "50100123456789";

function indianTransfer(overrides = {}) {
  return { direction: "deposit", amount: 5000, currency: "INR", ifsc: IFSC, accountNumber: INDIAN_ACCOUNT, accountName: "Asha Rao", ...overrides };
}

test("validates IFSC codes and Indian account numbers", () => {
  assert.equal(isValidIfsc("hdfc0001234"), true);
  assert.equal(isValidIfsc("ICIC0000123"), true);
  assert.equal(isValidIfsc("HDFC1001234"), false);
  assert.equal(isValidIfsc(null), false);
  assert.equal(isValidIndianAccountNumber(INDIAN_ACCOUNT), true);
  assert.equal(isValidIndianAccountNumber("12345"), false);
  assert.equal(isDomesticIndiaTransfer(indianTransfer()), true);
  assert.equal(isDomesticIndiaTransfer({ ifsc: IFSC }), true);
  assert.equal(isDomesticIndiaTransfer(transfer()), false);
});

test("routes Indian rupee payments over IMPS or RTGS", () => {
  assert.equal(transferScheme(indianTransfer()), "IMPS");
  assert.equal(transferScheme(indianTransfer({ amount: RTGS_MINIMUM_INR })), "RTGS");
  assert.equal(SUPPORTED_TRANSFER_CURRENCIES.includes("INR"), true);
});

test("sanitizes Indian bank accounts", () => {
  const domestic = sanitizeBankAccount({ id: "acc-2", name: "Savings", bank: "HDFC Bank", ifsc: IFSC, accountNumber: INDIAN_ACCOUNT, currency: "INR", balance: 4200 });
  assert.deepEqual(domestic, {
    id: "acc-2",
    name: "Savings",
    bank: "HDFC Bank",
    maskedAccount: "50••••6789",
    bic: "",
    routingCode: IFSC,
    country: "IN",
    currency: "INR",
    balance: 4200
  });
  assert.equal(isBankAccount({ id: "acc-3", name: "Savings", ifsc: IFSC, accountNumber: "123", currency: "INR", balance: 1 }), false);
  assert.equal(isBankAccount({ id: "acc-4", name: "Savings", ifsc: IFSC, accountNumber: INDIAN_ACCOUNT, currency: "USD", balance: 1 }), false);
});

test("validates Indian domestic transfers", () => {
  const portfolio = { cash: 100000, positions: {} };
  assert.equal(validateTransfer(portfolio, indianTransfer()), "");
  assert.equal(validateTransfer(portfolio, indianTransfer({ currency: "USD" })), "Indian bank transfers must be sent in INR.");
  assert.equal(validateTransfer(portfolio, indianTransfer({ ifsc: "HDFC1001234" })), "Enter a valid IFSC code.");
  assert.equal(validateTransfer(portfolio, indianTransfer({ accountNumber: "12" })), "Enter a valid Indian bank account number.");
});

test("builds an Indian domestic payment instruction", () => {
  const instruction = buildPaymentInstruction(indianTransfer({ amount: 250_000 }));
  assert.equal(instruction.scheme, "RTGS");
  assert.deepEqual(instruction.counterparty, {
    name: "Asha Rao",
    maskedAccount: "50••••6789",
    bic: "",
    routingCode: IFSC,
    country: "IN"
  });
  assert.deepEqual(instruction.amount, { currency: "INR", value: 250_000, minorUnits: 25_000_000 });
});
