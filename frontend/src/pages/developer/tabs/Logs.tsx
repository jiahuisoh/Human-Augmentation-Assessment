import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, RefreshCw, Search } from "lucide-react";
import { cls, formatLogStamp } from "../../../utils/helpers";
import { AUDIT_CATEGORY_STYLE, AUDIT_LEVEL_STYLE } from "../../../utils/constants";
import type { AuditCategory, AuditLevel, AuditLog } from "../../../types";

interface LogsProps {
  logs: AuditLog[];
  error?: string;
  busy?: boolean;
  onRefresh: () => void;
}


const LEVELS: readonly AuditLevel[] = ["INFO", "WARN", "ERROR"];

const contextOf = (log: AuditLog): string =>
  log.context && Object.keys(log.context).length > 0
    ? JSON.stringify(log.context, null, 2)
    : "";

export default function Logs({ logs, error, busy = false, onRefresh }: LogsProps) {
  const [query, setQuery]       = useState("");
  const [category, setCategory] = useState<AuditCategory | "ALL">("ALL");
  const [level, setLevel]       = useState<AuditLevel | "ALL">("ALL");
  const [openId, setOpenId]     = useState<string | null>(null);

  const scoped = logs;

  // Search text is built once per fetch rather than per keystroke: stringifying
  // every context on each character typed would redo the work for the whole list.
  const indexed = useMemo(
    () => scoped.map(log => ({
      log,
      haystack: `${log.message} ${log.category} ${log.level} ${log.actorRole} ${contextOf(log)}`.toLowerCase(),
    })),
    [scoped],
  );

  // Counts drive the chips, and the chips are drawn from what is actually
  // present - an empty category is not worth a filter nobody can use.
  const { byCategory, byLevel } = useMemo(() => {
    const cats = new Map<AuditCategory, number>();
    const levels = { INFO: 0, WARN: 0, ERROR: 0 } as Record<AuditLevel, number>;
    for (const l of scoped) {
      cats.set(l.category, (cats.get(l.category) ?? 0) + 1);
      levels[l.level]++;
    }
    return { byCategory: [...cats.entries()].sort(([a], [b]) => a.localeCompare(b)), byLevel: levels };
  }, [scoped]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return indexed
      .filter(({ log, haystack }) =>
        (category === "ALL" || log.category === category)
        && (level === "ALL" || log.level === level)
        && (q === "" || haystack.includes(q)))
      .map(({ log }) => log);
  }, [indexed, category, level, query]);

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-xs font-medium text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-400" />
          <div className="w-2 h-2 rounded-full bg-amber-400" />
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-gray-500 text-xs font-mono ml-2">HANA-Platform · Technical Logs · Developer View</span>
          <span className="ml-auto text-xs text-gray-400 tabular-nums">
            {visible.length === scoped.length
              ? `${scoped.length} event${scoped.length === 1 ? "" : "s"}`
              : `${visible.length} of ${scoped.length}`}
          </span>
          <button type="button" onClick={onRefresh} disabled={busy} aria-label="Refresh technical logs"
            className="p-1.5 rounded-lg text-gray-400 hover:text-amber-700 hover:bg-amber-50 disabled:opacity-50 transition-colors">
            <RefreshCw size={13} className={cls(busy && "animate-spin")} />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-gray-100 space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={query} onChange={e => setQuery(e.target.value)}
              aria-label="Search technical logs"
              placeholder="Search message, category or context…"
              className="w-full pl-9 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:border-amber-500 focus:outline-none" />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Chip label="All" count={scoped.length} active={category === "ALL"} onSelect={() => setCategory("ALL")} />
            {byCategory.map(([cat, count]) => (
              <Chip key={cat} label={cat} count={count}
                active={category === cat} onSelect={() => setCategory(cat)} />
            ))}
            {LEVELS.some(lv => byLevel[lv] > 0 && lv !== "INFO") && <span className="w-px h-4 bg-gray-200 mx-1" />}
            {LEVELS.filter(lv => byLevel[lv] > 0 && lv !== "INFO").map(lv => (
              // Selecting the active level again clears it, so the row never
              // traps you in a filter with no visible way back to everything.
              <Chip key={lv} label={lv} count={byLevel[lv]}
                active={level === lv} onSelect={() => setLevel(level === lv ? "ALL" : lv)} />
            ))}
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto font-mono text-xs divide-y divide-gray-50">
          {visible.map(l => {
            const detail = contextOf(l);
            const open = openId === l._id;
            return (
              <div key={l._id}>
                <button type="button" aria-expanded={open}
                  onClick={() => setOpenId(open ? null : l._id)}
                  className="w-full text-left flex items-start gap-3 px-4 py-2 hover:bg-gray-50 transition-colors">
                  <span className="text-gray-400 flex-shrink-0 w-36">{formatLogStamp(l.createdAt)}</span>
                  <span className={cls("flex-shrink-0 w-11", AUDIT_LEVEL_STYLE[l.level])}>{l.level}</span>
                  <span className={cls(
                    "px-1.5 py-0.5 rounded text-[10px] font-semibold border flex-shrink-0 self-start",
                    AUDIT_CATEGORY_STYLE[l.category],
                  )}>
                    {l.category}
                  </span>
                  {/* min-w-0 so a long message wraps instead of pushing the row wide. */}
                  <span className={cls("flex-1 min-w-0 break-words", l.level === "INFO" ? "text-gray-700" : AUDIT_LEVEL_STYLE[l.level])}>
                    {l.message}
                  </span>
                  {open
                    ? <ChevronDown size={13} className="text-gray-400 flex-shrink-0 mt-0.5" />
                    : <ChevronRight size={13} className="text-gray-300 flex-shrink-0 mt-0.5" />}
                </button>

                {open && (
                  <div className="px-4 pb-3 space-y-1.5">
                    <div className="text-gray-500">
                      actor <span className="text-gray-800">{l.actorRole}</span>
                      <span className="text-gray-300"> · </span>
                      <span className="text-gray-800 break-all">{l.actorId}</span>
                    </div>
                    {detail
                      ? <pre className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 whitespace-pre-wrap break-all">{detail}</pre>
                      : <p className="text-gray-400">No additional context was recorded for this event.</p>}
                  </div>
                )}
              </div>
            );
          })}

          {visible.length === 0 && (
            <p className="px-4 py-12 text-center text-sm text-gray-400">
              {scoped.length === 0
                ? "No technical events recorded yet. Run a CV sandbox test to generate some."
                : "No events match the current search or filter."}
            </p>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-3 text-xs text-gray-500">
        Operational Events: CV Pipeline, Log-In Behaviour and Assessment Activity.
        Account Emails and Every Client, User and respective Target IDs are replaced with
        <span className="font-mono"> [redacted] </span>
        before the event leaves the server, so activity can be followed without identifying anyone.
      </div>
    </div>
  );
}

interface ChipProps {
  label: string;
  count: number;
  active: boolean;
  onSelect: () => void;
}

function Chip({ label, count, active, onSelect }: ChipProps) {
  return (
    <button type="button" onClick={onSelect} aria-pressed={active}
      className={cls(
        "px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors",
        active
          ? "bg-amber-600 text-white border-amber-600"
          : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50",
      )}>
      {label}
      <span className={cls("ml-1.5 tabular-nums", active ? "text-amber-100" : "text-gray-400")}>{count}</span>
    </button>
  );
}
