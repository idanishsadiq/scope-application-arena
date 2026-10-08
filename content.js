window.SCOPE_CONTENT = {
  gameTitle: 'SCOPE Application Arena',
  subtitle: '20 seconds. One decision. Would this application stand out?',
  defaultQuestions: [
    {
      title: 'CV: Specific or vague?',
      type: 'verdict_tag',
      excerpt: 'Helped with several KazMSA events and gained valuable leadership experience.',
      options: ['Strong', 'Needs work'],
      tags: ['Too generic', 'Strong evidence', 'Clear result', 'Specific role'],
      correctVerdict: 'Needs work',
      correctTag: 'Too generic',
      explanation: 'The statement does not tell the reviewer what the applicant actually did, when, or what changed because of their work.',
      lesson: 'Replace vague claims with the event, role, dates and—when appropriate—a measurable result.'
    },
    {
      title: 'CV: What is missing?',
      type: 'missing',
      excerpt: 'Local Officer, LC AMU.',
      options: ['Nothing', 'The season / dates', 'A second position', 'A longer description'],
      tags: [],
      correctVerdict: 'The season / dates',
      correctTag: null,
      explanation: 'A position should be anchored in time so the reviewer can understand the applicant’s experience clearly.',
      lesson: 'Keep one consistent date format throughout the CV.'
    },
    {
      title: 'CV: Which achievement is stronger?',
      type: 'choose_best',
      excerpt: 'A) Participated in many events and improved my leadership skills.\n\nB) Organized three local first-aid sessions reaching more than 120 students.',
      options: ['A', 'B'],
      tags: ['Evidence', 'Result', 'Generic', 'Unclear role'],
      correctVerdict: 'B',
      correctTag: 'Result',
      explanation: 'Option B gives the activity, the role and a concrete result that a reviewer can understand.',
      lesson: 'Strong applications turn activities into evidence of what you actually contributed.'
    },
    {
      title: 'CV: Can the reviewer verify it?',
      type: 'verdict_tag',
      excerpt: 'I have excellent language skills and several international certificates.',
      options: ['Strong', 'Needs work'],
      tags: ['Unverified claim', 'Strong evidence', 'Specific result', 'Relevant goal'],
      correctVerdict: 'Needs work',
      correctTag: 'Unverified claim',
      explanation: 'The claim is broad and gives no certificate, level or supporting evidence.',
      lesson: 'List accurate language levels and upload certificates or awards when the application requires proof.'
    },
    {
      title: 'Motivation: General or specific?',
      type: 'verdict_tag',
      excerpt: 'I would love to visit your country, experience a new culture and meet new people.',
      options: ['Strong', 'Needs work'],
      tags: ['Too travel-focused', 'Specific department', 'Clear goal', 'Strong evidence'],
      correctVerdict: 'Needs work',
      correctTag: 'Too travel-focused',
      explanation: 'A Stage 2 motivation letter should explain why this Local Committee and this department—not mainly why the country is interesting.',
      lesson: 'Research the LC, department and clinical environment, then connect them to your professional goals.'
    },
    {
      title: 'Motivation: Pick the strongest sentence',
      type: 'choose_best',
      excerpt: 'A) Exchanges are a great experience.\n\nB) I want to visit Poland and explore Europe.\n\nC) I want to observe your department’s approach to cardiovascular prevention and bring practical ideas back to my LC.',
      options: ['A', 'B', 'C'],
      tags: ['Specific goal', 'Travel-focused', 'Generic', 'Connection to home'],
      correctVerdict: 'C',
      correctTag: 'Specific goal',
      explanation: 'C names a concrete learning objective and shows how the experience could create value after the exchange.',
      lesson: 'A strong letter answers: why exchange, why you, why this LC/department, and what you will do with the experience.'
    },
    {
      title: 'Motivation: Does the story connect?',
      type: 'verdict_tag',
      excerpt: 'I completed an ECG course last year. During the exchange, I want to observe how your department approaches early cardiovascular screening. After returning, I will share these practices through a session at my LC.',
      options: ['Strong', 'Needs work'],
      tags: ['Experience → goal', 'Disconnected', 'Too generic', 'Travel-focused'],
      correctVerdict: 'Strong',
      correctTag: 'Experience → goal',
      explanation: 'The paragraph connects prior preparation to the exchange objective and then to a concrete return-home action.',
      lesson: 'The strongest applications connect experience → motivation → goals instead of repeating the CV.'
    },
    {
      title: 'Final boss: Review the mini-application',
      type: 'choose_best',
      excerpt: 'I am a third-year medical student interested in international exchange. I have participated in several events and gained many skills. I want to visit your country because Europe has excellent healthcare. I believe the experience would be interesting and useful for my future. I would be happy to participate.',
      options: ['Excellent', 'Good', 'Needs major improvement', 'Unacceptable'],
      tags: ['Specificity', 'Evidence', 'LC/department fit', 'Goals'],
      correctVerdict: 'Needs major improvement',
      correctTag: 'LC/department fit',
      explanation: 'The paragraph is polite but generic: it lacks evidence, a specific LC/department reason, concrete learning goals and a clear experience-to-goal connection.',
      lesson: 'A strong application is relevant experience + clear motivation + specific goals + attention to detail.'
    }
  ]
};
