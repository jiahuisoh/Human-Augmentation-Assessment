import type { Sex, TestId, RiskLevel } from "../types";

export type Phase     = "loading" | "calibrating" | "countdown" | "test" | "done" | "error";
export type Detection = "ok" | "partial" | "missing";
export type Posture   = "up" | "down" | "unknown";

export type TrafficLight = "red" | "amber" | "green";

export interface TestOutcomeWire {
  reps?:             number;
  /** cm, clinical convention: sit-reach + = past the toes; back-scratch + = fingers overlap. */
  measurement?:      number;
  classification?:   string;
  risk_level?:       RiskLevel;
  interpretation?:   string;
  norm_low?:         number;
  norm_high?:        number;
  norm_applicability?: "in_range" | "extrapolated" | "out_of_range";
  terminated_early?: boolean;
  calibration_quality?: number;
  liveness_score?:   number;
  traffic_light?:    TrafficLight;
  time_to_5_stands_s?: number;
  sppb_sts_points?:  number;
  awgs19_slow_sts?:  boolean;
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

  // Test phase - chair stand
  reps?:    number;
  posture?: Posture;
  angle?:   number;

  // Test phase - distance-based
  measurement?:      number;
  best_measurement?: number;

  // Test phase - generic
  time_remaining?:  number;
  liveness_rolling?: number;
}

export interface CompleteMessage {
  type:    "complete";
  outcome: TestOutcomeWire;
  /** Signed raw measurements for the backend; forwarded verbatim, never read here. */
  outcome_token?: string;
}

export interface ErrorMessage {
  type:    "error";
  message: string;
}

export type ServerMessage = ReadyMessage | UpdateMessage | CompleteMessage | ErrorMessage;

// ---- Client → Server actions ------------------------------------

export interface InitAction {
  action: "init";
  /** Backend-signed grant carrying the subject's real age, sex and height. */
  token:  string;
}

export interface StartAction      { action: "start"; }
export interface StopEarlyAction  { action: "stop_early"; }

export type ClientAction = InitAction | StartAction | StopEarlyAction;
