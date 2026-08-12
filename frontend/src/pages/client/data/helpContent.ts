import type { LucideIcon } from "lucide-react";
import {
  Phone, Mail, MapPin, Siren, Stethoscope, HeartHandshake,
  Camera, Lock,
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
      { q: "The screen looks frozen during my test.",         a: "This usually means a slow connection. Close other browser tabs or apps. If it continues, tap \"Stop Early\". Your session can be restarted by a clinician." },
      { q: "Is my camera video recorded?",                     a: "No. Camera frames stream to the HANA CV service for analysis only and are never recorded or saved. Only the final result (e.g. \"14 reps\") is stored." },
    ],
  },
  {
    id: "privacy", heading: "Privacy & Data", Icon: Lock,
    faqs: [
      { q: "Where is my health data stored?",         a: "Your health data is kept in a secure database. Access is restricted by role, and consent changes are recorded with a timestamp and who made them." },
      { q: "Who can see my health records?",          a: "Only your assigned clinician and authorised HANA Administrator (for governance / audit). Sensitive actions on your records are logged. HANA Staff see operational data only and cannot see clinical scores." },
      { q: "Can I revoke consent for data sharing?", a: "Yes. Ask at your clinic: a clinician or administrator can record your consent withdrawal, and it applies immediately. Every consent change is logged with a timestamp." },
      { q: "Is HANA PDPA-compliant?",                  a: "HANA is designed around Singapore's Personal Data Protection Act. Your data is used only for your care and is never sold or shared with third parties." },
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
  { Icon: Phone,  label: "Call the centre",  value: "6123-4567",                  sub: "Mon-Fri, 9am-5pm",            href: "tel:+6561234567" },
  { Icon: Mail,   label: "Email support",     value: "support@hana.sg",            sub: "Get a response within 1-2 working days",  href: "mailto:support@hana.sg" },
  { Icon: MapPin, label: "In person",         value: "Visit your assigned clinic", sub: "Any HANA Staff member can help", href: null },
];
