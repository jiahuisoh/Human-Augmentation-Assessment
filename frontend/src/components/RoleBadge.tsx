import type { Role } from "../types";
import { cls } from "../utils/helpers";

interface RoleBadgeProps {
  role: Role;
  className?: string;
}

const STYLES: Record<Role, string> = {
  client:        "bg-blue-50 text-blue-700 border-blue-200",
  staff:         "bg-teal-50 text-teal-700 border-teal-200",
  clinician:     "bg-violet-50 text-violet-700 border-violet-200",
  developer:     "bg-amber-50 text-amber-700 border-amber-200",
  administrator: "bg-indigo-50 text-indigo-700 border-indigo-200",
};

export default function RoleBadge({ role, className }: RoleBadgeProps) {
  return (
    <span className={cls("px-2.5 py-0.5 rounded-full text-xs font-semibold border capitalize", STYLES[role], className)}>
      {role}
    </span>
  );
}
