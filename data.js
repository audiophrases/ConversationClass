// Static content: round types.

// Every round works the same way: A (first name in the group) starts, and at
// halfway a chime says "swap". `roles` are the A / B / C (and optionally D) jobs shown on the
// projector (role plays and debates use the round's own roles / options for A
// and B). A and B trade jobs at the swap; C keeps theirs, and in groups of four
// D does the same job as C. `swaps: false` keeps the jobs and shows the halfway
// message as the next step instead. `joinAfterSwap`: where C's and D's job is
// mostly watching, they join in after the swap ([C's new job, D's new job]),
// announced by `swapTrio` when the round has trios or fours.
// `supportSlots`: seats Support students take first (default B, C, D, then A).
// `notebook`: the one-line note students write after the round.
const ROUND_TYPES = {
  picture: {
    icon: '🖼️',
    name: 'Picture',
    roles: ['👀 Describe it', '🙈 Don\'t look! Ask questions', '🙈 Don\'t look! Ask questions'],
    swap: '🔄 Swap! Check the picture, then change places',
    notebook: 'Write ONE thing your partner described.',
  },
  topic: {
    icon: '💬',
    name: 'Topic talk',
    roles: ['🎤 Ask + “Why?”', '💬 Answer', '💬 Answer too'],
    swap: '🔄 Swap! No “me too” 😉',
    supportSlots: [0, 2, 3, 1], // asking first means hearing an answer before giving yours
    notebook: 'Write ONE thing your partner said.',
  },
  roleplay: {
    icon: '🎭',
    name: 'Role play',
    roles: ['🎭 Start the scene', '🎭 Answer', '🎬 Director: add a problem!'],
    swap: '🔄 Swap roles! Play it again',
    joinAfterSwap: ['🎭 Join in as a new character', '🎭 Join in as a new character'],
    swapTrio: '🔄 Swap roles! C joins the scene',
    notebook: 'Write ONE useful phrase from your scene.',
  },
  defend: {
    icon: '⚖️',
    name: 'Debate',
    roles: ['👈 First option', '👉 Second option', "🤝 Join B's side", "🤝 Join A's side"], // C and D keep the teams even
    swap: '🔄 Swap sides!',
    notebook: 'Write your partner\'s best argument.',
  },
  problem: {
    icon: '🧩',
    name: 'Problem solver',
    roles: ['💡 First idea', '💡 A different idea', '💡 Another idea'],
    swap: '🤝 Now agree on ONE idea',
    swaps: false,
    notebook: 'Write the idea you agreed on.',
  },
  creative: {
    icon: '✨',
    name: 'Creative challenge',
    roles: ['✨ Start', '➕ Add more', '➕ Add more'],
    swap: '🔄 Swap! Add a twist 🌀',
    notebook: 'Write your partner\'s best idea.',
  },
};
