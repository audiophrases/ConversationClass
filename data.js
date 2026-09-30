// Static content: round types, notebook missions and built-in session packs.

const ROUND_TYPES = {
  picture: {
    icon: '🖼️',
    name: 'Picture',
    hint: 'Describe and talk about the picture.',
    nudge: 'Ask your partner: "What else can you see?"',
  },
  topic: {
    icon: '💬',
    name: 'Topic talk',
    hint: 'Talk about the topic. Ask and answer.',
    nudge: 'Ask a follow-up question: "Why?" "How?"',
  },
  roleplay: {
    icon: '🎭',
    name: 'Role play',
    hint: 'Act it out! The first name in your group starts as role A.',
    nudge: 'Switch roles!',
  },
  defend: {
    icon: '⚖️',
    name: 'Choose & defend',
    hint: 'Choose one side and give your reasons.',
    nudge: 'Now try to change your partner\'s mind!',
  },
  problem: {
    icon: '🧩',
    name: 'Problem solver',
    hint: 'Solve the problem together.',
    nudge: 'Agree on ONE best idea.',
  },
  creative: {
    icon: '✨',
    name: 'Creative challenge',
    hint: 'Invent, imagine, have fun.',
    nudge: 'Add a surprise twist!',
  },
};

// One of these is picked at random for the notebook step after each round.
const MISSIONS = [
  'Write ONE thing your partner said.',
  'Write ONE new word or phrase you heard.',
  'Write your partner\'s best idea.',
  'Write ONE question your partner asked you.',
  'Write ONE thing you agreed on.',
  'Write ONE thing you disagreed about.',
  'Write ONE thing that surprised you.',
];

const BUILT_IN_SESSIONS = [
  {
    id: 'builtin-teen-life',
    builtIn: true,
    title: 'Starter pack · Teen life',
    level: '3º–4º ESO',
    rounds: [
      {
        type: 'picture',
        title: 'What is going on here?',
        imageQuery: 'teenagers laughing together at school',
        support: 'Describe the picture. Who can you see? What are they doing? Where are they?',
        challenge: 'What happened just before this photo? How is each person feeling, and why?',
        words: ['There is / There are...', 'On the left / right...', 'In the background...', 'I think they are...'],
      },
      {
        type: 'topic',
        title: 'Weekends',
        support: 'What do you usually do at the weekend? Who with? Where?',
        challenge: 'Describe your perfect weekend. How is it different from a real one? Why?',
        words: ['I usually...', 'I love / I don\'t like...', 'because...'],
      },
      {
        type: 'roleplay',
        title: 'Returning a gift',
        roles: ['Customer', 'Shop assistant'],
        support: 'The customer wants to return a T-shirt. It is too small. The shop assistant helps.',
        challenge: 'The customer lost the receipt and is in a hurry. The rules say "no receipt, no refund". Find a solution!',
        words: ['Can I...?', 'I\'m sorry, but...', 'What about...?'],
      },
      {
        type: 'problem',
        title: 'Phone-free school trip',
        support: 'A 3-day school trip with NO phones! Choose 5 things to take with you. Say why.',
        challenge: 'No phones for 3 days: how will you contact family, find your way and have fun? Agree on a plan.',
        words: ['We need...', 'We could...', 'Good idea!'],
      },
      {
        type: 'picture',
        title: 'Big moment',
        imageQuery: 'teenager playing football match',
        support: 'What do you see? What sport is it? What are the people wearing?',
        challenge: 'Be a sports commentator! Describe the moment live, then say what happens next.',
        words: ['He / She is...-ing', 'I can see...', 'Maybe...'],
      },
      {
        type: 'defend',
        title: 'City or countryside?',
        options: ['Live in a big city', 'Live in the countryside'],
        support: 'Choose one. Give two reasons: "I prefer... because..."',
        challenge: 'Choose one and convince your partner. Answer their arguments: "I see your point, but..."',
        words: ['I prefer...', 'because...', 'It\'s better / worse...'],
      },
      {
        type: 'creative',
        title: 'Story swap',
        support: 'Say one sentence each. Keep the story going! Start: "When I opened my locker..."',
        challenge: 'Build a story, one sentence each. Add a twist every 3 sentences. Start: "Nobody believed me when I said..."',
        words: ['Then...', 'Suddenly...', 'In the end...'],
      },
    ],
  },
  {
    id: 'builtin-future-plans',
    builtIn: true,
    title: 'Starter pack · Plans after 4º ESO',
    level: '4º ESO',
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
        type: 'topic',
        title: 'Dream job',
        support: 'What is your dream job? Why do you like it?',
        challenge: 'What is your dream job, and what is a realistic plan B? What will you do to get there?',
        words: ['I want to be...', 'I\'m good at...', 'because...'],
      },
      {
        type: 'defend',
        title: 'Bachillerato or FP?',
        options: ['Bachillerato', 'Vocational training (FP)'],
        support: 'Which is better for you? Give two reasons.',
        challenge: 'Which is better for most students? Compare them and convince your partner.',
        words: ['I prefer...', 'It\'s more / less...', 'I agree / I don\'t agree'],
      },
      {
        type: 'roleplay',
        title: 'Summer job interview',
        roles: ['Interviewer', 'Candidate'],
        support: 'The interviewer asks 5 questions: name, age, hobbies, experience, free time. The candidate answers.',
        challenge: 'Job: summer camp monitor. The interviewer asks tricky questions. The candidate must sell themselves!',
        words: ['Why do you want...?', 'I have experience in...', 'I\'m good at...'],
      },
      {
        type: 'picture',
        title: 'In the kitchen',
        imageQuery: 'chef cooking in restaurant kitchen',
        support: 'What do you see? What is the chef doing? What is he wearing?',
        challenge: 'What are the good and bad sides of this job? How is the chef feeling right now?',
        words: ['He is...-ing', 'He looks...', 'It\'s hard / fun...'],
      },
      {
        type: 'problem',
        title: 'The careers fair',
        support: 'Your school has a careers fair. Choose 3 jobs to invite. Say why.',
        challenge: 'You organise the careers fair with a small budget. Choose 3 guests, plan activities and convince students to come.',
        words: ['We could invite...', 'Students like...', 'Let\'s...'],
      },
      {
        type: 'creative',
        title: 'Meet your future self',
        support: 'It\'s 2036. Tell your partner: Where do you live? What is your job? Who do you live with?',
        challenge: 'Interview your partner\'s future self (10 years from now). Ask about successes, mistakes and advice for today.',
        words: ['I live in...', 'I work as...', 'I have...'],
      },
    ],
  },
];
