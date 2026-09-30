# Conversation Class

A projector-first speaking app for ESL conversation classes. One screen runs the room: it pairs students, shows the task at two levels, runs the timer, asks for a one-line notebook note and picks someone to report back. There are no student devices, no recording and no scoring.

## Run it

Open `index.html` in a browser. There is no build step. It also works on GitHub Pages: deploy from the branch root.

Data (classes, sessions, the class in progress) is saved in the browser's `localStorage`, so use the same browser on the classroom computer.

## Class flow

1. **Class**: paste names (one per line; add `*` for Challenge, e.g. `Maria*`, or `+` for Support, e.g. `Leo+`; no mark = neutral). Tap a name to cycle **neutral → + Support → ★ Challenge → Absent**. Level marks are only shown on this setup screen, never on the projector.
2. **Rounds**: pick a session (two starter packs are included), create one with AI, or import JSON.
3. **Start**: set minutes per round (default 5), pairs / trios / mix, notebook time and sound.

Each round runs through these steps:

| Step | Screen | Teacher controls |
|---|---|---|
| Groups | Numbered pairs/trios (names only, no level marks) | 🔀 Shuffle, Pairs/Trios, ±1 min, ▶ Start |
| Talk | Task title, picture, **Support** and **Challenge** boxes, big timer, groups strip; a nudge pops up halfway ("Switch roles!", "Ask a follow-up question") | −1 / +1 min, Pause, ⏹ Stop round |
| Notebook | One random one-line mission ("Write ONE thing your partner said") with a short countdown | Done → |
| Report back | Name roll picks one student (fair rotation, never the same person twice in a row) and names their partner | 🎲 Someone else, Next round → |

Keyboard: `Space` = main action (start / pause / next), `→` = skip ahead, `+` / `−` = minute, `F` = fullscreen.

New groups keep Support students apart (two Support students only share a group when there are more of them than groups) and, within that rule, avoid previous partners. With an odd number of students there is one trio. The partner history is kept per class across lessons ("Reset partners" clears it). If the page is reloaded mid-class, a **Resume** banner appears.

## Round types

`picture` 🖼️ · `topic` 💬 · `roleplay` 🎭 · `defend` ⚖️ (choose & defend) · `problem` 🧩 · `creative` ✨

Every round is **one task with two depths**: `support` (A1–A2, concrete) and `challenge` (B2–C1, opinion / speculation / persuasion).

## AI content workflow

**✨ Create with AI** → type the theme (e.g. *"Unit 1: study and career plans after 4º ESO"*), course and number of rounds → **Copy prompt** → paste it into ChatGPT / Claude / Gemini → paste the answer back → **Import**. The importer copes with code fences and extra text around the JSON. You can also re-edit, reorder, change pictures and export sessions as `.json` to share with colleagues.

### JSON format

```json
{
  "title": "Unit 1 · Study and career plans",
  "level": "4º ESO",
  "rounds": [
    {
      "type": "picture",
      "title": "At work",
      "imageQuery": "young woman working in laboratory",
      "support": "Describe the picture. What is this person's job?",
      "challenge": "Would you like this job? What skills do you need? Why?",
      "words": ["She is a...", "She works in..."]
    },
    { "type": "roleplay", "title": "Job interview", "roles": ["Interviewer", "Candidate"], "support": "...", "challenge": "..." },
    { "type": "defend", "title": "Bachillerato or FP?", "options": ["Bachillerato", "FP"], "support": "...", "challenge": "..." }
  ]
}
```

Optional per round: `words` (phrases shown under Support), `imageQuery` (picture), `image` (a fixed URL), `roles` (roleplay), `options` (defend). A bare array of rounds is also accepted.

## Pictures

Picture rounds get their picture from `imageQuery`, using the same sources as PinPlay: **Pexels** through the `pinplay-api` worker (`/api/images/search`), with **Openverse** as a fallback. Results are cached per query. In class, ↻ on the picture switches to another result, and broken links are skipped automatically. In the editor, **Choose picture** lets you search, upload a photo (resized and stored locally) or paste a URL.

## Files

- `index.html`: the shell
- `app.js`: UI (setup, live stage, AI/import, editor)
- `logic.js`: pure logic (grouping, report-back picking, AI prompt, JSON import)
- `data.js`: round types, notebook missions, starter packs
- `images.js`: image search and upload resizing
- `tests/logic.test.js`: `node tests/logic.test.js`
