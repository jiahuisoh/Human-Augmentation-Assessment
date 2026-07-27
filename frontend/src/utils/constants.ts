import type { LucideIcon } from "lucide-react";
import {
  Armchair, Hand, Footprints,
  Flame, Trophy, Star, Sparkles, Award, Moon, Dumbbell, Crown, Users,
  Activity, RotateCw,
} from "lucide-react";
import type { TestId } from "../types";

export interface TestDefinition {
  id: TestId;
  name: string;
  shortDesc: string;
  instructions: string;
  calibrationPrompt: string;
  safetyNote: string;
  Icon: LucideIcon;
  metricLabel: string;
  cvEnabled: boolean;
}

/** The three functional tests defined in the HANA assessment module. */
export const TESTS: readonly TestDefinition[] = [
  {
    id: "chair_stand",
    name: "Chair Stand Test",
    shortDesc: "Lower body strength",
    instructions:
      "Sit on a sturdy chair with your back straight and feet flat on the floor. Cross your arms over your chest. On 'Start', rise to a full standing position then sit back down. Repeat as many times as you can in 30 seconds.",
    calibrationPrompt: "Stand straight, sideways to the camera.",
    safetyNote: "Stop immediately if you feel dizzy, pain, or short of breath.",
    Icon: Armchair,
    metricLabel: "Repetitions",
    cvEnabled: true,
  },
  {
    id: "back_scratch",
    name: "Back Scratch Test",
    shortDesc: "Shoulder flexibility",
    instructions:
      "Reach one hand over your shoulder (palm facing your back) and the other hand up the centre of your back (palm facing outward). Stretch your fingers toward each other. Measure the distance between fingertips.",
    calibrationPrompt: "Face the camera with your full upper body visible.",
    safetyNote: "Do not force the stretch. Stop if you feel any shoulder pain.",
    Icon: Hand,
    metricLabel: "Distance (cm)",
    cvEnabled: true,
  },
  {
    id: "sit_reach",
    name: "Sit & Reach",
    shortDesc: "Hamstring & lower-back flexibility",
    instructions:
      "Choose Chair (one leg extended) or Floor (both legs extended). Use a side (profile) camera view so the extended leg and hands are clear — face does not need to be in frame. Keep the test knee(s) straight, stack your hands, reach toward your toes, and hold 3 seconds. Score: − short of toes, 0 at toes, + past toes.",
    calibrationPrompt:
      "Side view: hips through toes of the test leg(s) plus both hands in frame. Heel(s) down, knee(s) straight. Face optional.",
    safetyNote: "Never bounce. If a knee bends, sit back until it is straight before counting the reach.",
    Icon: Footprints,
    metricLabel: "Distance (cm)",
    cvEnabled: true,
  },
];

export interface BadgeDefinition {
  id: number;
  name: string;
  Icon: LucideIcon;
  earned: boolean;
  date: string | null;
  tokens: number;
}

export const BADGES_DATA: readonly BadgeDefinition[] = [
  { id: 1, name: "7-Day Streak",     Icon: Flame,    earned: true,  date: "12 May", tokens: 20 },
  { id: 2, name: "Chair Stand Pro",  Icon: Trophy,   earned: true,  date: "10 May", tokens: 25 },
  { id: 3, name: "Flexibility Star", Icon: Star,     earned: true,  date: "8 May",  tokens: 15 },
  { id: 4, name: "14-Day Streak",    Icon: Sparkles, earned: false, date: null,     tokens: 30 },
  { id: 5, name: "Step Champion",    Icon: Award,    earned: false, date: null,     tokens: 20 },
  { id: 6, name: "Sleep Master",     Icon: Moon,     earned: false, date: null,     tokens: 15 },
  { id: 7, name: "Strength Guru",    Icon: Dumbbell, earned: false, date: null,     tokens: 25 },
  { id: 8, name: "Perfect Week",     Icon: Crown,    earned: false, date: null,     tokens: 35 },
  { id: 9, name: "Social Butterfly", Icon: Users,    earned: false, date: null,     tokens: 20 },
];

export interface ExerciseDefinition {
  id: number;
  name: string;
  detail: string;
  category: "Strength" | "Flexibility" | "Cardio";
  duration: string;
  Icon: LucideIcon;
}

export const EXERCISES: readonly ExerciseDefinition[] = [
  { id: 1, name: "Chair Stand",       detail: "3 sets × 10 reps",          category: "Strength",    duration: "10 min", Icon: Armchair   },
  { id: 2, name: "Seated Leg Raises", detail: "2 sets × 15 reps",          category: "Flexibility", duration: "5 min",  Icon: Activity   },
  { id: 3, name: "Wall Push-Ups",     detail: "3 sets × 10 reps",          category: "Strength",    duration: "8 min",  Icon: Dumbbell   },
  { id: 4, name: "Shoulder Rolls",    detail: "2 min each direction",       category: "Flexibility", duration: "4 min",  Icon: RotateCw   },
  { id: 5, name: "Brisk Walk",        detail: "30 minutes at a good pace", category: "Cardio",      duration: "30 min", Icon: Footprints },
];

/** Liveness threshold below which tokens are not awarded. */
export const LIVENESS_THRESHOLD = 0.70;

/** Token award above which administrator approval is required. */
export const HIGH_VALUE_TOKEN_THRESHOLD = 100;
