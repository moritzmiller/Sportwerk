import assert from "node:assert/strict";
import { test } from "node:test";

import { assertCentAmount, assertCurrency, createMoneySnapshot } from "../src/lib/erich/money.js";

test("ERICH money accepts integer cent amounts only", () => {
    assert.equal(assertCentAmount(4000), 4000);
    assert.equal(assertCentAmount(0), 0);
    assert.throws(() => assertCentAmount(40.5), /integer cent amount/);
    assert.throws(() => assertCentAmount("4000"), /integer cent amount/);
    assert.throws(() => assertCentAmount(-1), /must not be negative/);
});

test("ERICH money snapshots keep explicit currency", () => {
    assert.deepEqual(createMoneySnapshot({ amountCents: 1275 }), {
        amountCents: 1275,
        currency: "EUR",
    });

    assert.equal(assertCurrency("EUR"), "EUR");
    assert.throws(() => assertCurrency("eur"), /three-letter ISO/);
    assert.throws(() => assertCurrency("EURO"), /three-letter ISO/);
});
