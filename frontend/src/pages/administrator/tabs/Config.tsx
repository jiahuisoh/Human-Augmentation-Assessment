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
        <div key={title} className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">{title}</h3>
          {items.map(([l, v]) => (
            <div key={l} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
              <span className="text-xs text-gray-500">{l}</span>
              <span className="text-xs font-semibold text-emerald-600">{v}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
