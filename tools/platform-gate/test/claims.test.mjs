import test from "node:test";
import assert from "node:assert/strict";
import { auditBlocks, evaluateClaim, extractClaims, domainConfig, sha256, TIERS } from "../claims.mjs";
import { readFileSync } from "node:fs";
const cfgAll = JSON.parse(readFileSync(new URL("../config/domains.json", import.meta.url)));
const now = new Date("2026-10-22T12:00:00Z");
const B = (text, x = {}) => ({ text, links: [], cites: [], footnotes: [], attrs: {}, ownPriceTexts: [], page: "https://ex.com/", pagePath: "/", host: "ex.com", ...x });
const cfg = domainConfig(cfgAll, "ex.com");

test("uncited figure fails", async () => {
  const [c] = await auditBlocks([B("Households waste 9,400 gallons of water a year.")], cfg, { now });
  assert.ok(c); assert.deepEqual(c.defects, ["uncited"]);
});
test("percent, $ and GPU counts are claims", () => {
  for (const t of ["Bills rose 12% last year", "The average bill is $72", "We run 512 GPUs"]) assert.ok(extractClaims(B(t), cfg).length, t);
});
test("external link, cite, footnote, data-source all count as citation", async () => {
  for (const x of [{ links: ["https://epa.gov/x"] }, { cites: ["EPA 2024"] }, { footnotes: ["#fn1"] }, { attrs: { "data-source": "https://epa.gov" } }]) {
    const r = await auditBlocks([B("Leaks waste 10,000 gallons a year.", x)], cfg, { now }); assert.deepEqual(r[0].defects, [], JSON.stringify(x));
  }
});
test("same-site link is not a citation", async () => {
  const r = await auditBlocks([B("Save 30% today", { links: ["https://ex.com/about"] })], cfg, { now }); assert.deepEqual(r[0].defects, ["uncited"]);
});
test("allowlist: dates, phone, zip, UI step numbers, copyright", () => {
  for (const t of ["Updated Oct 12, 2026", "Call (404) 555-1234", "Zip code 30301", "Step 2 of 5", "Question 3/10", "© 2026 Ex Inc", "Published 2025", "1471 Ralph David Abernathy Blvd", "About 2 minutes", "Dues 2026"]) assert.equal(extractClaims(B(t), cfg).length, 0, t);
});
test("own prices exempt anywhere: inside own buy link and per-domain ownPrices", async () => {
  assert.equal(extractClaims(B("Get the guide — $29", { ownPriceTexts: ["Get the guide — $29"] }), cfg).length, 0);
  const ws = domainConfig(cfgAll, "watershortcut.com");
  assert.equal(extractClaims(B("Full pack $29, instant download"), ws).length, 0);
  assert.ok(extractClaims(B("Full pack $29, instant download"), cfg).length, "not exempt on other domains");
  assert.ok(extractClaims(B("Fixing a leak saves $120 a year. Guide $29"), ws).length, "factual $ still needs a source");
});
test("status, ranking, legal claims detected", () => {
  assert.equal(extractClaims(B("Our service is live in Atlanta")).filter((c) => c.kind === "status").length, 1);
  assert.ok(extractClaims(B("The largest fleet in Georgia")).some((c) => c.kind === "ranking"));
  assert.ok(extractClaims(B("Landlords are required by law to fix leaks")).some((c) => c.kind === "law"));
});
const good = { has_source: true, source_url: "https://src.example/a", as_of: "2026-10-20", recheck_by: "2026-10-26", tier: "status" };
test("metadata: complete fresh claim passes", async () => assert.deepEqual(await evaluateClaim({}, good, { now, requireMetadata: true }), []));
test("metadata: missing fields fail", async () => {
  const d = await evaluateClaim({}, { has_source: true, source_url: "https://s" }, { now, requireMetadata: true });
  assert.deepEqual(d, ["missing as_of", "missing recheck_by", "missing tier"]);
});
test("seeded expired 7-day claim blocks", async () => {
  const d = await evaluateClaim({}, { ...good, as_of: "2026-10-01", recheck_by: "2026-10-08" }, { now, requireMetadata: true });
  assert.ok(d.some((x) => /is past/.test(x)), d.join());
});
test("recheck_by beyond tier max blocks", async () => {
  assert.equal(TIERS.status, 7); assert.equal(TIERS.price, 30); assert.equal(TIERS.law, 180); assert.equal(TIERS.constant, 365);
  const d = await evaluateClaim({}, { ...good, recheck_by: "2026-11-30" }, { now, requireMetadata: true }); assert.ok(d.some((x) => /exceeds status max 7d/.test(x)));
  assert.deepEqual(await evaluateClaim({}, { ...good, tier: "law", recheck_by: "2027-04-01" }, { now, requireMetadata: true }), []);
});
test("seeded changed-source claim blocks (mocked fetch)", async () => {
  const fetchSource = async () => "Average household uses 82 gallons per day (2026 revision).";
  const q = await evaluateClaim({}, { ...good, source_quote: "uses 88 gallons per day" }, { now, fetchSource, requireMetadata: true });
  assert.ok(q.includes("source quote no longer in source"));
  const h = await evaluateClaim({}, { ...good, source_hash: sha256("old text") }, { now, fetchSource, requireMetadata: true });
  assert.ok(h.includes("source hash changed"));
  assert.deepEqual(await evaluateClaim({}, { ...good, source_quote: "uses 82 gallons per day" }, { now, fetchSource, requireMetadata: true }), []);
});
test("data-* markup metadata flows through auditBlocks with requireMetadata", async () => {
  const attrs = { "data-source": "https://epa.gov", "data-as-of": "2026-09-01", "data-recheck-by": "2026-10-01", "data-tier": "price" };
  const [c] = await auditBlocks([B("Water costs $0.01 per gallon", { attrs })], cfg, { now, requireMetadata: true });
  assert.ok(c.defects.some((x) => /is past/.test(x))); assert.equal(c.tier_suggested, "price"); assert.ok(c.escalation.includes("money"));
});
test("claims JSON per page supplies metadata", async () => {
  const claimsJson = { claims: [{ match: "82 gallons", ...good, tier: "constant", recheck_by: "2027-06-01" }] };
  const [c] = await auditBlocks([B("A household uses 82 gallons a day")], cfg, { now, requireMetadata: true, claimsJson });
  assert.deepEqual(c.defects, []);
});
test("escalation classes", async () => {
  const [c] = await auditBlocks([B("In memory of the 1,200 victims of the attack")], cfg, { now });
  assert.ok(c.escalation.includes("memorial") && c.tier_suggested === "memorial");
});
test("link to own portfolio domain is NOT a citation (MLL H100 -> riskfreetrial credits)", async () => {
  const mll = domainConfig(cfgAll, "machinelearninglogistics.com");
  assert.ok(mll.portfolioDomains.includes("riskfreetrial.org") && mll.portfolioDomains.includes("growth.business"));
  const b = B("H100 list prices across clouds: $2.00–$6.16 per GPU-hour", { host: "machinelearninglogistics.com", links: ["https://riskfreetrial.org/credits"], attrs: { "data-source": "https://www.riskfreetrial.org/credits" } });
  const r = await auditBlocks([b], mll, { now });
  assert.ok(r.length && r.every((c) => c.defects.includes("uncited")), JSON.stringify(r.map((c) => c.defects)));
  const ok = await auditBlocks([{ ...b, links: ["https://cloud.google.com/compute/gpus-pricing"], attrs: {} }], mll, { now });
  assert.ok(ok.every((c) => !c.defects.includes("uncited")));
});
test("ownPrices match across whitespace/linebreaks (quizbiz earn terms, riskfreetrial refund cap)", () => {
  const qb = domainConfig(cfgAll, "quizbiz.org");
  assert.equal(extractClaims(B("$1\nearn for excellent feedback   $30 daily\n earn budget"), qb).filter((c) => /\$/.test(c.match)).length, 0);
  assert.equal(extractClaims(B("Eligible refunds within 30 days up to\n$59 when feedback is provided"), domainConfig(cfgAll, "riskfreetrial.org")).length, 0);
});
test("demo blocks ([data-demo] / .example-data) are skipped", async () => {
  assert.equal((await auditBlocks([B("DUES COLLECTED $4,180 71% on auto-renew", { demo: true })], cfg, { now })).length, 0);
  const src = readFileSync(new URL("../extract-blocks.js", import.meta.url), "utf8");
  assert.ok(src.includes("[data-demo]") && src.includes(".example-data"));
});
test("quizbiz own earn terms exempt but $10/$1.5 factual figures are not", () => {
  const qb = domainConfig(cfgAll, "quizbiz.org");
  assert.equal(extractClaims(B("$1 for excellent flow feedback on 3 funded domains. $30/day budget."), qb).filter((c) => /\$/.test(c.match)).length, 0);
  assert.ok(extractClaims(B("Average CAC is $10 per lead"), qb).some((c) => c.match.startsWith("$10")));
});
test("MLL own pack prices ($49/$199/$599, 2,000 credits) exempt on MLL only; factual GPU $ still needs a source", () => {
  const mll = domainConfig(cfgAll, "machinelearninglogistics.com");
  assert.equal(extractClaims(B("Starter $49 · Team $199 · Scale $599 — Starter pack includes 2,000 credits"), mll).length, 0);
  assert.ok(extractClaims(B("Starter $49 · Team $199 · Scale $599"), cfg).length, "not exempt on other domains");
  assert.ok(extractClaims(B("H100 rents for $2.49 per GPU-hour"), mll).length, "factual price still a claim");
  assert.ok(extractClaims(B("Enterprise $4,990 per month"), mll).length, "$49 must not exempt $4,990");
});
test("MLL pack line with parenthesized counts exempt only in pack context", () => {
  const mll = domainConfig(cfgAll, "machinelearninglogistics.com");
  assert.equal(extractClaims(B("4. See credit packs BUDGET — Starter $49 (100 credits), Desk $199 (500), Terminal $599 (2,000). Prices do not change here."), mll).length, 0);
  assert.equal(extractClaims(B("Starter $49\n(100 credits), Desk $199  (500), Terminal\n$599 (2,000)."), mll).length, 0);
  assert.ok(extractClaims(B("We indexed 2,000 GPUs across 6 clouds"), mll).some((c) => c.match.includes("2,000")), "bare 2,000 still a claim");
  assert.ok(extractClaims(B("Demand rose (2,000) units this quarter"), mll).some((c) => c.match.includes("2,000")), "(2,000) outside pack context still a claim");
});
test("communityinternet own offer 'packs 30% off' exempt on communityinternet only; factual % still a claim", () => {
  const ci = domainConfig(cfgAll, "communityinternet.co");
  assert.equal(extractClaims(B("Credits refill monthly · packs 30% off"), ci).length, 0);
  assert.equal(extractClaims(B("$29/mo — packs 30% off"), ci).length, 0);
  assert.ok(extractClaims(B("Credits refill monthly · packs 30% off"), cfg).length, "not exempt on other domains");
  assert.ok(extractClaims(B("Broadband prices rose 30% last year"), ci).length, "factual 30% still a claim");
});
