const BANKING_FIXTURES = {
  connections: [{ connectionId: "conn-1", institutionId: "commerzbank", status: "linked" }],
  institutions: [
    { id: "commerzbank", name: "Commerzbank", country: "DE" },
    { id: "bank-of-ireland", name: "Bank of Ireland", country: "IE" },
    { id: "hdfc-bank", name: "HDFC Bank", country: "IN" }
  ],
  accounts: [{
    id: "acc-1",
    name: "Everyday account",
    bank: "Commerzbank",
    maskedIban: "DE••••3000",
    bic: "COBADEFFXXX",
    country: "DE",
    currency: "EUR",
    balance: 2500
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
      return json({ status: "pending", paymentId: "pay-1", instruction: { scheme: "SEPA" }, cash: 100_250.5 }, 202);
    }
    return json({ error: "Unexpected banking route." }, 404);
  });
}
