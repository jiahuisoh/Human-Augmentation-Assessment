import type { ReactNode } from "react";
import { LogOut, type LucideIcon } from "lucide-react";
import { cls, initialsOf } from "../utils/helpers";
import type { Role, User } from "../types";

export interface NavItem {
  id: string;
  label: string;
  Icon: LucideIcon;
}

type Accent = "teal" | "violet" | "amber" | "indigo" | "blue";

const ACCENT_BG: Record<Accent, string>     = { teal:"bg-teal-50",   violet:"bg-violet-50",   amber:"bg-amber-50",   indigo:"bg-indigo-50",   blue:"bg-blue-50" };
const ACCENT_TXT: Record<Accent, string>    = { teal:"text-teal-700", violet:"text-violet-700", amber:"text-amber-700", indigo:"text-indigo-700", blue:"text-blue-700" };
const ACCENT_PILL_BG: Record<Accent, string>  = { teal:"bg-teal-50",   violet:"bg-violet-50",   amber:"bg-amber-50",   indigo:"bg-indigo-50",   blue:"bg-blue-50" };
const ACCENT_PILL_TXT: Record<Accent, string> = { teal:"text-teal-600", violet:"text-violet-600", amber:"text-amber-600", indigo:"text-indigo-600", blue:"text-blue-600" };
const ACCENT_PILL_BR: Record<Accent, string>  = { teal:"border-teal-200", violet:"border-violet-200", amber:"border-amber-200", indigo:"border-indigo-200", blue:"border-blue-200" };

const ROLE_TITLES: Record<Role, string> = {
  client: "Client", staff: "Staff Operations", clinician: "Clinician Portal",
  developer: "Developer Console", administrator: "Administrator",
};

interface SidebarLayoutProps {
  user: User;
  tabs: readonly NavItem[];
  activeTab: string;
  onTab: (id: string) => void;
  onSignOut: () => void;
  accent: Accent;
  headerLeft?: ReactNode;
  headerRight?: ReactNode;
  children: ReactNode;
}

export default function SidebarLayout({
  user, tabs, activeTab, onTab, onSignOut, accent, headerLeft, headerRight, children,
}: SidebarLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0">
        <div className="px-5 py-5 border-b border-gray-200">
          <div className="text-sm font-bold text-gray-900">HANA Platform</div>
          <div className="text-xs text-gray-400 mt-0.5">{ROLE_TITLES[user.role]}</div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {tabs.map(({ id, label, Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onTab(id)}
                className={cls(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors text-left min-h-[40px]",
                  isActive
                    ? `${ACCENT_BG[accent]} ${ACCENT_TXT[accent]} font-medium`
                    : "text-gray-600 hover:bg-gray-50",
                )}
              >
                <Icon size={15} className="flex-shrink-0" />
                {label}
              </button>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-gray-200">
          <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
            <div className={cls("w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold", ACCENT_BG[accent], ACCENT_TXT[accent])}>
              {initialsOf(user.name)}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-gray-900 truncate">{user.name}</div>
              <div className="text-xs text-gray-400 capitalize">{user.role}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 overflow-y-auto">
        <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10 flex items-center justify-between">
          <div>{headerLeft}</div>
          <div className="flex items-center gap-2">
            {headerRight}
            <span className={cls(
              "text-xs px-2 py-1 rounded-full font-medium border capitalize",
              ACCENT_PILL_BG[accent], ACCENT_PILL_TXT[accent], ACCENT_PILL_BR[accent],
            )}>
              {user.role}
            </span>
          </div>
        </header>
        <div className="px-6 py-5 w-full">{children}</div>
      </div>
    </div>
  );
}
