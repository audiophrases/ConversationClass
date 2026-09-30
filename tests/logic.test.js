// Run with: node tests/logic.test.js
const assert = require('assert');
const L = require('../logic.js');

const ids = (n) => Array.from({ length: n }, (_, i) => `s${i}`);
const sizes = (groups) => groups.map((g) => g.length).sort();

// group sizes: never a group of 1, trios never above 3
for (let n = 2; n <= 32; n += 1) {
  const p = L.groupSizes(n, 2);
  const t = L.groupSizes(n, 3);
  assert.strictEqual(p.reduce((a, b) => a + b, 0), n);
  assert.strictEqual(t.reduce((a, b) => a + b, 0), n);
  assert.ok(p.every((s) => s >= 2 && s <= 3), `pairs n=${n}: ${p}`);
  assert.ok(t.every((s) => s >= 2 && s <= 3), `trios n=${n}: ${t}`);
}
assert.deepStrictEqual(L.groupSizes(7, 2).sort(), [2, 2, 3]);
assert.deepStrictEqual(L.groupSizes(7, 3).sort(), [2, 2, 3]);

// every student appears exactly once
const g = L.makeGroups(ids(21), 2);
assert.deepStrictEqual(g.flat().sort(), ids(21).sort());
assert.deepStrictEqual(sizes(g), [2, 2, 2, 2, 2, 2, 2, 2, 2, 3]);

// partner rotation: 20 students, 8 rounds of pairs -> no repeated partner
let history = {};
for (let r = 0; r < 8; r += 1) {
  const groups = L.makeGroups(ids(20), 2, history);
  groups.forEach(([a, b]) => assert.ok(!history[L.pairKey(a, b)], `repeat in round ${r + 1}`));
  L.recordGroups(history, groups);
}

// Support students never share a group while there are enough groups to split them
const ssPairs = (groups, levels) => groups.reduce((n, grp) => {
  const k = grp.filter((id) => levels[id] === 'S').length;
  return n + (k * (k - 1)) / 2;
}, 0);
const mkLevels = (n, nS, nC = 0) => Object.fromEntries(ids(n).map((id, i) => [id, i < nS ? 'S' : (i < nS + nC ? 'C' : '')]));
for (let trial = 0; trial < 50; trial += 1) {
  // 21 students -> 10 groups (one trio); 10 Support fit one per group
  const lv = mkLevels(21, 10, 4);
  const grp = L.makeGroups(ids(21), 2, {}, lv);
  assert.deepStrictEqual(grp.flat().sort(), ids(21).sort());
  assert.strictEqual(ssPairs(grp, lv), 0, 'no Support+Support when avoidable');
}
// 12 Support among 20 students (10 pairs): exactly 2 unavoidable Support pairs
assert.strictEqual(ssPairs(L.makeGroups(ids(20), 2, {}, mkLevels(20, 12)), mkLevels(20, 12)), 2);
// 5 Support among 7 students (pair, pair, trio): best is SS, SS, S++ = 2 pairs
assert.strictEqual(ssPairs(L.makeGroups(ids(7), 2, {}, mkLevels(7, 5)), mkLevels(7, 5)), 2);

// Support rule + partner rotation together: 20 students, 8 Support, 8 rounds
history = {};
const lv20 = mkLevels(20, 8, 4);
for (let r = 0; r < 8; r += 1) {
  const groups = L.makeGroups(ids(20), 2, history, lv20);
  assert.strictEqual(ssPairs(groups, lv20), 0, `Support pair in round ${r + 1}`);
  groups.forEach(([a, b]) => assert.ok(!history[L.pairKey(a, b)], `repeat in round ${r + 1}`));
  L.recordGroups(history, groups);
}

// seat order: Support students take the preferred seats (default B, then C)
const seatLv = { sup: 'S', sup2: 'S', mid: 'N', top: 'C' };
for (let trial = 0; trial < 30; trial += 1) {
  assert.strictEqual(L.orderGroup(['sup', 'top'], seatLv)[1], 'sup', 'Support is B in a pair');
  assert.strictEqual(L.orderGroup(['top', 'sup'], seatLv, [0, 2, 1])[0], 'sup', 'Support is A when asking first');
  const trio = L.orderGroup(['sup', 'mid', 'sup2'], seatLv);
  assert.strictEqual(trio[0], 'mid', 'two Support in a trio take B and C');
  assert.deepStrictEqual(trio.slice().sort(), ['mid', 'sup', 'sup2']);
  assert.deepStrictEqual(L.orderGroup(['sup', 'sup2'], seatLv).sort(), ['sup', 'sup2']);
}
// without Support students every seat still gets filled, in random order
const firsts = new Set();
for (let trial = 0; trial < 40; trial += 1) {
  const g3 = L.orderGroup(['mid', 'top', 'x'], seatLv);
  assert.deepStrictEqual(g3.slice().sort(), ['mid', 'top', 'x']);
  firsts.add(g3[0]);
}
assert.strictEqual(firsts.size, 3, 'A is random when nobody is Support');

// reporter: fair rotation, never twice in a row
const counts = {};
let last = null;
const seen = new Set();
for (let i = 0; i < 10; i += 1) {
  const p = L.pickReporter(ids(10), counts, last);
  assert.notStrictEqual(p, last);
  counts[p] = (counts[p] || 0) + 1;
  seen.add(p);
  last = p;
}
assert.strictEqual(seen.size, 10, 'everyone reports once before anyone repeats');

// import: fenced JSON with chatter around it, loose field names
const reply = 'Sure! Here you go:\n```json\n{"title":"Unit 1","rounds":[' +
  '{"type":"Picture","title":"Office","image_query":"people in office","support":"Describe it.","challenge":"How do they feel?"},' +
  '{"type":"roleplay","title":"Shop","roles":["Customer","Clerk"],"support":"Buy a shirt."},' +
  '{"type":"weird","title":"X","challenge":"Talk."},' +
  '{"type":"topic","title":"Empty"}]}\n```\nHope it helps!';
const s = L.normalizeSession(L.extractJson(reply));
assert.strictEqual(s.title, 'Unit 1');
assert.strictEqual(s.rounds.length, 3);
assert.strictEqual(s.rounds[0].type, 'picture');
assert.strictEqual(s.rounds[0].imageQuery, 'people in office');
assert.deepStrictEqual(s.rounds[1].roles, ['Customer', 'Clerk']);
assert.strictEqual(s.rounds[1].challenge, 'Buy a shirt.');
assert.strictEqual(s.rounds[2].type, 'topic');
assert.throws(() => L.normalizeSession(L.extractJson('{"rounds":[]}')), /No valid rounds/);
assert.throws(() => L.extractJson('no json here'), /No JSON/);

// bare array is accepted too
assert.strictEqual(L.normalizeSession([{ type: 'topic', title: 'a', support: 'b' }]).rounds.length, 1);

// the prompt's own example must round-trip through the importer
const prompt = L.buildAiPrompt({ theme: 'Careers', course: '4º ESO', rounds: 6 });
assert.ok(prompt.includes('THEME: Careers') && prompt.includes('exactly 6 speaking rounds'));
const example = L.normalizeSession(L.extractJson(prompt.slice(prompt.lastIndexOf('\n{'))));
assert.strictEqual(example.rounds.length, 2);

console.log('All logic tests passed.');
