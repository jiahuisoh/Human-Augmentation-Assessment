import type { AttendanceStatus } from "../../types";

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  scheduled:    "Scheduled",
  present:      "Present",
  absent:       "Absent",
  in_progress:  "In progress",
  completed:    "Completed",
  pending_nric: "Pending NRIC",
};

export const STATUS_STYLE: Record<AttendanceStatus, string> = {
  scheduled:    "bg-gray-100 text-gray-500 border-gray-200",
  present:      "bg-green-50 text-green-700 border-green-200",
  absent:       "bg-red-50 text-red-700 border-red-200",
  in_progress:  "bg-blue-50 text-blue-700 border-blue-200",
  completed:    "bg-green-50 text-green-700 border-green-200",
  pending_nric: "bg-amber-50 text-amber-700 border-amber-200",
};
