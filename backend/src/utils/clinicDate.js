// ScheduleEntry.date is a clinic-local calendar day ("YYYY-MM-DD") and .time is
// a clinic-local "HH:MM", so "now" has to be computed in that same frame.
// new Date().toISOString() gives the UTC day, which in Singapore (UTC+8) is
// still yesterday until 08:00 local - the whole morning would be invisible to
// the front desk, and a past-time check would be eight hours out.
const TIME_ZONE = process.env.CLINIC_TIME_ZONE || "Asia/Singapore";

// Intl formatters are expensive to construct; one pair per process is enough.
// "en-CA" is the locale whose short date format is already YYYY-MM-DD.
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// hourCycle "h23" rather than hour12:false - several locales answer the latter
// with a 1-24 clock, which renders midnight as "24:00" and would sort after
// every other time of day.
const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Today in the clinic's timezone, as "YYYY-MM-DD". */
const clinicToday = () => dayFormatter.format(new Date());

/**
 * The clinic's current date and time. Both formatters read the same instant, so
 * the pair can never straddle a midnight boundary.
 */
const clinicNow = () => {
  const instant = new Date();
  return { date: dayFormatter.format(instant), time: timeFormatter.format(instant) };
};

module.exports = { clinicToday, clinicNow, TIME_ZONE };
