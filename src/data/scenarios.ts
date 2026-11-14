export interface Scenario {
  id: string;
  title: string;
  blurb: string;
  /** role-play brief for the AI tutor */
  brief: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'free',
    title: 'Free conversation',
    blurb: 'Talk about anything that is on your mind.',
    brief: 'Have a relaxed, open conversation. Follow the learner’s topics and stay curious.',
  },
  {
    id: 'meet',
    title: 'Meeting someone new',
    blurb: 'Introduce yourself and get to know a stranger.',
    brief: 'Role-play: you just met the learner at a friend’s party. Exchange introductions and small talk.',
  },
  {
    id: 'cafe',
    title: 'At the café',
    blurb: 'Order a drink and something to eat.',
    brief: 'Role-play: you are a friendly waiter in a café and the learner is your guest. Take the order, offer options, bring the bill.',
  },
  {
    id: 'directions',
    title: 'Finding your way',
    blurb: 'Ask for directions in an unfamiliar city.',
    brief: 'Role-play: you are a local on the street. The learner is a visitor looking for places in your city. Give directions and recommendations.',
  },
  {
    id: 'market',
    title: 'At the market',
    blurb: 'Buy groceries and ask about prices.',
    brief: 'Role-play: you sell fruit, vegetables and cheese at a market stall. The learner is a customer. Talk about products, quantities and prices.',
  },
  {
    id: 'interview',
    title: 'Job interview',
    blurb: 'Answer questions about your experience.',
    brief: 'Role-play: you are interviewing the learner for a job they choose. Ask one interview question at a time, professionally but warmly.',
  },
];

export function getScenario(id: string): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
}
