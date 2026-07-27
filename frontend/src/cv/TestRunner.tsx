import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, AlertCircle, Armchair, Home, Loader, Square, Stethoscope } from "lucide-react";
import { cls } from "../utils/helpers";
import { drawSkeleton, drawHands, pickToeAnchor } from "./landmarks";
import { CVServiceClient } from "./CVServiceClient";
import PoseCamera, { type PoseCameraHandle } from "./PoseCamera";
import SitReachGamification from "./SitReachGamification";
import type { Detection, Phase, TestEnvironment, TestOutcomeWire, TestSeating, UpdateMessage } from "./wireTypes";
import type { Sex, TestId } from "../types";
import { TESTS } from "../utils/constants";
import LivenessDetection from "../components/LivenessDetection";

function calibrationPromptFor(testId: TestId, seating?: TestSeating): string {
  if (testId === "sit_reach") {
    return seating === "floor"
      ? "Side view to the camera. Keep hips–knees–ankles–toes and both hands in frame. Both legs extended, heels down, knees straight. Face optional."
      : "Side view to the camera. Keep hips–knee–ankle–toes of the extended leg and both hands in frame. One foot flat; test leg heel down, knee straight. Face optional.";
  }
  return TESTS.find(t => t.id === testId)?.calibrationPrompt
    ?? "Stand straight, sideways to the camera.";
}

const CV_WS_URL: string = import.meta.env.VITE_CV_WS_URL || "ws://localhost:4501";
const FRAME_JPEG_QUALITY = 0.7;

export interface TestRunnerProps {
  testId:              TestId;
  userAge:             number | null;
  userSex:             Sex;
  userHeight:          number | null;
  defaultEnvironment?: TestEnvironment;
  sandbox?:            boolean;
  onComplete:          (outcome: TestOutcomeWire) => void;
  onBack:              () => void;
}

export default function TestRunner({
  testId, userAge, userSex, userHeight,
  defaultEnvironment = "home", sandbox = false, onComplete, onBack,
}: TestRunnerProps) {
  const needsSetup = testId === "sit_reach";
  const [environment, setEnvironment] = useState<TestEnvironment>(defaultEnvironment);
  const [seating, setSeating] = useState<TestSeating>("chair");
  const [sessionStarted, setSessionStarted] = useState(!needsSetup);
  const [phase, setPhase]         = useState<Phase>(needsSetup ? "loading" : "loading");
  const [update, setUpdate]       = useState<UpdateMessage | null>(null);
  const [errorMsg, setErrorMsg]   = useState("");
  const [detection, setDetection] = useState<Detection>("missing");

  const cameraRef  = useRef<PoseCameraHandle>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const clientRef  = useRef<CVServiceClient | null>(null);
  const rafRef     = useRef<number | null>(null);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });

  const transitionPhase = useCallback((next: Phase) => setPhase(next), []);

  useEffect(() => {
    if (!sessionStarted) return;

    let cancelled = false;
    scratchRef.current = document.createElement("canvas");

    const captureLoop = async (): Promise<void> => {
      if (cancelled) return;
      const video   = cameraRef.current?.video;
      const client  = clientRef.current;
      const scratch = scratchRef.current;
      if (video && client && scratch && video.readyState >= 2 && video.videoWidth > 0) {
        scratch.width  = video.videoWidth;
        scratch.height = video.videoHeight;
        const ctx = scratch.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          const blob = await new Promise<Blob | null>(resolve =>
            scratch.toBlob(b => resolve(b), "image/jpeg", FRAME_JPEG_QUALITY),
          );
          if (blob) await client.sendFrame(blob);
        }
      }
      rafRef.current = requestAnimationFrame(captureLoop);
    };

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const video = cameraRef.current?.video;
        if (video) { video.srcObject = stream; await video.play(); }

        const client = new CVServiceClient(CV_WS_URL, {
          onReady: () => {
            client.init(userAge, userSex, userHeight, sandbox, environment, seating);
            client.start();
          },
          onUpdate: (msg) => {
            setUpdate(msg);
            transitionPhase(msg.phase);
            if (msg.detection) setDetection(msg.detection);
            const v = cameraRef.current?.video;
            const c = cameraRef.current?.canvas ?? null;
            if (v) {
              drawSkeleton(c, v, msg.landmarks);
              drawHands(c, v, msg.hand_landmarks);
            }
          },
          onComplete: (msg) => {
            setPhase("done");
            onCompleteRef.current(msg.outcome);
          },
          onError: (msg) => {
            setErrorMsg(msg.message);
            setPhase("error");
          },
        });
        clientRef.current = client;
        await client.connect(testId);
        if (cancelled) { client.close(); return; }

        rafRef.current = requestAnimationFrame(captureLoop);
      } catch (err) {
        if (cancelled) return;
        const e = err as DOMException;
        setErrorMsg(
          e?.name === "NotAllowedError"
            ? "Camera permission was denied. Tap Back to return."
            : (e?.message || "Could not start the camera or connect to the CV service."),
        );
        setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      clientRef.current?.close();
      clientRef.current = null;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      const video = cameraRef.current?.video;
      if (video) video.srcObject = null;
    };
  }, [sessionStarted, environment, seating, testId, userAge, userSex, userHeight, sandbox, transitionPhase]);

  const stopEarly = () => clientRef.current?.stopEarly();
  const isSitReach = testId === "sit_reach";
  const recordingPaused = isSitReach && update?.form_valid === false && !!update?.recording_status;

  if (needsSetup && !sessionStarted) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col p-6">
        <button type="button" onClick={onBack} className="flex items-center gap-2 text-white text-lg font-semibold min-h-[48px] mb-6">
          <ArrowLeft size={24} /> Back
        </button>
        <div className="flex-1 flex flex-col items-center justify-center max-w-md mx-auto w-full gap-6">
          <h1 className="text-2xl font-bold text-white text-center">Sit &amp; Reach</h1>
          <p className="text-gray-400 text-center text-sm">
            Choose seating protocol and location. Hold furthest reach for 3 seconds.
            Score vs toes: − short, 0 at toes, + past.
          </p>

          <div className="w-full">
            <p className="text-xs text-gray-500 mb-2 font-semibold uppercase tracking-wide">Seating</p>
            <div className="grid grid-cols-2 gap-3 w-full">
              <button type="button" onClick={() => setSeating("chair")}
                className={cls(
                  "rounded-xl border p-4 text-left transition-all",
                  seating === "chair"
                    ? "border-amber-500 bg-amber-950/40 ring-2 ring-amber-500"
                    : "border-gray-700 bg-gray-800 hover:border-gray-600",
                )}>
                <Armchair size={20} className="text-amber-400 mb-2" />
                <div className="text-white font-semibold text-sm">Chair</div>
                <div className="text-gray-500 text-xs mt-1">One leg extended</div>
              </button>
              <button type="button" onClick={() => setSeating("floor")}
                className={cls(
                  "rounded-xl border p-4 text-left transition-all",
                  seating === "floor"
                    ? "border-sky-500 bg-sky-950/40 ring-2 ring-sky-500"
                    : "border-gray-700 bg-gray-800 hover:border-gray-600",
                )}>
                <Square size={20} className="text-sky-400 mb-2" />
                <div className="text-white font-semibold text-sm">Floor</div>
                <div className="text-gray-500 text-xs mt-1">Both legs extended</div>
              </button>
            </div>
          </div>

          <div className="w-full">
            <p className="text-xs text-gray-500 mb-2 font-semibold uppercase tracking-wide">Location</p>
            <div className="grid grid-cols-2 gap-3 w-full">
              <button type="button" onClick={() => setEnvironment("home")}
                className={cls(
                  "rounded-xl border p-4 text-left transition-all",
                  environment === "home"
                    ? "border-violet-500 bg-violet-950/50 ring-2 ring-violet-500"
                    : "border-gray-700 bg-gray-800 hover:border-gray-600",
                )}>
                <Home size={20} className="text-violet-400 mb-2" />
                <div className="text-white font-semibold text-sm">At home</div>
                <div className="text-gray-500 text-xs mt-1">Relaxed leg-form checks</div>
              </button>
              <button type="button" onClick={() => setEnvironment("clinic")}
                className={cls(
                  "rounded-xl border p-4 text-left transition-all",
                  environment === "clinic"
                    ? "border-emerald-500 bg-emerald-950/50 ring-2 ring-emerald-500"
                    : "border-gray-700 bg-gray-800 hover:border-gray-600",
                )}>
                <Stethoscope size={20} className="text-emerald-400 mb-2" />
                <div className="text-white font-semibold text-sm">At clinic</div>
                <div className="text-gray-500 text-xs mt-1">Strict clinical form</div>
              </button>
            </div>
          </div>

          <button type="button" onClick={() => setSessionStarted(true)}
            className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-4 rounded-xl text-lg">
            Begin test
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 relative flex flex-col">
      {sandbox && (
        <div className="bg-amber-950/60 border-b border-amber-800 text-amber-300 text-xs px-4 py-2 text-center">
          SANDBOX MODE — synthetic user data, no live patient records
        </div>
      )}

      {phase === "test" && update && (
        <>
          <div className="h-2 bg-gray-700">
            <div className="h-full bg-violet-500 transition-all duration-200"
              style={{ width: `${((update.time_remaining ?? 0) / 30) * 100}%` }} />
          </div>
          <div className="flex items-center justify-between px-4 py-3 bg-gray-800 gap-4">
            {update.reps !== undefined ? (
              <>
                <div>
                  <div className="text-gray-400 text-sm">REPS</div>
                  <div className="text-5xl font-black text-white leading-none">{update.reps}</div>
                </div>
                <div className="text-center">
                  {update.posture && <div className="text-yellow-400 text-lg font-bold uppercase">{update.posture}</div>}
                  {update.angle !== undefined && <div className="text-gray-500 text-sm">Hip angle: {Math.round(update.angle)}°</div>}
                </div>
              </>
            ) : isSitReach ? (
              <>
                <div>
                  <div className="text-gray-400 text-sm">REACH</div>
                  <div className={cls(
                    "text-4xl font-black leading-none",
                    update.form_valid ? "text-white" : "text-gray-600",
                  )}>
                    {update.form_valid ? formatCm(update.measurement ?? update.raw_measurement) : "—"}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    {update.form_valid ? "live" : "straighten leg"}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-gray-400 text-sm">OFFICIAL</div>
                  <div className="text-3xl font-black text-emerald-400 leading-none">
                    {formatCm(update.best_measurement)}
                  </div>
                  <div className="text-[10px] text-emerald-600 mt-0.5">valid holds only</div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div className="text-gray-400 text-sm">CURRENT</div>
                  <div className="text-4xl font-black text-white leading-none">{formatCm(update.measurement)}</div>
                </div>
                <div className="text-center">
                  <div className="text-gray-400 text-sm">BEST</div>
                  <div className="text-3xl font-black text-emerald-400 leading-none">{formatCm(update.best_measurement)}</div>
                </div>
              </>
            )}
            <div className="text-right">
              <div className="text-gray-400 text-sm">TIME LEFT</div>
              <div className={cls(
                "text-5xl font-black leading-none",
                (update.time_remaining ?? 99) <= 5 ? "text-red-400" : "text-white",
              )}>
                {Math.ceil(update.time_remaining ?? 0)}
              </div>
            </div>
          </div>
          {update.liveness_rolling !== undefined && (
            <div className="px-4 py-2 bg-gray-900">
              <LivenessDetection score={update.liveness_rolling} showDetails />
            </div>
          )}
          {isSitReach && update.recording_status && (
            <div className={cls(
              "px-4 py-2 border-t text-center",
              recordingPaused
                ? "bg-amber-950/80 border-amber-700"
                : update.recording_status === "Score locked!"
                ? "bg-emerald-950/80 border-emerald-700"
                : "bg-violet-950/60 border-violet-800",
            )}>
              <p className={cls(
                "text-sm font-semibold",
                recordingPaused ? "text-amber-200" : update.recording_status === "Score locked!" ? "text-emerald-200" : "text-violet-200",
              )}>
                {update.recording_status}
              </p>
            </div>
          )}
          {!isSitReach && update.form_hint && (
            <div className="px-4 py-2 bg-amber-950/80 border-t border-amber-700 text-center">
              <p className="text-amber-200 text-sm font-semibold">{update.form_hint}</p>
            </div>
          )}
        </>
      )}

      {(phase === "calibrating" || phase === "countdown") && (
        <div className="px-4 pt-10 pb-2">
          <button type="button" onClick={onBack} className="flex items-center gap-2 text-white text-lg font-semibold min-h-[48px] mb-2">
            <ArrowLeft size={24} /> Back
          </button>
          {phase === "calibrating" && (
            <>
              <h2 className="text-2xl font-bold text-white text-center mb-1">Calibrating…</h2>
              <p className="text-gray-300 text-base text-center">{calibrationPromptFor(testId, seating)}</p>
              {isSitReach && (
                <p className="text-violet-300 text-xs text-center mt-1">
                  {seating === "floor" ? "Floor" : "Chair"} ·{" "}
                  {environment === "clinic" ? "Clinic (strict)" : "Home (relaxed)"}
                </p>
              )}
            </>
          )}
        </div>
      )}

      <div className="flex-1 flex items-center justify-center p-4">
        <PoseCamera
          ref={cameraRef}
          overlayMessage={overlayMessageFor(phase, detection, update?.form_hint, isSitReach)}
          overlayTone={update?.form_hint || detection !== "ok" ? "warning" : undefined}
        >
          {isSitReach && phase === "test" && update && (
            <SitReachGamification
              rawCm={update.measurement ?? update.raw_measurement}
              bestCm={update.best_measurement}
              holdProgress={update.hold_progress}
              formValid={update.form_valid}
              status={update.recording_status}
              toe={pickToeAnchor(update.landmarks)}
            />
          )}
        </PoseCamera>
      </div>

      {phase === "calibrating" && update && (
        <div className="max-w-2xl mx-auto w-full p-4">
          <p className="text-base text-center mb-2">
            <span className={cls(detection === "ok" ? "text-emerald-400" : "text-amber-400")}>
              {detection === "ok"
                ? `Gathering… ${update.calib_samples ?? 0} samples`
                : detection === "partial"
                ? "Move so your full body is visible"
                : "Step into frame so we can see you"}
            </span>
            {update.calib_remaining_s !== undefined && update.calib_remaining_s > 0 && (
              <span className="text-violet-300"> · {update.calib_remaining_s.toFixed(1)}s left</span>
            )}
          </p>
          <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
            <div className="h-full bg-violet-500 rounded-full transition-all duration-200"
              style={{ width: `${(update.calib_progress ?? 0) * 100}%` }} />
          </div>
          {update.calib_quality !== undefined && (
            <p className={cls(
              "text-sm text-center mt-2",
              update.calib_quality >= 0.5 ? "text-emerald-400" : "text-amber-400",
            )}>
              Calibration quality: {Math.round(update.calib_quality * 100)}%
              {update.calib_quality < 0.5 && " — try a flatter surface or better lighting"}
            </p>
          )}
          {update.form_hint && (
            <p className="text-sm text-center mt-2 text-amber-300 font-semibold">
              {update.form_hint}
            </p>
          )}
        </div>
      )}

      {phase === "countdown" && update && (
        <div className="text-center p-6">
          <div className={cls(
            "font-black leading-none mb-2",
            (update.countdown ?? 0) > 0 ? "text-white text-8xl" : "text-green-400 text-6xl",
          )}>
            {(update.countdown ?? 0) > 0 ? update.countdown : "GO!"}
          </div>
          <p className="text-gray-300 text-xl">
            {(update.countdown ?? 0) > 0 ? "Get ready!" : "Reach for the star at your toes!"}
          </p>
        </div>
      )}

      {phase === "test" && (
        <div className="p-4">
          <button type="button" onClick={stopEarly}
            className="w-full bg-red-600 hover:bg-red-700 text-white text-lg font-bold py-3.5 rounded-xl min-h-[52px]">
            Stop Early
          </button>
        </div>
      )}

      {phase === "loading" && (
        <div className="absolute inset-0 bg-gray-900 z-50 flex flex-col items-center justify-center gap-4 p-8">
          <Loader size={56} className="text-violet-400 animate-spin" />
          <p className="text-white text-xl font-semibold text-center">Connecting to camera and CV service…</p>
          <p className="text-gray-400 text-base text-center max-w-md">
            Frames stream privately to the HANA CV service.
          </p>
          <button type="button" onClick={onBack} className="text-gray-400 text-base mt-4 hover:text-white">Cancel</button>
        </div>
      )}

      {phase === "error" && (
        <div className="absolute inset-0 bg-gray-900 z-50 flex flex-col p-4 pt-10">
          <button type="button" onClick={onBack} className="flex items-center gap-2 text-white text-lg font-semibold min-h-[48px] mb-6">
            <ArrowLeft size={24} /> Back
          </button>
          <div className="bg-amber-900/40 border border-amber-500/40 rounded-2xl p-4 mb-6 flex items-start gap-3">
            <AlertCircle size={22} className="text-amber-300 flex-shrink-0 mt-0.5" />
            <p className="text-amber-100 text-base">{errorMsg}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function formatCm(cm: number | undefined): string {
  if (cm === undefined || cm === null) return "—";
  return (cm >= 0 ? "+" : "") + cm.toFixed(1) + " cm";
}

function overlayMessageFor(
  phase: Phase,
  detection: Detection,
  formHint?: string,
  isSitReach?: boolean,
): string | undefined {
  if (isSitReach && phase === "test") return undefined;
  if (formHint) return formHint;
  if (phase !== "calibrating" && phase !== "countdown" && phase !== "test") return undefined;
  if (detection === "ok") return undefined;
  if (detection === "missing") return "Step into frame so we can see you";
  return "Move so your full body is visible";
}
