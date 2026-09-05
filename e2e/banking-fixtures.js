const BANKING_FIXTURES = {
  connections: [{ connectionId: "conn-1", institutionId: "commerzbank", status: "linked" }],
  institutions: [
    { id: "commerzbank", name: "Commerzbank", country: "DE" },
    { id: "icici-bank", name: "ICICI Bank", country: "IN" },
    { id: "hdfc-bank", name: "HDFC Bank", country: "IN" },
    { id: "state-bank-of-india", name: "State Bank of India", country: "IN" },
    { id: "aib", name: "Allied Irish Banks (AIB)", country: "IE" },
    { id: "bank-of-ireland", name: "Bank of Ireland", country: "IE" },
    { id: "abn-amro", name: "ABN AMRO", country: "NL" }
  ],
  accounts: [{
    id: "acc-1",
    name: "Everyday account",
    bank: "Commerzbank",
    maskedIban: "DE••••3000",
    bic: "COBADEFFXXX",
    routingCode: "",
    country: "DE",
    currency: "EUR",
    balance: 2500
  }, {
    id: "acc-2",
    name: "Savings account",
    bank: "HDFC Bank",
    maskedIban: "50••••6789",
    bic: "",
    routingCode: "HDFC0001234",
    country: "IN",
    currency: "INR",
    balance: 42000
  }]
};

export async function stubBanking(page) {
  await page.route((url) => url.pathname.includes("/api/banking"), async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname.endsWith("/institutions")) {
      const country = url.searchParams.get("country") || "";
      return json({
        institutions: BANKING_FIXTURES.institutions.filter((institution) => !country || institution.country === country)
      });
    }
    if (url.pathname.endsWith("/accounts")) return json({ accounts: BANKING_FIXTURES.accounts });
    if (url.pathname.endsWith("/connections") && method === "POST") {
      return json({ id: "conn-1", status: "pending", consentUrl: "", institutionId: "commerzbank" }, 201);
    }
    if (url.pathname.endsWith("/connections")) return json({ connections: BANKING_FIXTURES.connections });
    if (url.pathname.endsWith("/transfers")) {
      const body = JSON.parse(route.request().postData() || "{}");
      const scheme = body.transfer?.currency === "INR" ? "IMPS" : "SEPA";
      return json({ status: "pending", paymentId: "pay-1", instruction: { scheme }, cash: 100_250.5 }, 202);
    }
    return json({ error: "Unexpected banking route." }, 404);
  });
}

const BROKER_SUMMARY = {
  broker: "trading212",
  currency: "GBP",
  cash: 1500.25,
  holdingsValue: 220,
  accountValue: 1720.25,
  returnValue: 20,
  positions: [{ symbol: "AAPL_US_EQ", quantity: 2, averagePrice: 100, price: 110, value: 220, returnValue: 20 }]
};

export async function stubBrokerage(page) {
  await page.route((url) => url.pathname.includes("/api/broker"), (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(BROKER_SUMMARY)
  }));
}
