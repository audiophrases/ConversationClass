# Conversation Class

A projector-first speaking app for ESL conversation classes. One screen runs the room: it pairs students, shows the task at two levels, runs the timer, asks for a one-line notebook note and picks someone to report back. There are no student devices, no recording and no scoring.

## Run it

Open `index.html` in a browser. There is no build step. It also works on GitHub Pages: deploy from the branch root.

Data (classes, sessions, the class in progress) is saved in the browser's `localStorage`, so use the same browser on the classroom computer.

## Class flow

1. **Class**: paste names (one per line; add `*` for Challenge, e.g. `Maria*`, or `+` for Support, e.g. `Leo+`; no mark = neutral). Tap a name to cycle **neutral → + Support → ★ Challenge → Absent**. Level marks are only shown on this setup screen, never on the projector.
2. **Rounds**: pick a session (two starter packs are included), create one with AI, or import JSON.
3. **Start**: set minutes per round (default 5), default groups (pairs / trios / mix), notebook time and sound.

**Group size per round.** Each round can have its own size, pairs, trios or fours: set it with the 👥 menu in **✏️ Edit** (👥 Default follows the Start panel), or let the AI choose. The round list shows each round's size, e.g. *Debate · Trios*. The starter packs run debates in trios (C judges) and problem solving in fours.

Each round runs through these steps:

| Step | Screen | Teacher controls |
| --- | --- | --- |
| Groups | Numbered groups; each name has a seat letter **A** / **B** / **C** / **D** (no level marks) | 🔀 Shuffle, Pairs/Trios/Fours, ±1 min, ▶ Start |
| Talk | Task title, what each seat does, picture, boxes **1 Support** and **2 Challenge**, big timer, groups strip; halfway a chime says **swap** | 🖼️ Show next picture (picture rounds, after the swap), −1 / +1 min, Pause, ⏹ Stop round |
| Notebook | A one-line note that fits the round type (Picture: "Write ONE thing your partner described.", Debate: "Write your partner's best argument.", ...) with a short countdown | Done → |
| Report back | Name roll picks one student (fair rotation, never the same person twice in a row) and names their partner | 🎲 Someone else, Next round → |

Keyboard: `Space` = main action (start / pause / next), `→` = skip ahead, `+` / `−` = minute, `N` = show next picture, `F` = fullscreen.

**👁️ Preview** (Rounds panel) steps through every screen of the session exactly as students will see it: groups, talk, swap, next picture, notebook, report back and the end screen. Use **◀ Prev / Next ▶** or `←` / `→`; `↑` / `↓` jump a whole round, `Esc` exits. Nothing runs or is saved: no timers or sounds, the groups are a sample (made-up names if the class list is empty), and partner history, report-back counts and any class in progress stay untouched.

New groups keep Support students apart (two Support students only share a group when there are more of them than groups) and, within that rule, avoid previous partners. With an odd number of students there is one trio; trios and fours that don't divide evenly shrink by one (15 students in fours = 4, 4, 4, 3). The partner history is kept per class across lessons ("Reset partners" clears it). If the page is reloaded mid-class, a **Resume** banner appears.

## Who speaks

One rule for every round: **A starts, and the halfway chime means swap.** Partners share the topic but have different jobs, so nobody can just say "me too". The screen shows each job next to its letter and flips A and B at the swap. C keeps one job all round, and in a group of four D does the same job as C.

| Round | A | B | C, D (trios, fours) | Halfway |
| --- | --- | --- | --- | --- |
| `picture` 🖼️ | 👀 Describes it | 🙈 Doesn't look, asks questions | 🙈 Doesn't look either | Swap: picture 1 stays up so B can check it, students change places, then you tap **🖼️ Show next picture** |
| `topic` 💬 | 🎤 Asks, and asks "Why?" | 💬 Answers | 💬 Answers too | Swap. No "me too"! |
| `roleplay` 🎭 | First role | Second role | 🎬 Director: adds a problem | Swap roles, play it again |
| `defend` ⚖️ (Debate) | Defends the first option | Defends the second | ⚖️ Judge: who wins? | Swap sides |
| `problem` 🧩 | 💡 First idea | 💡 A different idea | 💡 Another idea | Agree on ONE idea |
| `creative` ✨ | ✨ Starts | ➕ Adds more | ➕ Adds more | Swap, add a twist |

Pairs start with box **1** (`support`) and move to box **2** (`challenge`) when it feels easy. Every round is **one task with two depths**: `support` (A1–A2, concrete) and `challenge` (B2–C1, opinion / speculation / persuasion).

Seat letters also carry the hidden level help: Support students get the seat that goes second (B; in topic rounds A, because asking first means hearing an answer before giving yours), so they always hear a partner first. Nobody else sees why.

## AI content workflow

**✨ Create with AI** → type the theme (e.g. *"Unit 1: study and career plans after 4º ESO"*), course, number of rounds and the group sizes the AI may use (it picks one per round) → **Copy prompt** → paste it into ChatGPT / Claude / Gemini → paste the answer back → **Import**. The importer copes with code fences and extra text around the JSON. You can also re-edit, reorder, change pictures and export sessions as `.json` to share with colleagues.

### JSON format

```json
{
  "title": "Unit 1 · Study and career plans",
  "level": "4º ESO",
  "rounds": [
    {
      "type": "picture",
      "title": "At work",
      "group": 2,
      "imageQuery": "young woman working in laboratory",
      "support": "Describe the picture. What is this person's job?",
      "challenge": "Would you like this job? What skills do you need? Why?",
      "words": ["She is a...", "She works in..."]
    },
    { "type": "roleplay", "title": "Job interview", "roles": ["Interviewer", "Candidate"], "support": "...", "challenge": "..." },
    { "type": "defend", "title": "Bachillerato or FP?", "group": 3, "options": ["Bachillerato", "FP"], "support": "...", "challenge": "..." }
  ]
}
```

Optional per round: `group` (2, 3 or 4; without it the round follows the default groups), `words` (phrases shown under Support), `imageQuery` (picture), `image` (a fixed URL), `roles` (roleplay: A plays the first, B the second), `options` (defend: A's side first, B's second). A bare array of rounds is also accepted.

## Pictures

Picture rounds get their picture from `imageQuery`, using the same sources as PinPlay: **Pexels** through the `pinplay-api` worker (`/api/images/search`), with **Openverse** as a fallback. Results are cached per query. In class, ↻ on the picture switches to another result, and broken links are skipped automatically. In the editor, **Choose picture** lets you search, upload a photo (resized and stored locally) or paste a URL.

## Files

- `index.html`: the shell
- `app.js`: UI (setup, live stage, AI/import, editor)
- `logic.js`: pure logic (grouping, report-back picking, AI prompt, JSON import)
- `data.js`: round types (jobs, swap message, notebook note), starter packs
- `images.js`: image search and upload resizing
- `tests/logic.test.js`: `node tests/logic.test.js`
