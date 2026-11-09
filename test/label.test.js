const assert = require('assert');
const { extract } = require('../label.js');
const L = (...rows) => rows.map(([text, height]) => ({ text, height }));

let r = extract(L(['Baxter', 20], ['Sodium Chloride', 44], ['0.9% Injection', 43], ['1000 mL', 30], ['LOT 24K118', 18], ['EXP 2027-05', 18]));
assert.strictEqual(r.names[0], 'Sodium Chloride 0.9% Injection');
assert.strictEqual(r.lot, '24K118');

r = extract(L(['| Adrenaline 1mg/mL _', 40], ['Batch: X1923', 16], ['Use by: 15 MAY 2027', 16]));
assert.strictEqual(r.names[0], 'Adrenaline 1mg/mL');
assert.strictEqual(r.lot, 'X1923');

// Known product name wins over the biggest text
r = extract(L(['ACME', 60], ['Gauze Swabs 10x10cm', 25]), ['Gauze Swabs 10x10cm']);
assert.strictEqual(r.names[0], 'Gauze Swabs 10x10cm');

// Codes and garbage are not names
r = extract(L(['REF 4471-22', 50], ['~~ ; ii', 50], ['0123456789', 50], ['STERILE EO', 40]));
assert.deepStrictEqual(r.names, []);
assert.strictEqual(r.lot, null);
console.log('label tests passed');
// Wrapped name where the second line reads slightly taller
r = extract(L(['Baxter Healthcare', 20], ['Sodium Chloride', 44], ['0.9% Injection', 47], ['1000 mL', 30]));
assert.strictEqual(r.names[0], 'Sodium Chloride 0.9% Injection');
console.log('label wrap test passed');
