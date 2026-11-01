import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { billingProviderLeaks } from "../billing-provider.mjs";
import { domainConfig } from "../claims.mjs";
const cfg = domainConfig(JSON.parse(readFileSync(new URL("../config/domains.json", import.meta.url))), "earn.wiki");
// Fixtures: visible text as a browser's innerText would return it (attributes never present).
const FAIL = "Part of growth.business · Operated by QuizBiz LLC · Legal at quizbiz.org · Credits & billing via riskfreetrial";
// <a href="https://www.riskfreetrial.org/credits?domain=earn.wiki">Manage credits & billing</a> -> innerText:
const PASS = "Part of growth.business · Operated by QuizBiz LLC · Legal at quizbiz.org · Manage credits & billing";
test("portfolio list includes riskfreetrial.org", () => assert.ok(cfg.portfolioDomains.includes("riskfreetrial.org")));
test("fails on visible 'billing via riskfreetrial'", () => { const r = billingProviderLeaks(FAIL, cfg.portfolioDomains); assert.equal(r.length, 1); assert.match(r[0].match, /via riskfreetrial/i); });
test("fails on 'credits by riskfreetrial.org'", () => assert.ok(billingProviderLeaks("Buy credits by riskfreetrial.org today", cfg.portfolioDomains).length));
test("passes: href to riskfreetrial.org with neutral link text", () => assert.deepEqual(billingProviderLeaks(PASS, cfg.portfolioDomains), []));
test("passes: neutral copy mentioning billing without a provider", () => assert.deepEqual(billingProviderLeaks("Billing questions? Contact support.", cfg.portfolioDomains), []));
test("fails on 'Billed via the portfolio credits hub (riskfreetrial)'", () => assert.equal(billingProviderLeaks("Billed via the portfolio credits hub (riskfreetrial)", cfg.portfolioDomains).length, 1));
test("fails on 'billed through ... riskfreetrial.org'", () => assert.ok(billingProviderLeaks("You are billed through our partner riskfreetrial.org", cfg.portfolioDomains).length));
test("passes: 'Billed securely through our credits page'", () => assert.deepEqual(billingProviderLeaks("Billed securely through our credits page", cfg.portfolioDomains), []));
