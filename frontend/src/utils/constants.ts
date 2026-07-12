import type { LucideIcon } from "lucide-react";
import {
  Armchair, Hand, Footprints,
  Dumbbell,
  Activity, RotateCw,
} from "lucide-react";
import type { TestId } from "../types";

export interface TestDefinition {
  id: TestId;
  name: string;
  shortDesc: string;
  instructions: readonly string[];
  calibrationPrompt: string;
  safetyNote: string;
  Icon: LucideIcon;
  metricLabel: string;
  cvEnabled: boolean;
}

export const TESTS: readonly TestDefinition[] = [
  {
    id: "chair_stand",
    name: "Chair Stand Test",
    shortDesc: "Lower body strength",
    instructions: [
      "Place a sturdy chair side-on to the camera and sit so your side faces it.",
      "Sit with your back straight and feet flat on the floor, arms crossed over your chest.",
      "On 'Start', rise to a full standing position, then sit back down.",
      "Repeat as many times as you can in 30 seconds.",
    ],
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
    instructions: [
      "Reach one hand over your shoulder, palm facing your back.",
      "Reach your other hand up the centre of your back, palm facing outward.",
      "Stretch your fingers toward each other.",
      "Hold the stretch for at least 2 seconds.",
    ],
    calibrationPrompt: "Face the camera with your full upper body visible.",
    safetyNote: "Do not force the stretch. Stop if you feel any shoulder pain.",
    Icon: Hand,
    metricLabel: "Distance (cm)",
    cvEnabled: true,
  },
  {
    id: "sit_reach",
    name: "Sit & Reach Test",
    shortDesc: "Lower body & trunk flexibility",
    instructions: [
      "Sit on the floor with your side facing the camera.",
      "Keep your legs straight out in front of you and place one hand on top of the other.",
      "Slowly reach forward toward your toes as far as you can.",
      "Hold the furthest point for at least 2 seconds.",
    ],
    calibrationPrompt: "Sit sideways to the camera with your test leg straight out.",
    safetyNote: "Try not to bend your knees throughout the test.",
    Icon: Footprints,
    metricLabel: "Distance (cm)",
    cvEnabled: true,
  },
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
