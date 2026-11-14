const assert = require('assert');
const { extract } = require('../dates.js');
const best = (t, o) => (extract(t, o)[0] || {}).date;

assert.strictEqual(best('EXP 2027-05-31'), '2027-05-31');
assert.strictEqual(best('EXP: 2027-05'), '2027-05-31');
assert.strictEqual(best('EXP 05/2027'), '2027-05-31');
assert.strictEqual(best('Use by 02/28'), '2028-02-29');
assert.strictEqual(best('EXP 31/05/2027'), '2027-05-31');
assert.strictEqual(best('EXP 03/04/2027', { dayFirst: true }), '2027-04-03');
assert.strictEqual(best('EXP 03/04/2027', { dayFirst: false }), '2027-03-04');
assert.strictEqual(best('EXP 05/31/2027', { dayFirst: true }), '2027-05-31'); // unambiguous
assert.strictEqual(best('EXP MAY 2027'), '2027-05-31');
assert.strictEqual(best('EXP 15 MAY 2027'), '2027-05-15');
assert.strictEqual(best('EXP 15-MAY-27'), '2027-05-15');
assert.strictEqual(best('2027 MAY'), '2027-05-31');
assert.strictEqual(best('EXP 270531'), '2027-05-31');
assert.strictEqual(best('EXP 2O27-O5'), '2027-05-31'); // OCR letter O for zero
// Manufacture date should lose to expiry date
assert.strictEqual(best('MFG 2025-01\nLOT A123\nEXP 2028-01'), '2028-01-31');
assert.strictEqual(best('MFD 2026-03-01  2029-03-01'), '2029-03-01');
// No keywords: pick the later date
assert.strictEqual(best('2024-06  2027-06'), '2027-06-30');
// Nothing
assert.deepStrictEqual(extract('Sodium chloride 0.9% 1000 mL'), []);
console.log('date tests passed');
// Real-label noise: GS1 human-readable text, implausible years, sizes/ratios
const Y = new Date().getFullYear() % 100;
assert.strictEqual(best(`Saline\n1000 mL\n(01)00312345678906(17)${Y + 1}0531(10)A1`), `20${Y + 1}-05-31`);
assert.strictEqual(best(`(01)00312345678906 (17) ${Y + 2}0300 (10)A1`), `20${Y + 2}-03-31`);
assert.strictEqual(best('Ref 1/99 pack 12/50\n2027-08'), '2027-08-31');
assert.strictEqual(best('Tel 03/98 7654\n05/2028'), '2028-05-31');
assert.strictEqual(best('Gauze 10/20cm\n2025-06-01\n2029-05-31'), '2029-05-31');
assert.strictEqual(best('Size 4/30\n2027-11'), '2027-11-30');   // weak "4/30" loses to a real date
assert.strictEqual(best('MFG 2025-02\n(17)280229'), '2028-02-29'); // GS1 beats everything
console.log('real-label date tests passed');
