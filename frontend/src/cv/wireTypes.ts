import type { Sex, TestId, RiskLevel } from "../types";

export type Phase     = "loading" | "calibrating" | "countdown" | "test" | "done" | "error";
export type Detection = "ok" | "partial" | "missing";
export type Posture   = "up" | "down" | "unknown";

export interface TestOutcomeWire {
  reps?:             number;
  measurement?:      number;
  classification?:   string;
  risk_level?:       RiskLevel;
  interpretation?:   string;
  norm_low?:         number;
  norm_high?:        number;
  terminated_early?: boolean;
  calibration_quality?: number;
  liveness_score?:   number;
}

export interface ReadyMessage {
  type:    "ready";
  test_id: TestId;
}

export interface UpdateMessage {
  type:  "update";
  phase: Phase;
  landmarks?:      number[][];
  hand_landmarks?: number[][][];
  detection?:      Detection;

  // Calibration phase
  calib_progress?:    number;
    calib_samples?:     number;
    calib_remaining_s?: number;
    calib_quality?:     number;

  // Countdown phase
  countdown?: number;

  // Test phase — chair stand
  reps?:    number;
  posture?: Posture;
  angle?:   number;

  // Test phase — distance-based
  measurement?:      number;
  best_measurement?: number;
  form_hint?:        string;

  // Test phase — generic
  time_remaining?:  number;
  liveness_rolling?: number;
}

export interface CompleteMessage {
  type:    "complete";
  outcome: TestOutcomeWire;
}

export interface ErrorMessage {
  type:    "error";
  message: string;
}

export type ServerMessage = ReadyMessage | UpdateMessage | CompleteMessage | ErrorMessage;

// ---- Client → Server actions ------------------------------------

export interface InitAction {
  action:      "init";
  user_age:    number | null;
  user_sex:    Sex;
  user_height: number | null;
  /** When true, server should run with synthetic / de-identified user data. */
  sandbox?:    boolean;
}

export interface StartAction      { action: "start"; }
export interface StopEarlyAction  { action: "stop_early"; }

export type ClientAction = InitAction | StartAction | StopEarlyAction;
