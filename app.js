/* global ROUND_TYPES, Logic, searchImages, fileToDataUrl,
   loadRoundsCache, saveRoundsCache, fetchRoundsFolder */

const STORE_KEY = 'talkRounds.v1';
const COURSES = ['1º ESO', '2º ESO', '3º ESO', '4º ESO', '1º Bachillerato', '2º Bachillerato'];
const GROUP_MODES = { pairs: 'Pairs', trios: 'Trios', mix: 'Mix' };
const GROUP_NAMES = { 2: 'Pairs', 3: 'Trios', 4: 'Fours' };
const NOTE_OPTIONS = [0, 30, 60, 90];

const $ = (sel, el = document) => el.querySelector(sel);
const uid = () => Math.random().toString(36).slice(2, 10);
const clone = (o) => JSON.parse(JSON.stringify(o));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const DEFAULT_SETTINGS = {
  classId: null,
  sessionId: null,
  minutes: 5,
  groupMode: 'pairs',
  noteSeconds: 60,
  sound: true,
  theme: 'light',
  ai: { theme: '', course: '4º ESO', rounds: 7, types: Logic.TYPE_KEYS.slice(), groups: [2, 3], note: '' },
};

let db = loadDb();
let view = 'setup';
let tickHandle = null;
let spinHandle = null;
let nudgeHandle = null;
let draft = null; // session being edited
let preview = null; // session being previewed (never saved)
let roundsFolder = loadRoundsCache(); // lessons from the GitHub rounds/ folder
let wakeLock = null;

// ---------- storage ----------

function loadDb() {
  let data = {};
  try { data = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { data = {}; }
  const classes = Array.isArray(data.classes) ? data.classes : [];
  // Level codes: N neutral, S Support, L leader (shown as ⚡ Spark).
  // v1 had only Support ('S', the default) and Challenge ('C'): unmarked students
  // became neutral. v3 turned Challenge into the leader level.
  const version = data.version || 1;
  classes.forEach((c) => (c.students || []).forEach((st) => {
    if (version < 2 && st.level !== 'C') st.level = 'N';
    if (version < 3 && st.level === 'C') st.level = 'L';
  }));
  return {
    version: 3,
    classes,
    sessions: Array.isArray(data.sessions) ? data.sessions : [],
    imageCache: data.imageCache && typeof data.imageCache === 'object' ? data.imageCache : {},
    settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
    live: data.live || null,
  };
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
  } catch {
    toast('⚠️ Could not save: browser storage is full. Try smaller uploaded images.');
  }
}

// ---------- model helpers ----------

function ensureClass() {
  if (!db.classes.length) {
    db.classes.push({ id: uid(), name: 'My class', students: [], history: {} });
  }
  let cls = db.classes.find((c) => c.id === db.settings.classId);
  if (!cls) { cls = db.classes[0]; db.settings.classId = cls.id; }
  return cls;
}

// Lessons from the GitHub rounds/ folder: read-only here (editing saves a copy).
function folderSessions() {
  return roundsFolder.files.filter((f) => f.session).map((f) => ({ ...f.session, id: `gh:${f.path}`, fromGitHub: f.path }));
}

function allSessions() {
  return [...db.sessions, ...folderSessions()];
}

function parseLesson(text, name) {
  const data = Logic.extractJson(text);
  const session = Logic.normalizeSession(data);
  if (!data || !data.title) session.title = name.replace(/\.json$/i, '').replace(/[-_]+/g, ' ');
  return session;
}

// Checked on every page load; if GitHub can't be reached, the copies saved in
// this browser are used.
async function refreshRoundsFolder() {
  try {
    roundsFolder = await fetchRoundsFolder(roundsFolder, parseLesson);
    saveRoundsCache(roundsFolder);
  } catch (err) {
    console.warn(err);
  }
  if (view === 'setup') render();
  const session = currentSession();
  if (session) ensureImages(session.rounds).then((found) => { if (found && view === 'setup') render(); });
}

// Files in the folder that aren't valid lessons: only shown when there are some.
function roundsFolderErrors() {
  return roundsFolder.files.filter((f) => f.error)
    .map((f) => `<p class="folder-error">⚠️ GitHub rounds folder, ${esc(f.name)}: ${esc(f.error)}</p>`).join('');
}

function currentSession() {
  const list = allSessions();
  return list.find((s) => s.id === db.settings.sessionId) || list[0];
}

function liveClass() {
  return db.live && db.classes.find((c) => c.id === db.live.classId);
}

// Stand-in names so a session can be previewed before any students are added.
const DEMO_STUDENTS = ['Alex', 'Sam', 'Noa', 'Leo', 'Mia', 'Hugo', 'Lucia', 'Dani', 'Irene', 'Marco', 'Sara', 'Pablo']
  .map((name, i) => ({ id: `demo-${i}`, name, level: 'N', absent: false }));

function findStudent(id) {
  for (const cls of db.classes) {
    const st = cls.students.find((s) => s.id === id);
    if (st) return st;
  }
  return DEMO_STUDENTS.find((s) => s.id === id) || null;
}

function nameOf(id) {
  const st = findStudent(id);
  return st ? st.name : '?';
}

function levelOf(id) {
  const st = findStudent(id);
  return st ? st.level : 'N';
}

const LEVEL_NAMES = { S: 'Support', L: 'Spark (fluent, talks with anyone, positive leader)', N: 'No level' };
const LEVEL_MARKS = { S: '+', L: '⚡', N: '' };

// Picture rounds can have a second search (`imageQuery2`) for the picture after
// the swap; `round.second` marks that it is showing. If that search found
// nothing, the next result of the first search is used instead.
function secondPictures(round) {
  return round.imageQuery2 ? db.imageCache[round.imageQuery2] || [] : [];
}

function showingSecond(round) {
  return !!round.second && secondPictures(round).length > 0;
}

function imageCandidates(round) {
  if (showingSecond(round)) return secondPictures(round);
  const list = [round.image, ...(db.imageCache[round.imageQuery] || [])].filter(Boolean);
  return [...new Set(list)];
}

// Which index picks the picture from the list on screen (↻ and broken links move it).
function imageIdxKey(round) {
  return showingSecond(round) ? 'imageIdx2' : 'imageIdx';
}

function roundImage(round) {
  const list = imageCandidates(round);
  if (!list.length) return '';
  return list[(round[imageIdxKey(round)] || 0) % list.length];
}

function hasNextPicture(round) {
  return secondPictures(round).length > 0 || imageCandidates(round).length > 1;
}

// Switch to the picture for after the swap.
function advancePicture(round) {
  if (!round.second && secondPictures(round).length) {
    round.second = true;
  } else {
    const key = imageIdxKey(round);
    round[key] = (round[key] || 0) + 1;
  }
}

// Look up pictures for any picture round that has none yet (cached by query).
async function ensureImages(rounds) {
  const queries = [...new Set(rounds
    .filter((r) => r.type === 'picture')
    .flatMap((r) => [r.image ? '' : r.imageQuery, r.imageQuery2])
    .filter((q) => q && !db.imageCache[q]))];
  if (!queries.length) return false;
  await Promise.all(queries.map(async (q) => {
    const items = await searchImages(q, 10);
    if (items.length) db.imageCache[q] = items.map((it) => it.url);
  }));
  const keys = Object.keys(db.imageCache);
  keys.slice(0, Math.max(0, keys.length - 80)).forEach((k) => delete db.imageCache[k]);
  save();
  return true;
}

// ---------- ui helpers ----------

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2800);
}

function openModal(inner, cls = '') {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal ${cls}" role="dialog" aria-modal="true">${inner}</div>`;
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) wrap.remove(); });
  $('#modal-root').appendChild(wrap);
  return wrap;
}

function closeTopModal() {
  const all = document.querySelectorAll('.modal-backdrop');
  if (all.length) all[all.length - 1].remove();
}

function download(filename, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

// ---------- sound ----------

let audioCtx = null;
function tone(freq, dur, when = 0, type = 'sine', vol = 0.2) {
  if (!db.settings.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime + when;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  } catch { /* no audio available */ }
}

const sfx = {
  bell: () => [0, 0.4, 0.8].forEach((w) => tone(880, 0.35, w, 'triangle', 0.4)),
  chime: () => { tone(660, 0.25, 0, 'sine', 0.25); tone(990, 0.4, 0.18, 'sine', 0.25); },
  tick: () => tone(1500, 0.03, 0, 'square', 0.04),
  fanfare: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, i * 0.1, 'triangle', 0.25)),
};

// ---------- render ----------

function render() {
  document.documentElement.dataset.theme = db.settings.theme;
  if (view === 'live' && db.live) renderLive();
  else if (view === 'preview' && preview) renderLive(previewStage());
  else renderSetup();
}

function studentChip(s) {
  const state = s.absent ? 'A' : s.level;
  const title = s.absent ? 'Absent' : LEVEL_NAMES[s.level];
  const mark = s.absent ? '' : LEVEL_MARKS[s.level];
  return `<span class="chip ${state}" data-action="cycleStudent" data-id="${s.id}" title="${title}: tap to change" role="button" tabindex="0">
    ${mark ? `<span class="mark">${mark}</span>` : ''}${esc(s.name)}<button class="chip-x" data-action="removeStudent" data-id="${s.id}" title="Remove ${esc(s.name)}" aria-label="Remove">×</button></span>`;
}

function roundRow(r, i) {
  const t = ROUND_TYPES[r.type] || ROUND_TYPES.topic;
  const img = r.type === 'picture' ? roundImage(r) : '';
  const thumb = r.type === 'picture'
    ? (img ? `<img class="thumb" src="${esc(img)}" alt="" loading="lazy">` : '<span class="thumb empty" title="Looking for a picture…">🖼️</span>')
    : '';
  return `<li class="round-row t-${r.type}">
    <span class="rnum">${i + 1}</span><span class="ricon">${t.icon}</span>
    <span class="rtext"><b>${esc(r.title)}</b><small>${t.name} · ${GROUP_NAMES[sizeForRound(r, i)]}</small></span>${thumb}</li>`;
}

function renderSetup() {
  const pending = $('#namesInput') ? $('#namesInput').value : '';
  const cls = ensureClass();
  const session = currentSession();
  const s = db.settings;
  const present = cls.students.filter((st) => !st.absent);
  const nL = present.filter((st) => st.level === 'L').length;
  const nS = present.filter((st) => st.level === 'S').length;
  const live = db.live;

  $('#app').innerHTML = `
  <div class="setup">
    <header class="brand">
      <div class="logo">🗣️ Conversation Class</div>
      <button class="btn ghost small" data-action="toggleTheme">${s.theme === 'dark' ? '☀️ Light' : '🌙 Dark'}</button>
    </header>

    ${live ? `<div class="resume">
      <span>Class in progress: <b>${esc(live.title)}</b> · round ${Math.min(live.index + 1, live.rounds.length)} of ${live.rounds.length}</span>
      <span class="row"><button class="btn primary" data-action="resume">Resume ▶</button>
      <button class="btn ghost" data-action="discardLive">Discard</button></span>
    </div>` : ''}

    <div class="setup-grid">
      <section class="panel">
        <h2><span class="step">1</span> Class</h2>
        <div class="row">
          <select data-change="selectClass" aria-label="Class">
            ${db.classes.map((c) => `<option value="${c.id}" ${c.id === cls.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
            <option value="__new">+ New class…</option>
          </select>
          <button class="btn ghost small" data-action="renameClass" title="Rename class">✏️</button>
          <button class="btn ghost small" data-action="deleteClass" title="Delete class">🗑️</button>
        </div>
        <p class="legend">Tap a name: no mark → <b class="c-S">+</b> Support → <b class="c-L">⚡</b> Spark → Absent. Only you see these. Support students are never paired together; each gets a Spark (fluent, talks with anyone, positive leader), and in pair rounds they work in a trio. Sparks get every other round off.</p>
        <div class="chips">${cls.students.map(studentChip).join('') || '<p class="empty">No students yet. Paste your list below 👇</p>'}</div>
        ${cls.students.length ? `<p class="stats"><b>${present.length}</b> present · <span class="c-S">${nS} support</span> · <span class="c-L">${nL} spark</span></p>
          ${nL < 2 * nS ? `<p class="stats warn">⚠️ Sparks take every other round off: mark ${2 * nS - nL} more ⚡ (${2 * nS} in all) so every Support student always has one.</p>` : ''}` : ''}
        <textarea id="namesInput" rows="3" placeholder="Paste names, one per line.&#10;Add * for Spark (Maria*), + for Support (Leo+)"></textarea>
        <div class="row wrap">
          <button class="btn" data-action="addNames">➕ Add names</button>
          <button class="btn ghost small" data-action="allPresent">Everyone present</button>
          <button class="btn ghost small" data-action="resetHistory" title="Forget who has already worked together">Reset partners</button>
        </div>
      </section>

      <section class="panel">
        <h2><span class="step">2</span> Rounds</h2>
        ${session ? `<select data-change="selectSession" aria-label="Session">
          ${[['In this browser', db.sessions], ['☁️ GitHub rounds folder', folderSessions()]].filter(([, list]) => list.length)
            .map(([label, list]) => `<optgroup label="${label}">${list.map((x) => `<option value="${esc(x.id)}" ${x.id === session.id ? 'selected' : ''}>${esc(x.title)}${x.level ? ` (${esc(x.level)})` : ''}</option>`).join('')}</optgroup>`).join('')}
        </select>` : '<p class="empty">No lessons yet. Create one with AI, import a .json file, start a new one, or add files to the GitHub rounds folder.</p>'}
        ${roundsFolderErrors()}
        <div class="row wrap">
          <button class="btn primary soft" data-action="openAi">✨ Create with AI</button>
          <button class="btn ghost small" data-action="newSession" title="Write a new set of rounds by hand">➕ New</button>
          <button class="btn ghost small" data-action="openImport">📥 Import</button>
          ${session ? `<button class="btn ghost small" data-action="openPreview" title="Step through every screen of this session">👁️ Preview</button>
          <button class="btn ghost small" data-action="openEditor">✏️ Edit</button>
          <button class="btn ghost small" data-action="exportSession" title="Download as .json (to upload to the GitHub rounds folder)">⬇️ Export</button>
          ${session.fromGitHub ? '' : '<button class="btn ghost small" data-action="deleteSession" title="Delete this session">🗑️</button>'}`
            : ''}
        </div>
        ${session ? `<ol class="round-list">${session.rounds.map(roundRow).join('')}</ol>` : ''}
      </section>

      <section class="panel start-panel">
        <h2><span class="step">3</span> Start</h2>
        <div class="field"><span>Minutes per round</span>
          <div class="stepper">
            <button class="btn ghost" data-action="minutes" data-d="-1" aria-label="Less">−</button>
            <b>${s.minutes}</b>
            <button class="btn ghost" data-action="minutes" data-d="1" aria-label="More">+</button>
          </div>
        </div>
        <div class="field"><span>Default groups</span>
          <div class="seg">${Object.entries(GROUP_MODES).map(([k, label]) => `<button class="${s.groupMode === k ? 'on' : ''}" data-action="groupMode" data-v="${k}">${label}</button>`).join('')}</div>
        </div>
        <div class="field"><span>Notebook note after each round</span>
          <div class="seg">${NOTE_OPTIONS.map((n) => `<button class="${s.noteSeconds === n ? 'on' : ''}" data-action="noteSeconds" data-v="${n}">${n ? `${n}s` : 'Off'}</button>`).join('')}</div>
        </div>
        <div class="field"><span>Sound</span>
          <div class="seg"><button class="${s.sound ? 'on' : ''}" data-action="sound" data-v="1">On</button><button class="${s.sound ? '' : 'on'}" data-action="sound" data-v="0">Off</button></div>
        </div>
        <button class="btn start" data-action="start" ${present.length < 2 || !session ? 'disabled' : ''}>▶ Start class</button>
        <p class="muted small center">${!session ? 'Choose or create a lesson to start.' : (present.length < 2 ? 'Add at least 2 students to start.' : `${present.length} students · ${session.rounds.length} rounds`)}</p>
        <p class="muted small keys"><kbd>Space</kbd> start / pause · <kbd>→</kbd> next · <kbd>+</kbd><kbd>−</kbd> minute · <kbd>F</kbd> fullscreen</p>
      </section>
    </div>
  </div>`;
  if (pending) $('#namesInput').value = pending;
}

// ---------- live stage ----------

function fmtTime(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function timerRemaining() {
  const t = db.live.timer;
  return t.endAt ? Math.max(0, t.endAt - Date.now()) : t.remaining;
}

// Seat letter: A (filled) starts, B, C and D follow. The same letters label the jobs.
function seat(i) {
  return `<span class="seat${i ? '' : ' first'}">${'ABCD'[i]}</span>`;
}

function nameSpan(id, i) {
  return `<span class="nm">${seat(i)}${esc(nameOf(id))}</span>`;
}

function groupStrip(groups) {
  return `<footer class="group-strip">${groups.map((g, i) => `<span class="gchip"><b>${i + 1}</b>${g.map(nameSpan).join('')}</span>`).join('')}</footer>`;
}

// The A / B / C / D jobs for this round. A and B trade jobs at the halfway
// swap; D does the same job as C.
function ownJobs(round) {
  return (round.type === 'roleplay' && round.roles) || (round.type === 'defend' && round.options) || [];
}

// After the swap, C (and D) join in where their job was mostly watching, unless
// the round gives C a role or option of their own.
function joinsAfterSwap(round) {
  const t = ROUND_TYPES[round.type] || ROUND_TYPES.topic;
  return t.joinAfterSwap && !ownJobs(round)[2] ? t.joinAfterSwap : null;
}

// The halfway message, mentioning C when some groups are trios or fours.
function swapMessage(round, groups) {
  const t = ROUND_TYPES[round.type] || ROUND_TYPES.topic;
  return joinsAfterSwap(round) && groups.some((g) => g.length > 2) ? t.swapTrio : t.swap;
}

function roleChips(round, L) {
  const t = ROUND_TYPES[round.type] || ROUND_TYPES.topic;
  const own = ownJobs(round);
  const jobs = (t.roles[3] ? t.roles : [...t.roles, t.roles[2]]).map((job, i) => own[i] || job);
  if (L.swapped && t.swaps !== false) [jobs[0], jobs[1]] = [jobs[1], jobs[0]];
  const join = L.swapped && joinsAfterSwap(round);
  if (join) [jobs[2], jobs[3]] = join;
  const chip = (i) => `<span class="role">${seat(i)}${esc(jobs[i])}</span>`;
  const biggest = Math.max(...L.groups.map((g) => g.length));
  const extra = [2, 3].filter((i) => i < biggest).map(chip).join('');
  return `<div class="extras">${chip(0)}${round.type === 'defend' ? '<span class="vs">vs</span>' : ''}${chip(1)}${extra}
    ${L.swapped && t.swaps === false ? `<span class="role now">${esc(t.swap)}</span>` : ''}</div>`;
}

// "Ana", "Ana and Leo", "Ana, Leo and Sara"
function listNames(parts) {
  return parts.length < 3 ? parts.join(' and ') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function talkMain(round, L) {
  const img = round.type === 'picture' ? roundImage(round) : '';
  const picture = round.type === 'picture'
    ? `<figure class="task-image">${img
      ? `<img src="${esc(img)}" alt="${esc(round.imageQuery || round.title)}" onerror="imageFailed()">`
      : '<div class="img-placeholder">🖼️ Loading picture…</div>'}
      ${L.preview ? '' : '<button class="icon-btn reroll" data-action="rerollImage" title="Another picture">↻</button>'}</figure>`
    : '';
  return `
    <div class="task-head">
      <h1 class="task-title">${esc(round.title)}</h1>
      ${roleChips(round, L)}
    </div>
    <div class="talk-grid ${picture ? 'with-image' : ''}">
      ${picture}
      <div class="tiers">
        <div class="tier S"><div class="tier-label"><span class="tier-num">1</span>Support</div>
          <p>${esc(round.support)}</p>
          ${round.words && round.words.length ? `<div class="words">${round.words.map((w) => `<span>${esc(w)}</span>`).join('')}</div>` : ''}
        </div>
        <div class="tier C"><div class="tier-label"><span class="tier-num">2</span>Challenge</div>
          <p>${esc(round.challenge)}</p>
        </div>
      </div>
    </div>`;
}

function renderLive(L = db.live) {
  const round = L.rounds[L.index];
  const type = ROUND_TYPES[round.type] || ROUND_TYPES.topic;
  const isLast = L.index >= L.rounds.length - 1;
  let controls = '';
  let main = '';
  let footer = '';
  let timer = '';

  if (L.phase === 'groups') {
    timer = fmtTime(L.timer.remaining);
    controls = `
      <button class="btn ghost" data-action="shuffleGroups" title="New groups">🔀 Shuffle</button>
      <span class="seg small">${Object.entries(GROUP_NAMES).map(([n, label]) => `<button class="${L.groupSize === Number(n) ? 'on' : ''}" data-action="groupSize" data-v="${n}">${label}</button>`).join('')}</span>
      <button class="btn ghost" data-action="addMinute" data-d="-1" title="−1 minute (−)">−1</button>
      <button class="btn ghost" data-action="addMinute" data-d="1" title="+1 minute (+)">+1</button>
      <button class="btn primary" data-action="goTalk" title="Space">▶ Start</button>`;
    main = `
      <div class="groups-head">
        <div class="kicker">Round ${L.index + 1} of ${L.rounds.length} · ${type.icon} ${type.name}</div>
        <h1>Find your ${L.groupSize > 2 ? 'group' : 'partner'}!</h1>
      </div>
      <div class="group-grid" style="--n:${L.groups.length}">
        ${L.groups.map((g, i) => `<div class="group-card"><span class="gnum">${i + 1}</span><div class="gnames">${g.map(nameSpan).join('')}</div></div>`).join('')}
      </div>`;
  } else if (L.phase === 'talk') {
    const paused = !L.timer.endAt;
    timer = fmtTime(L.preview ? L.timer.remaining : timerRemaining());
    controls = `
      ${L.pictureWaiting ? '<button class="btn primary" data-action="nextPicture" title="N">🖼️ Show next picture</button>' : ''}
      ${L.timeUp ? '<button class="btn primary" data-action="stopRound" title="Space">✏️ Notebook →</button>' : `
      <button class="btn ghost" data-action="addMinute" data-d="-1" title="−1 minute (−)">−1</button>
      <button class="btn ghost" data-action="addMinute" data-d="1" title="+1 minute (+)">+1</button>
      <button class="btn ghost" data-action="togglePause" title="Space">${paused ? '▶ Resume' : '⏸ Pause'}</button>
      <button class="btn danger" data-action="stopRound" title="→">⏹ Stop round</button>`}`;
    main = talkMain(round, L);
    footer = groupStrip(L.groups);
  } else if (L.phase === 'note') {
    timer = fmtTime(L.noteEnd - Date.now());
    controls = '<button class="btn primary" data-action="goReport" title="Space">Done →</button>';
    main = `<div class="center-stage">
        <div class="big-emoji">✏️</div>
        <div class="kicker">Notebook · one line!</div>
        <h1 class="mission">${esc(L.mission)}</h1>
      </div>`;
    footer = groupStrip(L.groups);
  } else if (L.phase === 'report') {
    const group = L.groups.find((g) => g.includes(L.reporter)) || [];
    const partners = group.filter((id) => id !== L.reporter).map((id) => `<b>${esc(nameOf(id))}</b>`);
    controls = `
      <button class="btn ghost" data-action="pickAgain">🎲 Someone else</button>
      <button class="btn primary" data-action="nextRound" title="Space">${isLast ? 'Finish 🏁' : 'Next round →'}</button>`;
    main = `<div class="center-stage report">
        <div class="kicker">🎤 Report back</div>
        <div class="reporter" id="reporterName">${esc(nameOf(L.reporter))}</div>
        ${partners.length ? `<p class="report-sub">Tell the class what ${listNames(partners)} said.</p>` : ''}
        ${L.mission ? `<p class="report-mission">📓 ${esc(L.mission)}</p>` : ''}
      </div>`;
  } else if (L.phase === 'end') {
    controls = '<button class="btn primary" data-action="finishLive">Back to setup</button>';
    main = `<div class="center-stage">
        <div class="big-emoji">🎉</div>
        <h1 class="mission">Great speaking today!</h1>
        <p class="report-sub">${L.rounds.length} rounds${L.preview ? '' : ` · ${Object.keys(L.reportCounts).length} students reported back`}</p>
      </div>`;
  }

  const P = L.preview;
  if (P) {
    timer = P.timer;
    controls = `
      <span class="preview-step"><b>${P.label}</b> ${preview.pos + 1}/${preview.steps.length}</span>
      <button class="btn ghost" data-action="previewPrev" title="← (↑ previous round)" ${preview.pos ? '' : 'disabled'}>◀ Prev</button>
      <button class="btn primary" data-action="previewNext" title="→ (↓ next round)" ${preview.pos < preview.steps.length - 1 ? '' : 'disabled'}>Next ▶</button>`;
  }

  $('#app').innerHTML = `
  <div class="stage phase-${L.phase} t-${round.type}">
    <header class="stage-bar">
      <div class="stage-left">
        ${P ? '<span class="preview-badge">👁️ Preview</span>' : ''}
        <span class="type-chip t-${round.type}">${type.icon} ${type.name}</span>
        <span class="round-count">${L.index + 1}/${L.rounds.length}</span>
      </div>
      <div class="timer ${L.phase === 'talk' && !L.timer.endAt && !P ? 'paused' : ''}" id="timer">${timer}</div>
      <div class="stage-controls">${controls}
        <button class="icon-btn" data-action="fullscreen" title="Fullscreen (F)">⛶</button>
        <button class="icon-btn" data-action="${P ? 'exitPreview' : 'exitLive'}" title="Back to setup${P ? ' (Esc)' : ''}">✕</button>
      </div>
    </header>
    <div class="progress"><div id="progressFill" ${P ? `style="width:${P.progress}%"` : ''}></div></div>
    <main class="stage-main">${main}</main>
    ${footer}
    ${P && P.nudge ? `<div class="nudge show still" id="nudge">${esc(P.nudge)}</div>` : '<div class="nudge" id="nudge"></div>'}
  </div>`;
  tick();
}

// ---------- preview ----------

// Every screen of a session, in class order. Nothing here is saved, timed or
// recorded: groups are a sample, partner history and report counts are untouched.
function previewSteps(rounds) {
  const steps = [];
  rounds.forEach((r, index) => {
    steps.push({ index, phase: 'groups', label: 'Groups' });
    steps.push({ index, phase: 'talk', label: 'Talk' });
    steps.push({ index, phase: 'talk', swapped: true, label: 'Swap' });
    if (r.type === 'picture') steps.push({ index, phase: 'talk', swapped: true, nextPicture: true, label: 'Next picture' });
    if (db.settings.noteSeconds > 0) steps.push({ index, phase: 'note', label: 'Notebook' });
    steps.push({ index, phase: 'report', label: 'Report back' });
  });
  steps.push({ index: rounds.length - 1, phase: 'end', label: 'End' });
  return steps;
}

function openPreview() {
  const session = currentSession();
  if (!session) return;
  const cls = ensureClass();
  let students = cls.students.filter((s) => !s.absent);
  if (students.length < 2) students = DEMO_STUDENTS;
  const ids = students.map((s) => s.id);
  const levels = Object.fromEntries(students.map((s) => [s.id, s.level]));
  const rounds = clone(session.rounds);
  // Sample groups that rotate like a real class, using a throwaway copy of the history.
  const history = clone(cls.history || {});
  const sizes = rounds.map((r, i) => sizeForRound(r, i));
  let busy = [];
  const groups = rounds.map((r, i) => {
    const { supportSlots } = ROUND_TYPES[r.type] || ROUND_TYPES.topic;
    const g = Logic.makeGroups(ids, sizes[i], history, levels, { busy }).map((x) => Logic.orderGroup(x, levels, supportSlots));
    Logic.recordGroups(history, g);
    busy = Logic.onDuty(g, levels);
    return g;
  });
  preview = { rounds, sizes, groups, steps: previewSteps(rounds), pos: 0 };
  view = 'preview';
  render();
  ensureImages(rounds).then((found) => { if (found && view === 'preview') render(); });
}

// The state renderLive() needs for the current preview step.
function previewStage() {
  const step = preview.steps[preview.pos];
  const i = step.index;
  const base = preview.rounds[i];
  const rounds = preview.rounds.slice();
  if (step.nextPicture) {
    rounds[i] = { ...base };
    advancePicture(rounds[i]);
  }
  const total = db.settings.minutes * 60000;
  const groups = preview.groups[i];
  const g = groups[(i * 3) % groups.length];
  const t = ROUND_TYPES[base.type] || ROUND_TYPES.topic;
  const timers = { groups: total, talk: step.swapped ? total / 2 : total, note: db.settings.noteSeconds * 1000 };
  return {
    preview: {
      label: step.label,
      timer: step.phase in timers ? fmtTime(timers[step.phase]) : '',
      progress: step.swapped ? 50 : 0,
      nudge: step.swapped && !step.nextPicture ? swapMessage(base, groups) : '',
    },
    rounds,
    index: i,
    phase: step.phase,
    groups,
    groupSize: preview.sizes[i],
    swapped: !!step.swapped,
    timer: { total, remaining: timers[step.phase] || total, endAt: null },
    mission: t.notebook,
    reporter: g[i % g.length],
    reportCounts: {},
  };
}

function previewGo(d) {
  const pos = Math.max(0, Math.min(preview.steps.length - 1, preview.pos + d));
  if (pos !== preview.pos) { preview.pos = pos; render(); }
}

// Jump to the first screen of the previous / next round (or to the end).
function previewRound(d) {
  const { steps } = preview;
  const cur = steps[preview.pos];
  const first = steps.findIndex((s) => s.index === cur.index);
  let pos;
  if (d > 0) {
    pos = steps.findIndex((s, k) => k > preview.pos && (s.index > cur.index || s.phase === 'end'));
  } else {
    // Mid-round (or on the end screen): back to this round's start; else the round before.
    pos = preview.pos > first ? first : steps.findIndex((s) => s.index === Math.max(0, cur.index - 1));
  }
  if (pos >= 0 && pos !== preview.pos) { preview.pos = pos; render(); }
}

function exitPreview() {
  preview = null;
  view = 'setup';
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  render();
}

function tick() {
  const L = db.live;
  if (view !== 'live' || !L) return;
  const timerEl = $('#timer');
  const fill = $('#progressFill');
  if (L.phase === 'talk') {
    const rem = timerRemaining();
    if (timerEl) {
      timerEl.textContent = fmtTime(rem);
      timerEl.classList.toggle('low', rem <= 30000);
    }
    if (fill) fill.style.width = `${Math.min(100, 100 - (rem / L.timer.total) * 100)}%`;
    if (!L.swapped && L.timer.endAt && rem <= L.timer.total / 2) swapHalfway();
    if (rem <= 0 && !L.timeUp) timeUp();
  } else if (L.phase === 'note') {
    const rem = L.noteEnd - Date.now();
    if (timerEl) timerEl.textContent = fmtTime(rem);
    if (fill) fill.style.width = `${Math.min(100, 100 - (rem / (db.settings.noteSeconds * 1000 || 1)) * 100)}%`;
    if (rem <= 0) goReport();
  } else if (fill) {
    fill.style.width = '0%';
  }
}

function showNudge(text) {
  const el = $('#nudge');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  sfx.chime();
  clearTimeout(nudgeHandle);
  nudgeHandle = setTimeout(() => el.classList.remove('show'), 8000);
}

// Halfway: A and B swap jobs (the chips on screen flip) and a chime says so.
// In picture rounds picture 1 stays up so the partner who couldn't look can
// check it; once students have changed places the teacher taps "Show next picture".
function swapHalfway() {
  const L = db.live;
  const round = L.rounds[L.index];
  L.swapped = true;
  if (round.type === 'picture' && hasNextPicture(round)) {
    L.pictureWaiting = true;
    const next = { ...round };
    advancePicture(next);
    new Image().src = roundImage(next); // preload
  }
  save();
  render();
  showNudge(swapMessage(round, L.groups));
}

function showNextPicture() {
  const L = db.live;
  if (!L.pictureWaiting) return;
  advancePicture(L.rounds[L.index]);
  L.pictureWaiting = false;
  save();
  render();
}

function presentIds() {
  const cls = liveClass();
  return cls ? cls.students.filter((s) => !s.absent).map((s) => s.id) : [];
}

// A round's own group size wins; otherwise the default from the Start panel.
function sizeForRound(round, i) {
  if (round && round.group) return round.group;
  const mode = db.settings.groupMode;
  if (mode === 'trios') return 3;
  if (mode === 'mix') return i % 2 ? 3 : 2;
  return 2;
}

function buildGroups() {
  const L = db.live;
  const ids = presentIds();
  const levels = Object.fromEntries(ids.map((id) => [id, levelOf(id)]));
  const { supportSlots } = ROUND_TYPES[L.rounds[L.index].type] || ROUND_TYPES.topic;
  L.groups = Logic.makeGroups(ids, L.groupSize, liveClass().history || {}, levels, { busy: L.busy || [] })
    .map((g) => Logic.orderGroup(g, levels, supportSlots));
}

function prepareRound() {
  const L = db.live;
  L.phase = 'groups';
  L.groupSize = sizeForRound(L.rounds[L.index], L.index);
  // Sparks who were with a Support student last round get this round off.
  const last = L.groups || [];
  L.busy = Logic.onDuty(last, Object.fromEntries(last.flat().map((id) => [id, levelOf(id)])));
  L.swapped = false;
  L.pictureWaiting = false;
  L.timeUp = false;
  L.reporter = null;
  L.mission = '';
  L.timer = { total: db.settings.minutes * 60000, remaining: db.settings.minutes * 60000, endAt: null };
  buildGroups();
}

function startClass() {
  const cls = ensureClass();
  const session = currentSession();
  if (!session) { toast('Choose or create a lesson first.'); return; }
  if (cls.students.filter((s) => !s.absent).length < 2) { toast('Add at least 2 students first.'); return; }
  db.live = {
    classId: cls.id,
    title: session.title,
    rounds: clone(session.rounds),
    index: 0,
    reportCounts: {},
    lastReporter: null,
  };
  prepareRound();
  enterLive();
  ensureImages(db.live.rounds).then((found) => { if (found && view === 'live') render(); });
}

function enterLive() {
  view = 'live';
  save();
  render();
  clearInterval(tickHandle);
  tickHandle = setInterval(tick, 250);
  requestWakeLock();
}

function exitLive() {
  view = 'setup';
  clearInterval(tickHandle);
  clearTimeout(spinHandle);
  releaseWakeLock();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  save();
  render();
}

function goTalk() {
  const L = db.live;
  if (L.phase !== 'groups') return;
  const cls = liveClass();
  cls.history = Logic.recordGroups(cls.history || {}, L.groups);
  L.phase = 'talk';
  L.timer.endAt = Date.now() + L.timer.remaining;
  save();
  render();
}

function timeUp() {
  const L = db.live;
  if (L.phase !== 'talk') return;
  L.timer.remaining = 0;
  L.timer.endAt = null;
  const round = L.rounds[L.index];
  // Picture rounds: stop here with the picture still up, so the partner who
  // couldn't look can check it. The teacher moves on to the notebook.
  if (round.type === 'picture' && roundImage(round) && !L.timeUp) {
    L.timeUp = true;
    sfx.bell();
    save();
    render();
    return;
  }
  if (!L.timeUp) sfx.bell();
  L.timeUp = false;
  const secs = db.settings.noteSeconds;
  L.mission = (ROUND_TYPES[L.rounds[L.index].type] || ROUND_TYPES.topic).notebook;
  if (secs > 0) {
    L.phase = 'note';
    L.noteEnd = Date.now() + secs * 1000;
    save();
    render();
  } else {
    goReport();
  }
}

function goReport() {
  const L = db.live;
  if (L.phase !== 'note' && L.phase !== 'talk') return;
  L.phase = 'report';
  pickReporter();
}

function pickReporter() {
  const L = db.live;
  const ids = L.groups.flat();
  L.reporter = Logic.pickReporter(ids, L.reportCounts, L.lastReporter || L.reporter);
  L.lastReporter = L.reporter;
  L.reportCounts[L.reporter] = (L.reportCounts[L.reporter] || 0) + 1;
  save();
  render();
  spinTo(L.reporter, ids);
}

// Slot-machine style name roll that slows down and lands on the picked student.
function spinTo(finalId, ids) {
  const el = $('#reporterName');
  if (!el || ids.length < 2) return;
  clearTimeout(spinHandle);
  el.classList.add('spinning');
  let delay = 45;
  let elapsed = 0;
  const step = () => {
    elapsed += delay;
    if (elapsed < 1900) {
      el.textContent = nameOf(ids[Math.floor(Math.random() * ids.length)]);
      sfx.tick();
      delay *= 1.13;
      spinHandle = setTimeout(step, delay);
    } else {
      el.textContent = nameOf(finalId);
      el.classList.remove('spinning');
      el.classList.add('landed');
      sfx.fanfare();
    }
  };
  step();
}

function nextRound() {
  const L = db.live;
  clearTimeout(spinHandle);
  if (L.index >= L.rounds.length - 1) {
    L.phase = 'end';
    sfx.fanfare();
  } else {
    L.index += 1;
    prepareRound();
  }
  save();
  render();
}

function togglePause() {
  const L = db.live;
  if (L.phase !== 'talk') return;
  if (L.timeUp) return timeUp();
  if (L.timer.endAt) {
    L.timer.remaining = timerRemaining();
    L.timer.endAt = null;
  } else {
    L.timer.endAt = Date.now() + L.timer.remaining;
  }
  save();
  render();
}

function addMinute(d) {
  const L = db.live;
  if ((L.phase !== 'talk' && L.phase !== 'groups') || L.timeUp) return;
  const rem = timerRemaining();
  const delta = d > 0 ? 60000 : -Math.min(60000, Math.max(0, rem - 10000));
  if (!delta) return;
  L.timer.total = Math.max(10000, L.timer.total + delta);
  if (L.timer.endAt) L.timer.endAt += delta;
  else L.timer.remaining += delta;
  save();
  render();
}

// Called from the <img onerror>: skip broken hotlinks to the next candidate.
window.imageFailed = function imageFailed() {
  const round = view === 'preview'
    ? preview && preview.rounds[preview.steps[preview.pos].index]
    : db.live && db.live.rounds[db.live.index];
  if (!round) return;
  // In preview the screen may show a copy (the "next picture" step); move the stored index.
  const shown = view === 'preview' ? previewStage().rounds[preview.steps[preview.pos].index] : round;
  const key = imageIdxKey(shown);
  round.failures = (round.failures || 0) + 1;
  if (round.failures < imageCandidates(shown).length) {
    round[key] = (round[key] || 0) + 1;
    render();
  }
};

async function requestWakeLock() {
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch { wakeLock = null; }
}

function releaseWakeLock() {
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {});
}

// ---------- AI prompt & import ----------

function aiModalHtml() {
  const ai = { ...DEFAULT_SETTINGS.ai, ...db.settings.ai };
  return `
  <header class="modal-head"><h2>✨ Create rounds with AI</h2><button class="icon-btn" data-action="closeModal" aria-label="Close">✕</button></header>
  <div class="modal-body">
    <section class="ai-step">
      <h3><span class="step">1</span> Describe your lesson</h3>
      <label class="field"><span>Theme / unit</span>
        <input id="aiTheme" value="${esc(ai.theme)}" placeholder="Unit 1: study and career plans after 4º ESO"></label>
      <div class="row wrap">
        <label class="field grow"><span>Course</span>
          <select id="aiCourse">${COURSES.map((c) => `<option ${c === ai.course ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <label class="field narrow"><span>Rounds</span>
          <input id="aiRounds" type="number" min="1" max="12" value="${Number(ai.rounds) || 7}"></label>
      </div>
      <div class="field"><span>Round types</span>
        <div class="type-picks" id="aiTypes">${Logic.TYPE_KEYS.map((t) => `<label class="type-pick"><input type="checkbox" value="${t}" ${ai.types.includes(t) ? 'checked' : ''}> ${ROUND_TYPES[t].icon} ${ROUND_TYPES[t].name}</label>`).join('')}</div>
      </div>
      <div class="field"><span>Group sizes the AI can use (it picks one per round)</span>
        <div class="type-picks" id="aiGroups">${Object.entries(GROUP_NAMES).map(([n, label]) => `<label class="type-pick"><input type="checkbox" value="${n}" ${(ai.groups || [2, 3]).includes(Number(n)) ? 'checked' : ''}> ${label}</label>`).join('')}</div>
      </div>
      <label class="field"><span>Extra note for the AI (optional)</span>
        <input id="aiNote" value="${esc(ai.note)}" placeholder="e.g. use vocabulary: skills, qualifications, apply for"></label>
      <div class="row wrap">
        <button class="btn primary" data-action="copyPrompt">📋 Copy prompt</button>
        <span class="muted" id="copyMsg"></span>
      </div>
      <p class="muted small">Paste it into <a href="https://chatgpt.com" target="_blank" rel="noopener">ChatGPT</a>,
        <a href="https://claude.ai" target="_blank" rel="noopener">Claude</a> or
        <a href="https://gemini.google.com" target="_blank" rel="noopener">Gemini</a>, then copy its answer back here.</p>
      <details><summary>Show prompt</summary><pre id="aiPromptPreview"></pre></details>
    </section>
    <section class="ai-step">
      <h3><span class="step">2</span> Paste the AI's answer</h3>
      <textarea id="aiPaste" rows="7" placeholder='{ "title": "...", "rounds": [ ... ] }'></textarea>
      <div class="row wrap">
        <button class="btn primary" data-action="importPaste">📥 Import rounds</button>
        <label class="btn ghost small file-btn">📂 Open .json file<input type="file" accept=".json,.txt,application/json" data-change="importFile" hidden></label>
      </div>
      <p class="error" id="importError"></p>
    </section>
  </div>`;
}

function readAiForm() {
  const ai = {
    theme: $('#aiTheme').value.trim(),
    course: $('#aiCourse').value,
    rounds: Math.max(1, Math.min(12, Number($('#aiRounds').value) || 7)),
    types: [...document.querySelectorAll('#aiTypes input:checked')].map((i) => i.value),
    groups: [...document.querySelectorAll('#aiGroups input:checked')].map((i) => Number(i.value)),
    note: $('#aiNote').value.trim(),
  };
  db.settings.ai = ai;
  save();
  return ai;
}

function importText(text) {
  const errEl = $('#importError');
  try {
    const parsed = Logic.normalizeSession(Logic.extractJson(text));
    const session = { id: uid(), ...parsed };
    db.sessions.unshift(session);
    db.settings.sessionId = session.id;
    save();
    closeTopModal();
    render();
    toast(`✅ Imported ${session.rounds.length} rounds`);
    ensureImages(session.rounds).then((found) => { if (found && view === 'setup') render(); });
  } catch (err) {
    if (errEl) errEl.textContent = err.message;
  }
}

// ---------- session editor ----------

function editorRound(r, i, n) {
  const typeSel = `<select data-change="draftType" data-i="${i}">${Logic.TYPE_KEYS.map((t) => `<option value="${t}" ${t === r.type ? 'selected' : ''}>${ROUND_TYPES[t].icon} ${ROUND_TYPES[t].name}</option>`).join('')}</select>`;
  const groupSel = `<select data-change="draftGroup" data-i="${i}" aria-label="Groups" title="Group size for this round">
    <option value="">👥 Default</option>${Object.entries(GROUP_NAMES).map(([n, label]) => `<option value="${n}" ${Number(n) === r.group ? 'selected' : ''}>👥 ${label}</option>`).join('')}</select>`;
  let special = '';
  if (r.type === 'picture') {
    const img = roundImage(r);
    special = `<div class="edit-picture">
      ${img ? `<img src="${esc(img)}" alt="">` : '<span class="thumb empty">🖼️</span>'}
      <div class="grow">
        <label class="field"><span>Image search words</span><input data-input="field" data-i="${i}" data-f="imageQuery" value="${esc(r.imageQuery)}"></label>
        <label class="field"><span>Second picture, after the swap (same theme, a different scene)</span><input data-input="field" data-i="${i}" data-f="imageQuery2" value="${esc(r.imageQuery2 || '')}" placeholder="e.g. farmer selling vegetables at market"></label>
        <button class="btn ghost small" data-action="pickImage" data-i="${i}">🔍 Choose picture</button>
      </div></div>`;
  } else if (r.type === 'roleplay') {
    const roles = r.roles || ['', ''];
    special = `<div class="row">${[0, 1].map((k) => `<label class="field grow"><span>Role ${'AB'[k]}</span><input data-input="list" data-i="${i}" data-f="roles" data-k="${k}" value="${esc(roles[k] || '')}"></label>`).join('')}</div>`;
  } else if (r.type === 'defend') {
    const options = r.options || ['', ''];
    special = `<div class="row">${[0, 1].map((k) => `<label class="field grow"><span>Side ${'AB'[k]}</span><input data-input="list" data-i="${i}" data-f="options" data-k="${k}" value="${esc(options[k] || '')}"></label>`).join('')}</div>`;
  }
  return `<div class="edit-round t-${r.type}">
    <div class="row">
      <span class="rnum">${i + 1}</span>${typeSel}${groupSel}
      <input class="grow" data-input="field" data-i="${i}" data-f="title" value="${esc(r.title)}" placeholder="Title" aria-label="Title">
      <button class="icon-btn" data-action="moveRound" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button>
      <button class="icon-btn" data-action="moveRound" data-i="${i}" data-d="1" ${i === n - 1 ? 'disabled' : ''} title="Move down">↓</button>
      <button class="icon-btn" data-action="deleteRound" data-i="${i}" title="Delete round">🗑️</button>
    </div>
    ${special}
    <div class="row edit-tiers">
      <label class="field grow tier-field S"><span>Support</span><textarea rows="2" data-input="field" data-i="${i}" data-f="support">${esc(r.support)}</textarea></label>
      <label class="field grow tier-field C"><span>Challenge</span><textarea rows="2" data-input="field" data-i="${i}" data-f="challenge">${esc(r.challenge)}</textarea></label>
    </div>
    <label class="field"><span>Helpful phrases for support (one per line)</span><textarea rows="2" data-input="words" data-i="${i}">${esc((r.words || []).join('\n'))}</textarea></label>
  </div>`;
}

function editorHtml() {
  return `
  <header class="modal-head"><h2>✏️ Edit rounds</h2><button class="icon-btn" data-action="closeModal" aria-label="Close">✕</button></header>
  <div class="modal-body">
    ${draft.fromGitHub ? '<p class="muted small">This lesson comes from the GitHub rounds folder: saving keeps your own copy in this browser. To change it on every device, ⬇️ Export it and upload it to the folder again.</p>' : ''}
    <div class="row">
      <label class="field grow"><span>Session title</span><input data-input="session" data-f="title" value="${esc(draft.title)}"></label>
      <label class="field narrow"><span>Level</span><input data-input="session" data-f="level" value="${esc(draft.level || '')}"></label>
    </div>
    ${draft.rounds.map((r, i) => editorRound(r, i, draft.rounds.length)).join('')}
    <button class="btn ghost" data-action="addRound">➕ Add round</button>
  </div>
  <footer class="modal-foot">
    <button class="btn ghost" data-action="closeModal">Cancel</button>
    <button class="btn primary" data-action="saveDraft">💾 Save</button>
  </footer>`;
}

function rerenderEditor() {
  const modal = $('.modal.editor');
  if (!modal) return;
  const body = $('.modal-body', modal);
  const scroll = body ? body.scrollTop : 0;
  modal.innerHTML = editorHtml();
  $('.modal-body', modal).scrollTop = scroll;
}

function openImagePicker(i) {
  const r = draft.rounds[i];
  const m = openModal(`
    <header class="modal-head"><h2>🖼️ Choose a picture</h2><button class="icon-btn" data-action="closeModal" aria-label="Close">✕</button></header>
    <div class="modal-body">
      <div class="row">
        <input id="imgQuery" class="grow" value="${esc(r.imageQuery || r.title)}" data-enter="imgSearch" aria-label="Search words">
        <button class="btn primary" data-action="imgSearch">Search</button>
        <label class="btn ghost file-btn">⬆️ Upload<input type="file" accept="image/*" data-change="imgUpload" hidden></label>
      </div>
      <div class="row">
        <input id="imgUrl" class="grow" placeholder="…or paste an image URL" data-enter="imgUseUrl" aria-label="Image URL">
        <button class="btn ghost" data-action="imgUseUrl">Use URL</button>
      </div>
      <p class="muted" id="imgStatus"></p>
      <div class="img-grid" id="imgResults"></div>
    </div>`, 'picker');
  m.dataset.i = String(i);
  runImageSearch();
}

async function runImageSearch() {
  const q = $('#imgQuery').value.trim();
  if (!q) return;
  $('#imgStatus').textContent = 'Searching…';
  $('#imgResults').innerHTML = '';
  const items = await searchImages(q, 24);
  if (!$('#imgResults')) return;
  $('#imgStatus').textContent = items.length ? 'Click a picture to use it.' : 'No pictures found. Try other words.';
  $('#imgResults').innerHTML = items.map((it) => `<button class="img-pick" data-action="imgChoose" data-url="${esc(it.url)}"><img src="${esc(it.thumb)}" alt="" loading="lazy"></button>`).join('');
}

function setDraftImage(url, query) {
  const picker = $('.modal.picker');
  const i = Number(picker.closest('.modal-backdrop').dataset.i);
  draft.rounds[i].image = url;
  if (query) draft.rounds[i].imageQuery = query;
  closeTopModal();
  rerenderEditor();
}

function saveDraft() {
  const rounds = draft.rounds.map(Logic.normalizeRound).filter(Boolean);
  if (!rounds.length) { toast('Add at least one round with some text.'); return; }
  const session = {
    id: draft.fromGitHub ? uid() : draft.id,
    title: String(draft.title || '').trim() || 'My session',
    level: String(draft.level || '').trim(),
    rounds,
  };
  if (draft.fromGitHub && session.title === draft.title) session.title = `${session.title} (my copy)`;
  const idx = db.sessions.findIndex((s) => s.id === session.id);
  if (idx >= 0) db.sessions[idx] = session;
  else db.sessions.unshift(session);
  db.settings.sessionId = session.id;
  draft = null;
  save();
  closeTopModal();
  render();
  toast('💾 Saved');
  ensureImages(session.rounds).then((found) => { if (found && view === 'setup') render(); });
}

// ---------- actions ----------

const actions = {
  // class
  cycleStudent(el) {
    const cls = ensureClass();
    const st = cls.students.find((s) => s.id === el.dataset.id);
    if (!st) return;
    if (st.absent) { st.absent = false; st.level = 'N'; } else if (st.level === 'S') st.level = 'L';
    else if (st.level === 'L') st.absent = true;
    else st.level = 'S';
    save(); render();
  },
  removeStudent(el) {
    const cls = ensureClass();
    cls.students = cls.students.filter((s) => s.id !== el.dataset.id);
    save(); render();
  },
  addNames() {
    const cls = ensureClass();
    const names = $('#namesInput').value.split(/[\n,;]+/).map((n) => n.trim()).filter(Boolean);
    if (!names.length) { toast('Type or paste some names first.'); return; }
    names.forEach((raw) => {
      const mark = (raw.match(/[*+★⚡\uFE0F]+$/u) || [''])[0]; // phones type ⚡ followed by an invisible \uFE0F
      const name = raw.slice(0, raw.length - mark.length).trim();
      const level = /[*★⚡]/u.test(mark) ? 'L' : (mark ? 'S' : 'N');
      if (name) cls.students.push({ id: uid(), name, level, absent: false });
    });
    $('#namesInput').value = '';
    save(); render();
    toast(`➕ Added ${names.length} name${names.length === 1 ? '' : 's'}`);
  },
  allPresent() {
    ensureClass().students.forEach((s) => { s.absent = false; });
    save(); render();
  },
  resetHistory() {
    if (!window.confirm('Forget who has worked with whom in this class?')) return;
    ensureClass().history = {};
    save(); toast('🔀 Partner history cleared');
  },
  renameClass() {
    const cls = ensureClass();
    const name = window.prompt('Class name:', cls.name);
    if (name && name.trim()) { cls.name = name.trim(); save(); render(); }
  },
  deleteClass() {
    const cls = ensureClass();
    if (!window.confirm(`Delete "${cls.name}" and its student list?`)) return;
    db.classes = db.classes.filter((c) => c.id !== cls.id);
    db.settings.classId = null;
    if (db.live && db.live.classId === cls.id) db.live = null;
    save(); render();
  },

  // sessions
  openAi() { openModal(aiModalHtml(), 'wide'); },
  openImport() {
    openModal(aiModalHtml(), 'wide');
    const paste = $('#aiPaste');
    paste.focus();
    paste.scrollIntoView({ block: 'center' });
  },
  async copyPrompt() {
    const ai = readAiForm();
    if (!ai.theme) { toast('Write a theme first.'); $('#aiTheme').focus(); return; }
    const prompt = Logic.buildAiPrompt(ai);
    $('#aiPromptPreview').textContent = prompt;
    const ok = await copyText(prompt);
    $('#copyMsg').textContent = ok ? '✅ Copied! Now paste it into your AI chat.' : 'Could not copy: open "Show prompt" and copy it by hand.';
  },
  importPaste() { importText($('#aiPaste').value); },
  openEditor() {
    const session = currentSession();
    if (!session) { actions.newSession(); return; }
    draft = clone(session);
    openModal(editorHtml(), 'wide editor');
  },
  newSession() {
    draft = { id: uid(), title: '', level: '', rounds: [{ type: 'topic', title: '', support: '', challenge: '', words: [] }] };
    openModal(editorHtml(), 'wide editor');
  },
  exportSession() {
    const s = currentSession();
    if (!s) return;
    const data = { title: s.title, level: s.level, rounds: s.rounds };
    const slug = s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'session';
    download(`${slug}.json`, JSON.stringify(data, null, 2));
  },
  deleteSession() {
    const s = currentSession();
    if (!s || s.fromGitHub || !window.confirm(`Delete "${s.title}"?`)) return;
    db.sessions = db.sessions.filter((x) => x.id !== s.id);
    db.settings.sessionId = (allSessions()[0] || {}).id || null;
    save(); render();
  },

  // editor
  moveRound(el) {
    const i = Number(el.dataset.i);
    const j = i + Number(el.dataset.d);
    if (j < 0 || j >= draft.rounds.length) return;
    [draft.rounds[i], draft.rounds[j]] = [draft.rounds[j], draft.rounds[i]];
    rerenderEditor();
  },
  deleteRound(el) {
    draft.rounds.splice(Number(el.dataset.i), 1);
    rerenderEditor();
  },
  addRound() {
    draft.rounds.push({ type: 'topic', title: '', support: '', challenge: '', words: [] });
    rerenderEditor();
    const body = $('.modal.editor .modal-body');
    body.scrollTop = body.scrollHeight;
  },
  pickImage(el) { openImagePicker(Number(el.dataset.i)); },
  imgSearch() { runImageSearch(); },
  imgChoose(el) { setDraftImage(el.dataset.url, $('#imgQuery').value.trim()); },
  imgUseUrl() {
    const url = $('#imgUrl').value.trim();
    if (!/^https?:\/\//.test(url)) { $('#imgStatus').textContent = 'Paste a link that starts with http.'; return; }
    setDraftImage(url);
  },
  saveDraft() { saveDraft(); },
  closeModal() { closeTopModal(); },

  // settings
  minutes(el) {
    db.settings.minutes = Math.max(1, Math.min(20, db.settings.minutes + Number(el.dataset.d)));
    save(); render();
  },
  groupMode(el) { db.settings.groupMode = el.dataset.v; save(); render(); },
  noteSeconds(el) { db.settings.noteSeconds = Number(el.dataset.v); save(); render(); },
  sound(el) { db.settings.sound = el.dataset.v === '1'; save(); render(); },
  toggleTheme() { db.settings.theme = db.settings.theme === 'dark' ? 'light' : 'dark'; save(); render(); },

  // live
  start() { startClass(); },
  resume() {
    if (!liveClass()) { db.live = null; save(); render(); return; }
    enterLive();
  },
  discardLive() { db.live = null; save(); render(); },
  finishLive() { db.live = null; exitLive(); },
  exitLive() { exitLive(); },
  fullscreen() { toggleFullscreen(); },
  shuffleGroups() { buildGroups(); save(); render(); },
  groupSize(el) { db.live.groupSize = Number(el.dataset.v); buildGroups(); save(); render(); },
  goTalk() { goTalk(); },
  togglePause() { togglePause(); },
  addMinute(el) { addMinute(Number(el.dataset.d)); },
  stopRound() { timeUp(); },
  goReport() { goReport(); },
  pickAgain() { pickReporter(); },
  nextRound() { nextRound(); },
  rerollImage() {
    const round = db.live.rounds[db.live.index];
    if (imageCandidates(round).length < 2) { toast('No other pictures for this round.'); return; }
    const key = imageIdxKey(round);
    round[key] = (round[key] || 0) + 1;
    save(); render();
  },
  nextPicture() { showNextPicture(); },
  openPreview() { openPreview(); },
  previewPrev() { previewGo(-1); },
  previewNext() { previewGo(1); },
  exitPreview() { exitPreview(); },
};

const changeHandlers = {
  selectClass(el) {
    if (el.value === '__new') {
      const name = window.prompt('New class name (e.g. 4º ESO B):');
      if (name && name.trim()) {
        const cls = { id: uid(), name: name.trim(), students: [], history: {} };
        db.classes.push(cls);
        db.settings.classId = cls.id;
      }
    } else {
      db.settings.classId = el.value;
    }
    save(); render();
  },
  selectSession(el) {
    db.settings.sessionId = el.value;
    save(); render();
    ensureImages(currentSession().rounds).then((found) => { if (found && view === 'setup') render(); });
  },
  importFile(el) {
    const file = el.files && el.files[0];
    if (!file) return;
    file.text().then(importText);
  },
  draftGroup(el) {
    const r = draft.rounds[Number(el.dataset.i)];
    if (el.value) r.group = Number(el.value);
    else delete r.group;
  },
  draftType(el) {
    const r = draft.rounds[Number(el.dataset.i)];
    r.type = el.value;
    if (r.type === 'picture' && !r.imageQuery) r.imageQuery = r.title;
    rerenderEditor();
    if (r.type === 'picture') ensureImages([r]).then(rerenderEditor);
  },
  async imgUpload(el) {
    const file = el.files && el.files[0];
    if (!file) return;
    try {
      $('#imgStatus').textContent = 'Preparing image…';
      setDraftImage(await fileToDataUrl(file));
    } catch (err) {
      $('#imgStatus').textContent = err.message;
    }
  },
};

const inputHandlers = {
  field(el) { draft.rounds[Number(el.dataset.i)][el.dataset.f] = el.value; },
  list(el) {
    const r = draft.rounds[Number(el.dataset.i)];
    const list = (r[el.dataset.f] || ['', '']).slice();
    list[Number(el.dataset.k)] = el.value;
    r[el.dataset.f] = list;
  },
  words(el) { draft.rounds[Number(el.dataset.i)].words = el.value.split('\n'); },
  session(el) { draft[el.dataset.f] = el.value; },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el, e); }
});

document.addEventListener('change', (e) => {
  const fn = e.target.dataset && changeHandlers[e.target.dataset.change];
  if (fn) fn(e.target);
});

document.addEventListener('input', (e) => {
  const fn = e.target.dataset && inputHandlers[e.target.dataset.input];
  if (fn && draft) fn(e.target);
});

document.addEventListener('keydown', (e) => {
  const tag = e.target.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

  if (e.key === 'Escape' && document.querySelector('.modal-backdrop')) { closeTopModal(); return; }
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.enter) {
    e.preventDefault();
    actions[e.target.dataset.enter]();
    return;
  }
  if (!typing && (e.key === 'Enter' || e.key === ' ') && e.target.dataset && e.target.dataset.action === 'cycleStudent') {
    e.preventDefault();
    actions.cycleStudent(e.target);
    return;
  }
  if (typing || document.querySelector('.modal-backdrop')) return;

  if (view === 'preview' && preview) {
    const keys = {
      ArrowRight: () => previewGo(1),
      ArrowLeft: () => previewGo(-1),
      ArrowDown: () => previewRound(1),
      ArrowUp: () => previewRound(-1),
      Escape: exitPreview,
      f: toggleFullscreen,
      F: toggleFullscreen,
    };
    if (keys[e.key]) { e.preventDefault(); keys[e.key](); }
    return;
  }
  if (view !== 'live' || !db.live) return;

  const phase = db.live.phase;
  const primary = { groups: goTalk, talk: togglePause, note: goReport, report: nextRound, end: () => actions.finishLive() };
  const advance = { groups: goTalk, talk: timeUp, note: goReport, report: nextRound };
  if (e.key === ' ') { e.preventDefault(); if (primary[phase]) primary[phase](); }
  else if (e.key === 'ArrowRight') { if (advance[phase]) advance[phase](); }
  else if (e.key === '+' || e.key === '=') addMinute(1);
  else if (e.key === '-') addMinute(-1);
  else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  else if (e.key === 'n' || e.key === 'N') showNextPicture();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && view === 'live') requestWakeLock();
});

render();
refreshRoundsFolder(); // also looks up pictures for the selected lesson
