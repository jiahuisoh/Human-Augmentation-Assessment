interface ConfigSection {
  title: string;
  items: ReadonlyArray<readonly [string, string]>;
}

const SECTIONS: ReadonlyArray<ConfigSection> = [
  {
    title: "Cross-function principles",
    items: [
      ["Least privilege",            "Enforced"],
      ["Role-based access control",  "5 roles active"],
      ["Human-in-the-loop AI",       "Clinician approval required"],
      ["Auditability",                "All sensitive actions logged"],
      ["Data minimisation",           "Configured"],
      ["Off-chain clinical data",     "Enforced"],
    ],
  },
  {
    title: "Data governance",
    items: [
      ["PDPA compliance",          "Enabled"],
      ["Consent management",        "Active"],
      ["Data retention policy",     "7 years"],
      ["Anonymisation",             "Active for research"],
      ["Breach notification",       "Configured"],
      ["DPO contact",               "dpo@hana.sg"],
    ],
  },
];

export default function Config() {
  return (
    <div className="grid grid-cols-2 gap-4">
      {SECTIONS.map(({ title, items }) => (
        <div key={title} className="bg-slate-800 border border-slate-700 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">{title}</h3>
          {items.map(([l, v]) => (
            <div key={l} className="flex items-center justify-between py-1.5 border-b border-slate-700 last:border-0">
              <span className="text-xs text-slate-500">{l}</span>
              <span className="text-xs font-semibold text-emerald-400">{v}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
