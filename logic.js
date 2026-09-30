// Pure logic (no DOM): grouping, report-back picking, AI prompt, JSON import.
// Loaded as a classic script in the browser; also require()-able from Node for tests.

(function (root) {
  const TYPE_KEYS = ['picture', 'topic', 'roleplay', 'defend', 'problem', 'creative'];

  function shuffle(arr, rand = Math.random) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function pairKey(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  // Group sizes for n students: pairs leave at most one trio; trios and fours
  // shrink by one rather than leaving anyone alone.
  function groupSizes(n, size) {
    if (n <= 0) return [];
    if (n <= 3) return [n];
    const count = size >= 3 ? Math.ceil(n / size) : Math.floor(n / 2);
    const sizes = Array(count).fill(Math.floor(n / count));
    for (let i = 0; i < n % count; i += 1) sizes[i] += 1;
    return sizes;
  }

  // Cost of one group: repeated partners (history maps pairKey -> times together,
  // squared so repeats of repeats hurt more) plus a huge penalty for every
  // Support+Support pairing, so that only happens when it can't be avoided.
  const SUPPORT_PAIR_COST = 1e6;
  function groupCost(g, history, isSupport) {
    let cost = 0;
    for (let i = 0; i < g.length; i += 1) {
      for (let j = i + 1; j < g.length; j += 1) {
        const c = history[pairKey(g[i], g[j])] || 0;
        cost += c * c;
        if (isSupport(g[i]) && isSupport(g[j])) cost += SUPPORT_PAIR_COST;
      }
    }
    return cost;
  }

  // Random groups that keep Support students apart and avoid previous partners.
  // Each try deals Support students out one per group (so they only double up
  // when there are more of them than groups), fills the rest at random, then
  // swaps students between groups while that lowers the cost. Best try wins.
  // levels maps id -> 'S' (Support) | 'C' (Challenge) | anything else (neutral).
  function makeGroups(ids, size, history = {}, levels = {}, tries = 40, rand = Math.random) {
    const sizes = groupSizes(ids.length, size);
    if (!sizes.length) return [];
    const isSupport = (id) => levels[id] === 'S';
    let best = null;
    let bestScore = Infinity;
    for (let t = 0; t < tries; t += 1) {
      const groups = sizes.map(() => []);
      const supports = shuffle(ids.filter(isSupport), rand);
      const others = shuffle(ids.filter((id) => !isSupport(id)), rand);
      const order = shuffle(sizes.map((_, i) => i), rand);
      let k = 0;
      supports.forEach((id) => {
        while (groups[order[k % order.length]].length >= sizes[order[k % order.length]]) k += 1;
        groups[order[k % order.length]].push(id);
        k += 1;
      });
      let gi = 0;
      others.forEach((id) => {
        while (groups[gi].length >= sizes[gi]) gi += 1;
        groups[gi].push(id);
      });

      const costs = groups.map((g) => groupCost(g, history, isSupport));
      let improved = true;
      while (improved) {
        improved = false;
        for (let a = 0; a < groups.length; a += 1) {
          for (let b = a + 1; b < groups.length; b += 1) {
            for (let i = 0; i < groups[a].length; i += 1) {
              for (let j = 0; j < groups[b].length; j += 1) {
                const x = groups[a][i];
                const y = groups[b][j];
                groups[a][i] = y; groups[b][j] = x;
                const ca = groupCost(groups[a], history, isSupport);
                const cb = groupCost(groups[b], history, isSupport);
                if (ca + cb < costs[a] + costs[b]) {
                  costs[a] = ca; costs[b] = cb; improved = true;
                } else {
                  groups[a][i] = x; groups[b][j] = y;
                }
              }
            }
          }
        }
      }

      const score = costs.reduce((sum, c) => sum + c, 0);
      if (score < bestScore) { best = groups.map((g) => shuffle(g, rand)); bestScore = score; }
      if (score === 0) break;
    }
    return shuffle(best, rand);
  }

  // Seat order inside a group decides who is A (starts), B and C. Support
  // students take the given seats first (default B, C, D, then A) so they
  // hear a partner go first; everyone else gets a random seat.
  function orderGroup(group, levels = {}, slots = [1, 2, 3, 0], rand = Math.random) {
    const out = [];
    const free = slots.filter((i) => i < group.length);
    const rest = [];
    shuffle(group, rand).forEach((id) => {
      if (levels[id] === 'S' && free.length) out[free.shift()] = id;
      else rest.push(id);
    });
    for (let i = 0; i < group.length; i += 1) if (out[i] === undefined) out[i] = rest.shift();
    return out;
  }

  function recordGroups(history, groups) {
    groups.forEach((g) => {
      for (let i = 0; i < g.length; i += 1) {
        for (let j = i + 1; j < g.length; j += 1) {
          const key = pairKey(g[i], g[j]);
          history[key] = (history[key] || 0) + 1;
        }
      }
    });
    return history;
  }

  // Pick a reporter among those who have reported the least; never the same
  // person twice in a row unless they are the only candidate.
  function pickReporter(ids, counts = {}, lastId = null, rand = Math.random) {
    if (!ids.length) return null;
    const min = Math.min(...ids.map((id) => counts[id] || 0));
    let pool = ids.filter((id) => (counts[id] || 0) === min && id !== lastId);
    if (!pool.length) pool = ids.filter((id) => id !== lastId);
    if (!pool.length) pool = ids;
    return pool[Math.floor(rand() * pool.length)];
  }

  // ---------- AI prompt ----------

  const TYPE_DESCRIPTIONS = {
    picture: 'picture: A describes a photo while B does not look and asks questions; at the swap a new photo appears. Must include "imageQuery".',
    topic: 'topic: A asks, B answers. Write the tasks as questions A can read aloud to B.',
    roleplay: 'roleplay: a short situation with 2 roles (A plays the first role, B the second). Must include "roles" (exactly 2).',
    defend: 'defend: a mini-debate. A defends the first option, B the second (sides are given, not chosen). Must include "options" (exactly 2). Write the tasks as "defend your side", never "choose one".',
    problem: 'problem: a realistic problem. Each student suggests different ideas, then they agree on one.',
    creative: 'creative: imagine/invent something (story, advert, future, invention...). A starts, B adds.',
  };

  const GROUP_WORDS = { 2: 'pairs', 3: 'trios', 4: 'groups of four' };

  function groupRules(sizes) {
    if (sizes.length === 1) return [`- "group": use ${sizes[0]} (${GROUP_WORDS[sizes[0]]}) for every round.`];
    return [
      `- "group": the group size for this round: ${sizes.map((n) => `${n} (${GROUP_WORDS[n]})`).join(', ')}. Choose what suits the task and vary it across the session:`,
      '  pairs for interviews, describing and most role plays; trios when a third student can judge or direct (debates, role plays); fours for problem solving and planning.',
      '  In trios and fours, students C and D answer too, judge the debate, direct the role play or add ideas.',
    ];
  }

  function buildAiPrompt({ theme, course, rounds = 7, types = TYPE_KEYS, groups = [2, 3], note = '' }) {
    const chosen = (types && types.length ? types : TYPE_KEYS).filter((t) => TYPE_DESCRIPTIONS[t]);
    const sizes = [2, 3, 4].filter((n) => (groups && groups.length ? groups : [2, 3]).includes(n));
    const example = {
      title: 'Unit 1 · Study and career plans',
      level: course || '4º ESO',
      rounds: [
        {
          type: 'picture',
          title: 'At work',
          group: sizes[0],
          imageQuery: 'young woman working in laboratory',
          support: 'Describe the picture. What is this person\'s job? What is she doing?',
          challenge: 'Would you like this job? What skills and studies do you need for it? Why?',
          words: ['She is a...', 'She works in...', 'I would / wouldn\'t like...'],
        },
        {
          type: 'defend',
          title: 'Bachillerato or FP?',
          group: sizes.includes(3) ? 3 : sizes[sizes.length - 1],
          options: ['Bachillerato', 'Vocational training (FP)'],
          support: 'Defend your side. Give two reasons.',
          challenge: 'Compare both options and convince your partner. Answer their arguments.',
          words: ['It\'s better because...', 'It\'s more / less...'],
        },
      ],
    };

    return [
      'You are helping an English (ESL) teacher in a Spanish secondary school prepare a speaking lesson.',
      '',
      `THEME: ${theme || '(general teen topics)'}`,
      `STUDENTS: ${course || '3º/4º ESO'} (teenagers), mixed levels in the same class.`,
      note ? `TEACHER'S NOTE: ${note}` : null,
      '',
      `Create exactly ${rounds} speaking rounds. Each round is a 5-minute conversation in small groups (${sizes.map((n) => GROUP_WORDS[n]).join(' / ')}).`,
      'Students only SPEAK (no writing). The task is projected on one big screen, so keep text SHORT.',
      'In every group, student A starts and A and B swap jobs halfway, so each task must work for both of them.',
      '',
      'Round types to use (vary the order, don\'t repeat the same type twice in a row):',
      ...chosen.map((t) => `- ${TYPE_DESCRIPTIONS[t]}`),
      '',
      'Every round has ONE task with TWO versions (same topic, different depth):',
      '- "support": for weak students (A1–A2). Concrete, simple words, short questions. Max 25 words.',
      '- "challenge": for strong students (B2–C1). Opinions, speculation, hypotheticals, justifying, persuading. Max 30 words.',
      '- Pairs start with "support" and move on to "challenge" when it feels easy, so "challenge" goes deeper into the same task.',
      '- Speak directly to the students ("Describe...", "Tell your partner...", "Agree on...").',
      '- "words": 2–4 short sentence starters or useful phrases that help support students.',
      '- "title": 1–5 words.',
      ...groupRules(sizes),
      '- "imageQuery" (picture rounds only): 3–6 plain English words for a stock-photo search. Concrete and photographable: people, places, actions. No brands, no famous people, no text.',
      '- Content must be appropriate and interesting for teenagers.',
      '',
      'Return ONLY valid JSON (no comments, no extra text) in exactly this format:',
      '',
      JSON.stringify(example, null, 2),
    ].filter((line) => line !== null).join('\n');
  }

  // ---------- JSON import ----------

  function extractJson(text) {
    const raw = String(text || '').trim();
    if (!raw) throw new Error('Paste the JSON first.');
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    let body = fenced ? fenced[1].trim() : raw;
    if (!/^[[{]/.test(body)) {
      const start = body.search(/[[{]/);
      if (start === -1) throw new Error('No JSON found in the pasted text.');
      body = body.slice(start);
    }
    const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'));
    if (end !== -1) body = body.slice(0, end + 1);
    try {
      return JSON.parse(body);
    } catch (err) {
      throw new Error(`That doesn't look like valid JSON (${err.message}).`);
    }
  }

  const str = (v, max = 400) => String(v == null ? '' : v).trim().slice(0, max);
  const strList = (v, n) => (Array.isArray(v) ? v.map((x) => str(x, 80)).filter(Boolean).slice(0, n) : []);

  // Round group size: 2-4, from a number or a word ("pairs", "trios", "fours").
  function parseGroup(v) {
    const words = { pair: 2, pairs: 2, trio: 3, trios: 3, three: 3, threes: 3, four: 4, fours: 4 };
    const n = words[String(v).trim().toLowerCase()] || Math.round(Number(v));
    return n >= 2 && n <= 4 ? n : null;
  }

  function normalizeRound(r) {
    const type = TYPE_KEYS.includes(String(r && r.type).toLowerCase()) ? String(r.type).toLowerCase() : 'topic';
    const round = {
      type,
      title: str(r.title, 80) || 'Untitled',
      support: str(r.support || r.easy || r.simple),
      challenge: str(r.challenge || r.hard || r.advanced),
      words: strList(r.words || r.phrases, 6),
    };
    if (!round.support && !round.challenge) return null;
    const group = parseGroup(r.group != null ? r.group : (r.groupSize != null ? r.groupSize : r.size));
    if (group) round.group = group;
    if (!round.support) round.support = round.challenge;
    if (!round.challenge) round.challenge = round.support;
    if (type === 'picture') {
      round.imageQuery = str(r.imageQuery || r.image_query || r.query, 120) || round.title;
      if (r.image && /^(https?:|data:image\/)/.test(r.image)) round.image = String(r.image);
    }
    if (type === 'roleplay') {
      const roles = strList(r.roles, 3);
      if (roles.length >= 2) round.roles = roles;
    }
    if (type === 'defend') {
      const options = strList(r.options, 3);
      if (options.length >= 2) round.options = options;
    }
    return round;
  }

  function normalizeSession(data) {
    const obj = Array.isArray(data) ? { rounds: data } : (data || {});
    const list = Array.isArray(obj.rounds) ? obj.rounds : [];
    const rounds = list.map(normalizeRound).filter(Boolean);
    if (!rounds.length) throw new Error('No valid rounds found. Each round needs a type and support/challenge text.');
    return {
      title: str(obj.title, 80) || 'Imported session',
      level: str(obj.level, 40),
      rounds,
    };
  }

  const api = {
    TYPE_KEYS, shuffle, pairKey, groupSizes, makeGroups, orderGroup, recordGroups, pickReporter, parseGroup,
    buildAiPrompt, extractJson, normalizeRound, normalizeSession,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Logic = api;
}(typeof window !== 'undefined' ? window : globalThis));
