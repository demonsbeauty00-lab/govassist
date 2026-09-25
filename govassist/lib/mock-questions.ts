// ⚠️ DEMO DATA — a small generic question set used to build and preview the
// mock test flow. Phase 2 replaces this with real previous-year questions,
// tagged by exam cycle and year, sourced and stored with provenance.

export interface MockQuestion {
  id: string;
  section: string;
  prompt: string;
  options: string[];
  correctIndex: number;
}

export const demoMockQuestions: MockQuestion[] = [
  {
    id: "q1",
    section: "Quantitative Aptitude",
    prompt: "A train covers 180 km in 3 hours. What is its average speed?",
    options: ["45 km/h", "60 km/h", "50 km/h", "55 km/h"],
    correctIndex: 1,
  },
  {
    id: "q2",
    section: "General Awareness",
    prompt: "The Constitution of India came into effect on which date?",
    options: ["15 August 1947", "26 January 1950", "26 November 1949", "2 October 1950"],
    correctIndex: 1,
  },
  {
    id: "q3",
    section: "General Intelligence",
    prompt: "Find the odd one out: Apple, Mango, Carrot, Banana.",
    options: ["Apple", "Mango", "Carrot", "Banana"],
    correctIndex: 2,
  },
  {
    id: "q4",
    section: "English",
    prompt: "Choose the correctly spelled word.",
    options: ["Occassion", "Occasion", "Ocasion", "Occasionn"],
    correctIndex: 1,
  },
  {
    id: "q5",
    section: "Quantitative Aptitude",
    prompt: "What is 15% of 240?",
    options: ["30", "36", "24", "40"],
    correctIndex: 1,
  },
];
