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

  // Group sizes for n students: pairs leave at most one trio; trios become pairs
  // rather than leaving anyone alone.
  function groupSizes(n, size) {
    if (n <= 0) return [];
    if (n <= 3) return [n];
    const count = size === 3 ? Math.ceil(n / 3) : Math.floor(n / 2);
    const sizes = Array(count).fill(Math.floor(n / count));
    for (let i = 0; i < n % count; i += 1) sizes[i] += 1;
    return sizes;
  }

  // Random groups that avoid previous partners: try many shuffles, keep the one
  // with the fewest repeated pairings (history maps pairKey -> times together).
  function makeGroups(ids, size, history = {}, tries = 300, rand = Math.random) {
    const sizes = groupSizes(ids.length, size);
    let best = null;
    let bestScore = Infinity;
    for (let t = 0; t < tries; t += 1) {
      const order = shuffle(ids, rand);
      const groups = [];
      let k = 0;
      sizes.forEach((s) => { groups.push(order.slice(k, k + s)); k += s; });
      let score = 0;
      groups.forEach((g) => {
        for (let i = 0; i < g.length; i += 1) {
          for (let j = i + 1; j < g.length; j += 1) {
            const c = history[pairKey(g[i], g[j])] || 0;
            score += c * c; // punish repeats of repeats harder
          }
        }
      });
      if (score < bestScore) { best = groups; bestScore = score; }
      if (score === 0) break;
    }
    return best || [];
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
    picture: 'picture: students describe and discuss a photo. Must include "imageQuery".',
    topic: 'topic: a conversation topic with questions to discuss.',
    roleplay: 'roleplay: a short situation with 2 roles. Must include "roles" (exactly 2).',
    defend: 'defend: choose one of 2 options and justify it. Must include "options" (exactly 2).',
    problem: 'problem: a realistic problem the group must solve together.',
    creative: 'creative: imagine/invent something (story, advert, future, invention...).',
  };

  function buildAiPrompt({ theme, course, rounds = 7, types = TYPE_KEYS, note = '' }) {
    const chosen = (types && types.length ? types : TYPE_KEYS).filter((t) => TYPE_DESCRIPTIONS[t]);
    const example = {
      title: 'Unit 1 · Study and career plans',
      level: course || '4º ESO',
      rounds: [
        {
          type: 'picture',
          title: 'At work',
          imageQuery: 'young woman working in laboratory',
          support: 'Describe the picture. What is this person\'s job? What is she doing?',
          challenge: 'Would you like this job? What skills and studies do you need for it? Why?',
          words: ['She is a...', 'She works in...', 'I would / wouldn\'t like...'],
        },
        {
          type: 'defend',
          title: 'Bachillerato or FP?',
          options: ['Bachillerato', 'Vocational training (FP)'],
          support: 'Which is better for you? Give two reasons.',
          challenge: 'Which is better for most students? Compare them and convince your partner.',
          words: ['I prefer...', 'It\'s more / less...'],
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
      `Create exactly ${rounds} speaking rounds. Each round is a 5-minute conversation in pairs or trios.`,
      'Students only SPEAK (no writing). The task is projected on one big screen, so keep text SHORT.',
      '',
      'Round types to use (vary the order, don\'t repeat the same type twice in a row):',
      ...chosen.map((t) => `- ${TYPE_DESCRIPTIONS[t]}`),
      '',
      'Every round has ONE task with TWO versions (same topic, different depth):',
      '- "support": for weak students (A1–A2). Concrete, simple words, short questions. Max 25 words.',
      '- "challenge": for strong students (B2–C1). Opinions, speculation, hypotheticals, justifying, persuading. Max 30 words.',
      '- Speak directly to the students ("Describe...", "Tell your partner...", "Agree on...").',
      '- "words": 2–4 short sentence starters or useful phrases that help support students.',
      '- "title": 1–5 words.',
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
    TYPE_KEYS, shuffle, pairKey, groupSizes, makeGroups, recordGroups, pickReporter,
    buildAiPrompt, extractJson, normalizeRound, normalizeSession,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Logic = api;
}(typeof window !== 'undefined' ? window : globalThis));
