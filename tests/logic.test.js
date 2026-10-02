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

// fours: never above 4, never a pair once there are 6+ students
for (let n = 4; n <= 32; n += 1) {
  const f = L.groupSizes(n, 4);
  assert.strictEqual(f.reduce((a, b) => a + b, 0), n);
  assert.ok(f.every((s) => s >= (n >= 6 ? 3 : 2) && s <= 4), `fours n=${n}: ${f}`);
}
assert.deepStrictEqual(L.groupSizes(15, 4).sort(), [3, 4, 4, 4]);

// fours keep Support students apart too, and every seat gets filled
const lv16 = Object.fromEntries(ids(16).map((id, i) => [id, i < 4 ? 'S' : '']));
for (let trial = 0; trial < 20; trial += 1) {
  const g4 = L.makeGroups(ids(16), 4, {}, lv16).map((g) => L.orderGroup(g, lv16));
  assert.deepStrictEqual(sizes(g4), [4, 4, 4, 4]);
  g4.forEach((g) => {
    assert.strictEqual(g.filter((id) => lv16[id] === 'S').length, 1, 'one Support per four');
    assert.strictEqual(lv16[g[1]], 'S', 'Support takes seat B');
  });
}

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
const mkLevels = (n, nS, nL = 0) => Object.fromEntries(ids(n).map((id, i) => [id, i < nS ? 'S' : (i < nS + nL ? 'L' : '')]));
// Support students whose group has no leader
const uncovered = (groups, levels) => groups.reduce((n, grp) => (
  grp.some((id) => levels[id] === 'L') ? n : n + grp.filter((id) => levels[id] === 'S').length), 0);
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

// pairs of students in these groups who have already worked together
const repeatsIn = (groups, hist) => groups.reduce((n, g) => {
  for (let i = 0; i < g.length; i += 1) for (let j = i + 1; j < g.length; j += 1) if (hist[L.pairKey(g[i], g[j])]) n += 1;
  return n;
}, 0);

// Support rule + partner rotation together: 20 students, 8 Support. Pair rounds
// put Support students in trios, so they meet more people and run out of new
// partners after about 6 rounds.
history = {};
const lv20 = mkLevels(20, 8);
for (let r = 0; r < 6; r += 1) {
  const groups = L.makeGroups(ids(20), 2, history, lv20);
  assert.strictEqual(ssPairs(groups, lv20), 0, `Support pair in round ${r + 1}`);
  assert.strictEqual(repeatsIn(groups, history), 0, `repeat in round ${r + 1}`);
  L.recordGroups(history, groups);
}

// pair rounds: every Support student in a trio (with a leader and a neutral student), the rest in pairs
const lv25 = mkLevels(25, 5, 5);
for (let trial = 0; trial < 20; trial += 1) {
  const grp = L.makeGroups(ids(25), 2, {}, lv25);
  assert.deepStrictEqual(sizes(grp), [2, 2, 2, 2, 2, 3, 3, 3, 3, 3]);
  grp.filter((g) => g.some((id) => lv25[id] === 'S')).forEach((g) => {
    assert.deepStrictEqual(g.map((id) => lv25[id] || 'N').sort(), ['L', 'N', 'S'], 'Support + leader + neutral');
  });
}
assert.deepStrictEqual(L.onDuty([['s0', 's5', 's12'], ['s6', 's10']], lv25), ['s5'], 'onDuty: leaders grouped with a Support student');
// pair-round sizes: one trio per Support student, fewer when resting leaders need seats elsewhere
const trioCount = (z) => z.filter((x) => x === 3).length;
assert.strictEqual(trioCount(L.groupSizes(25, 2, 5)), 5);
assert.strictEqual(trioCount(L.groupSizes(25, 2, 5, 5)), 5, '25 students: plenty of free seats anyway');
assert.strictEqual(trioCount(L.groupSizes(14, 2, 4)), 4);
assert.strictEqual(trioCount(L.groupSizes(14, 2, 4, 3)), 2, '14 students: 2 trios + 4 pairs leaves 4 seats for 3 resting leaders');
assert.strictEqual(trioCount(L.groupSizes(21, 2, 10)), 1, 'never fewer groups than Support students');
for (let n = 4; n <= 32; n += 1) {
  for (let s = 0; s <= 8; s += 1) {
    const z = L.groupSizes(n, 2, s, 2);
    assert.strictEqual(z.reduce((a, b) => a + b, 0), n, `n=${n} s=${s}`);
    assert.ok(z.every((x) => x === 2 || x === 3), `n=${n} s=${s}: ${z}`);
  }
}

// leaders: every Support student gets one when there are enough
for (let trial = 0; trial < 30; trial += 1) {
  const lv = mkLevels(20, 6, 6); // pair round: 6 Support trios + 1 pair
  const grp = L.makeGroups(ids(20), 2, {}, lv);
  assert.strictEqual(ssPairs(grp, lv), 0);
  assert.strictEqual(uncovered(grp, lv), 0, 'each Support student paired with a leader');
  const few = mkLevels(20, 6, 3); // only 3 leaders: 3 Support covered, still no Support pairs
  const g2 = L.makeGroups(ids(20), 2, {}, few);
  assert.strictEqual(ssPairs(g2, few), 0);
  assert.strictEqual(uncovered(g2, few), 3, 'leaders all go to Support students');
  const tri = mkLevels(15, 5, 5); // 5 trios: Support + leader + neutral in each
  const g3 = L.makeGroups(ids(15), 3, {}, tri);
  assert.ok(g3.every((g) => g.filter((id) => tri[id] === 'S').length === 1 && g.filter((id) => tri[id] === 'L').length === 1), 'one Support and one leader per trio');
}
// rest: a leader who worked with a Support student last round gets this round off.
// Priorities: Support apart > leader rest > Support has a leader > new partners.
const lesson = (n, nS, nL, rounds, size = 2) => {
  const lv = mkLevels(n, nS, nL);
  const hist = {};
  let busy = [];
  return Array.from({ length: rounds }, () => {
    const groups = L.makeGroups(ids(n), size, hist, lv, { busy });
    const tired = groups.filter((g) => g.some((id) => lv[id] === 'S')).flat().filter((id) => busy.includes(id));
    const round = { ss: ssPairs(groups, lv), tired: tired.length, uncovered: uncovered(groups, lv), repeats: repeatsIn(groups, hist) };
    L.recordGroups(hist, groups);
    busy = L.onDuty(groups, lv);
    return round;
  });
};
for (let trial = 0; trial < 5; trial += 1) {
  // twice as many leaders as Support students: everyone covered every round, nobody on duty twice in a row
  lesson(24, 4, 8, 8).forEach((r, i) => {
    assert.strictEqual(r.ss, 0, `round ${i + 1}`);
    assert.strictEqual(r.tired, 0, `leader on duty two rounds in a row (round ${i + 1})`);
    assert.strictEqual(r.uncovered, 0, `Support without leader (round ${i + 1})`);
  });
  // fewer leaders: rest still wins, so some Support students go without a leader on alternate rounds
  const short = lesson(20, 5, 6, 8);
  short.forEach((r, i) => {
    assert.strictEqual(r.ss, 0, `round ${i + 1}`);
    assert.strictEqual(r.tired, 0, `leader on duty two rounds in a row (round ${i + 1})`);
  });
  assert.strictEqual(short[0].uncovered, 0, 'first round: everyone covered');
  assert.ok(short.some((r) => r.uncovered > 0), 'with too few leaders, coverage gives way to rest');
  // trio rounds follow the same rules
  lesson(24, 4, 8, 6, 3).forEach((r, i) => assert.ok(!r.ss && !r.tired && !r.uncovered, `trio round ${i + 1}`));
}

// seat order: Support students take the preferred seats (default B, then C);
// leaders take the seat that goes first (A, or B when Support asks first)
const seatLv = { sup: 'S', sup2: 'S', mid: 'N', top: 'L', x: 'N' };
for (let trial = 0; trial < 30; trial += 1) {
  assert.deepStrictEqual(L.orderGroup(['sup', 'top'], seatLv), ['top', 'sup'], 'leader A, Support B');
  assert.deepStrictEqual(L.orderGroup(['top', 'sup'], seatLv, [0, 2, 3, 1]), ['sup', 'top'], 'Support asks first, leader answers first');
  assert.deepStrictEqual(L.orderGroup(['mid', 'sup', 'top'], seatLv), ['top', 'sup', 'mid'], 'trio: leader A, Support B');
  assert.strictEqual(L.orderGroup(['x', 'top', 'mid'], seatLv)[0], 'top', 'leader starts even without Support');
  const trio = L.orderGroup(['sup', 'mid', 'sup2'], seatLv);
  assert.strictEqual(trio[0], 'mid', 'two Support in a trio take B and C');
  assert.deepStrictEqual(trio.slice().sort(), ['mid', 'sup', 'sup2']);
  assert.deepStrictEqual(L.orderGroup(['sup', 'sup2'], seatLv).sort(), ['sup', 'sup2']);
}
// without Support students or leaders every seat still gets filled, in random order
const firsts = new Set();
for (let trial = 0; trial < 40; trial += 1) {
  const g3 = L.orderGroup(['mid', 'x', 'y'], seatLv);
  assert.deepStrictEqual(g3.slice().sort(), ['mid', 'x', 'y']);
  firsts.add(g3[0]);
}
assert.strictEqual(firsts.size, 3, 'A is random when nobody is Support or leader');

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
assert.deepStrictEqual(example.rounds.map((r) => r.group), [2, 3], 'default example uses pairs, then trios');

// group sizes in the prompt follow the teacher's choice
const fours = L.buildAiPrompt({ theme: 'x', groups: [4] });
assert.ok(fours.includes('use 4 (groups of four) for every round'));
assert.deepStrictEqual(L.normalizeSession(L.extractJson(fours.slice(fours.lastIndexOf('\n{')))).rounds.map((r) => r.group), [4, 4]);
assert.ok(L.buildAiPrompt({ theme: 'x', groups: [2, 3, 4] }).includes('2 (pairs), 3 (trios), 4 (groups of four)'));

// group field: numbers or words, 2-4 only
const grp = (v) => L.normalizeRound({ type: 'topic', support: 'a', group: v }).group;
assert.strictEqual(grp(3), 3);
assert.strictEqual(grp('fours'), 4);
assert.strictEqual(grp('Pairs'), 2);
assert.strictEqual(grp('4'), 4);
assert.strictEqual(grp(5), undefined);
assert.strictEqual(grp(undefined), undefined);
assert.strictEqual(L.normalizeRound({ type: 'topic', support: 'a', groupSize: 3 }).group, 3);

console.log('All logic tests passed.');
