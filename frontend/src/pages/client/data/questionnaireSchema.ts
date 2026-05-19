import type { QuestionnaireQuestion } from "../../../types";

export const QUESTIONNAIRE: ReadonlyArray<QuestionnaireQuestion> = [
  { id: "balance",       prompt: "How is your balance today?",                  kind: "scale_1_5" },
  { id: "mobility",      prompt: "How would you rate your mobility this week?", kind: "scale_1_5" },
  { id: "falls_7d",      prompt: "Have you had a fall in the last 7 days?",     kind: "yes_no"    },
  { id: "pain_standing", prompt: "Any pain when standing up?",                  kind: "yes_no"    },
  { id: "walk_minutes",  prompt: "Minutes spent walking today",                 kind: "minutes"   },
];
