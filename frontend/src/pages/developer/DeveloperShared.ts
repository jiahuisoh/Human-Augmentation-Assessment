import { BASE_URL, CV_HTTP_URL, healthApi } from "../../utils/api";

export interface HealthCheck {
  label: string;
  ok: boolean;
  detail: string;
}

export interface HealthReport {
  checkedAt: string;
  checks: HealthCheck[];
  uptimeSeconds: number | null;
  node: string | null;
}

const reasonOf = (err: unknown, unreachable: string): string => {
  const message = err instanceof Error ? err.message : "unknown error";
  if (message === "BACKEND_UNREACHABLE" || message === "UNREACHABLE") return unreachable;
  return message;
};

/**
 * Probe every leg independently. Promise.allSettled rather than Promise.all:
 * one service being down is exactly when the others' results matter most, so a
 * single rejection must not collapse the whole report.
 */
export async function runHealthChecks(): Promise<HealthReport> {
  const [live, system, cv] = await Promise.allSettled([
    healthApi.liveness(),
    healthApi.system(),
    healthApi.cvService(),
  ]);

  const checks: HealthCheck[] = [];

  checks.push(live.status === "fulfilled"
    ? { label: "Backend", ok: true, detail: `Responding at ${BASE_URL}` }
    : { label: "Backend", ok: false, detail: reasonOf(live.reason, `No response from ${BASE_URL}`) });

  if (system.status === "fulfilled") {
    const { database, cvSigningSecret } = system.value;
    const state = database.state.charAt(0).toUpperCase() + database.state.slice(1);
    checks.push({
      label: "Database",
      ok: database.ok,
      detail: database.ok
        ? `${state}${database.name ? ` · ${database.name}` : ""} · ping ${database.pingMs} ms`
        : `${state} — no round-trip`,
    });
    checks.push({
      label: "CV Signing Secret",
      ok: cvSigningSecret === "configured",
      // Both services must hold the SAME value; we can only see our own side.
      detail: cvSigningSecret === "configured"
        ? "Configured in Backend"
        : "Missing - Backend will not sign assessment grants",
    });
  } else {
    const detail = reasonOf(system.reason, `No response from ${BASE_URL}`);
    checks.push({ label: "Database", ok: false, detail });
    checks.push({ label: "CV Signing Secret", ok: false, detail });
  }

  checks.push(cv.status === "fulfilled"
    ? { label: "CV Service", ok: true, detail: `${cv.value.service} responding at ${CV_HTTP_URL}` }
    : { label: "CV Service", ok: false, detail: reasonOf(cv.reason, `No response from ${CV_HTTP_URL}`) });

  return {
    checkedAt: new Date().toISOString(),
    checks,
    uptimeSeconds: system.status === "fulfilled" ? system.value.uptimeSeconds : null,
    node: system.status === "fulfilled" ? system.value.node : null,
  };
}

/** "2h 14m" / "3m 07s" - uptime is read at a glance, not to the second. */
export function formatUptime(seconds: number | null): string {
  if (seconds === null) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}
