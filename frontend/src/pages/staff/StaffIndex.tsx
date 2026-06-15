import { useEffect, useState } from "react";
import {
  Users, Calendar, CheckCircle, ShieldCheck,
} from "lucide-react";
import { firstNameOf } from "../../utils/helpers";
import { auditApi, scheduleApi, userApi } from "../../utils/api";
import SidebarLayout, { type NavItem } from "../../components/SidebarLayout";
import type { ScheduleEntry, User } from "../../types";

import Schedule    from "./tabs/Schedule";
import ClientList  from "./tabs/ClientList";
import Attendance  from "./tabs/Attendance";
import Nric        from "./tabs/Nric";

type TabId = "schedule" | "patients" | "attendance" | "nric";

const TABS: ReadonlyArray<NavItem & { id: TabId }> = [
  { id: "schedule",   label: "Today's Schedule",  Icon: Calendar    },
  { id: "patients",   label: "Client List",       Icon: Users       },
  { id: "attendance", label: "Record Attendance", Icon: CheckCircle },
  { id: "nric",       label: "NRIC Verification", Icon: ShieldCheck },
];

interface StaffProps {
  user: User;
  onSignOut: () => void;
}

export default function Staff({ user, onSignOut }: StaffProps) {
  const [tab, setTab]             = useState<TabId>("schedule");
  const [schedule, setSchedule]   = useState<ScheduleEntry[]>([]);
  const [search, setSearch]       = useState("");

  useEffect(() => {
    void scheduleApi.listToday().then(setSchedule);
  }, []);

  const completed   = schedule.filter(s => s.status === "completed" || s.status === "present").length;
  const pendingNric = schedule.filter(s => !s.nricVerified).length;

  const markAttendance = async (id: string, present: boolean): Promise<void> => {
    const updated = await scheduleApi.recordAttendance(id, present);
    setSchedule(prev => prev.map(s => s._id === id ? updated : s));
    await auditApi.write({
      actorId: user._id, actorRole: "staff", category: "ASSESSMENT", level: "INFO",
      message: `Attendance recorded — ${updated.clientName}: ${present ? "present" : "absent"}`,
    });
  };

  const verifyNric = async (clientId: string, last4: string): Promise<void> => {
    await userApi.verifyNric(clientId, last4);
    setSchedule(prev => prev.map(s =>
      s.clientId === clientId
        ? { ...s, nricVerified: true, status: s.status === "pending_nric" ? "scheduled" : s.status }
        : s,
    ));
    await auditApi.write({
      actorId: user._id, actorRole: "staff", category: "AUTH", level: "INFO",
      message: `NRIC verified for client ${clientId} (last 4: ${last4.slice(-4)})`,
    });
  };

  return (
    <SidebarLayout
      user={user} tabs={TABS} activeTab={tab} onTab={id => setTab(id as TabId)}
      onSignOut={onSignOut} accent="teal"
      headerLeft={
        <div>
          <div className="text-base font-semibold text-gray-900">Good morning, {firstNameOf(user.name)}</div>
          <div className="text-xs text-gray-400">
            {completed} completed · {pendingNric} awaiting NRIC verification
          </div>
        </div>
      }
    >
      {tab === "schedule"   && <Schedule    schedule={schedule} />}
      {tab === "patients"   && <ClientList  schedule={schedule} search={search} onSearch={setSearch} />}
      {tab === "attendance" && <Attendance  schedule={schedule} onMark={markAttendance} />}
      {tab === "nric"       && <Nric        schedule={schedule} onVerify={verifyNric} />}
    </SidebarLayout>
  );
}
