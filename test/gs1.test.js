const assert = require('assert');
const { parse, gs1Date } = require('../gs1.js');
const GS = '\x1d';

// DataMatrix with FNC1 separators
let r = parse(']d2' + '0100312345678906' + '17280531' + '10ABC123' + GS + '21SN99');
assert.strictEqual(r.gtin, '00312345678906');
assert.strictEqual(r.expiry, '2028-05-31');
assert.strictEqual(r.lot, 'ABC123');
assert.strictEqual(r.serial, 'SN99');

// Human-readable parenthesized form
r = parse('(01)00312345678906(17)270200(10)LOT-7');
assert.strictEqual(r.expiry, '2027-02-28');
assert.strictEqual(r.lot, 'LOT-7');

// Lot at end with no separator
r = parse('010031234567890617261231' + '10XYZ');
assert.strictEqual(r.expiry, '2026-12-31');
assert.strictEqual(r.lot, 'XYZ');

// Plain UPC/EAN is not GS1
assert.strictEqual(parse('012345678905'), null);
assert.strictEqual(parse('5012345678900'), null);
assert.strictEqual(parse('hello'), null);

assert.strictEqual(gs1Date('241300'), null);
assert.strictEqual(gs1Date('280229'), '2028-02-29');
console.log('gs1 tests passed');
