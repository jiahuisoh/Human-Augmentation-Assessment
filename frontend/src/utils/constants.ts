import type { LucideIcon } from "lucide-react";
import { Armchair, Hand, Footprints } from "lucide-react";
import type { AuditCategory, AuditLevel, TestId } from "../types";

/**
 * Audit presentation, shared by the administrator's trail and the developer's
 * technical log so a category never means one colour in one view and another
 * colour in the other.
 */
export const AUDIT_CATEGORY_STYLE: Record<AuditCategory, string> = {
  TOKEN:      "bg-indigo-50 text-indigo-700 border-indigo-200",
  AUTH:       "bg-emerald-50 text-emerald-700 border-emerald-200",
  ADMIN:      "bg-violet-50 text-violet-700 border-violet-200",
  CONTRACT:   "bg-amber-50 text-amber-700 border-amber-200",
  CONSENT:    "bg-blue-50 text-blue-700 border-blue-200",
  AI:         "bg-gray-100 text-gray-600 border-gray-200",
  CV:         "bg-violet-50 text-violet-700 border-violet-200",
  ASSESSMENT: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export const AUDIT_LEVEL_STYLE: Record<AuditLevel, string> = {
  INFO:  "text-gray-400",
  WARN:  "text-amber-600",
  ERROR: "text-red-600",
};

/**
 * Clinic booking window, 24-hour "HH:MM", both ends inclusive.
 * Mirrors clinicHours in backend/src/utils/constants.js - the server is the
 * authority and rejects anything outside it; this drives the form.
 */
export const CLINIC_HOURS = { opens: "09:00", closes: "17:00" } as const;

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
      "Stand side-on to the camera, with your whole upper body in frame and a clear background behind you.",
      "Reach one hand over your shoulder, palm facing your back; reach the other up the centre of your back.",
      "Stretch your fingers toward each other so both hands are visible behind your back.",
      "Hold the furthest point still for at least 2 seconds.",
    ],
    calibrationPrompt: "Stand side-on to the camera, standing tall with your whole upper body visible.",
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

