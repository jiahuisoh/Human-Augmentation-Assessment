import type { LucideIcon } from "lucide-react";
import {
  Phone, Mail, MapPin, Siren, Stethoscope, HeartHandshake,
  Camera, Gift, Lock,
} from "lucide-react";

export interface EmergencyNumberCard {
  number: string;
  label: string;
  sub: string;
  bg: string;
  ring: string;
  Icon: LucideIcon;
}

export const EMERGENCY_NUMBERS: ReadonlyArray<EmergencyNumberCard> = [
  { number: "995",           label: "Emergency Services", sub: "Police · Ambulance · Fire",  bg: "bg-red-600",     ring: "ring-2 ring-red-300", Icon: Siren          },
  { number: "1800-650-6060", label: "AIC Hotline",        sub: "Agency for Integrated Care", bg: "bg-blue-600",    ring: "",                    Icon: Stethoscope    },
  { number: "1800-555-0123", label: "CareLine 24/7",      sub: "Friendly support, any time", bg: "bg-emerald-600", ring: "",                    Icon: HeartHandshake },
];

export interface FAQEntry { q: string; a: string }
export interface FAQSection { id: string; heading: string; Icon: LucideIcon; faqs: FAQEntry[] }

export const FAQ_SECTIONS: ReadonlyArray<FAQSection> = [
  {
    id: "camera", heading: "Camera & Assessment", Icon: Camera,
    faqs: [
      { q: "Why isn't my camera turning on?",                a: "Look for a small camera icon or padlock at the very top of your screen, near the website address. Click it, then select \"Allow Camera\". If still stuck, ask a HANA Staff member at your clinic for help." },
      { q: "The system isn't counting my repetitions correctly.", a: "Make sure your full body is visible from hips to ankles. A side-on view gives the most accurate count. The screen also tells you if you need to step back or move into frame." },
      { q: "The screen looks frozen during my test.",         a: "This usually means a slow connection. Close other browser tabs or apps. If it continues, tap \"Stop Early\" — your session can be restarted by a clinician." },
      { q: "Is my camera video recorded?",                     a: "No. Camera frames stream to the HANA CV service for analysis only — they are never recorded or saved. Only the final result (e.g. \"14 reps\") is stored." },
    ],
  },
  {
    id: "rewards", heading: "Tokens & Rewards", Icon: Gift,
    faqs: [
      { q: "Where do my tokens go?",                a: "Tokens are stored in your HANA wallet. View them in the \"Rewards\" tab. They are non-transferable, non-financial, and tied to engagement — not to clinical outcome." },
      { q: "Why didn't I earn tokens for my test?", a: "Two gates must pass: (1) your account must be verified by HANA Staff (NRIC verification), and (2) your liveness score must be 70% or higher. Both protect against gaming and ensure tokens reward real engagement." },
      { q: "How do I redeem rewards?",              a: "Open the Rewards tab and tap a redemption item from the catalogue. HANA Staff can assist you at the clinic." },
      { q: "Can I transfer tokens to someone else?", a: "No — tokens are non-transferable by design (HANA governance principle). This prevents trading, gaming, and inappropriate commercialisation." },
    ],
  },
  {
    id: "privacy", heading: "Privacy & Data", Icon: Lock,
    faqs: [
      { q: "Where is my health data stored?",         a: "Raw health data stays in a secure off-chain database. Only consent events, record hashes, and verification proofs are written to the blockchain — never raw clinical data." },
      { q: "Who can see my health records?",          a: "Only your assigned clinician and authorised HANA Administrator (for governance / audit). All access is logged with a timestamp. HANA Staff see operational data only — they cannot see clinical scores." },
      { q: "Can I revoke consent for data sharing?", a: "Yes. Go to \"My Records\" and toggle any consent off. The revocation is recorded on the blockchain and applied immediately." },
      { q: "Is HANA PDPA-compliant?",                  a: "Yes. HANA complies with Singapore's Personal Data Protection Act. Data lives on Singapore-based servers and is never sold or shared with third parties." },
    ],
  },
];

export interface ContactChannel {
  Icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  href: string | null;
}

export const CONTACT_CHANNELS: ReadonlyArray<ContactChannel> = [
  { Icon: Phone,  label: "Call the centre",  value: "6123-4567",                  sub: "Mon–Fri, 9am–5pm",            href: "tel:+6561234567" },
  { Icon: Mail,   label: "Email support",     value: "support@hana.sg",            sub: "Reply within 1 working day",  href: "mailto:support@hana.sg" },
  { Icon: MapPin, label: "In person",         value: "Visit your assigned clinic", sub: "Any HANA Staff member can help", href: null },
];
