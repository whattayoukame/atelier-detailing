import { addMinutes, format } from 'date-fns';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import type { Studio, Service, Booking, Availability } from './domain';

export function localDate(date: Date, timezone: string) { return formatInTimeZone(date, timezone, 'yyyy-MM-dd'); }
export function prettyDate(iso: string, timezone: string) { return formatInTimeZone(new Date(iso), timezone, 'd MMMM, HH:mm'); }
export function isoSlot(date: string, hhmm: string, timezone: string) { return fromZonedTime(`${date}T${hhmm}:00`, timezone).toISOString(); }

/** Slot candidates are starts of real bay occupancy intervals, not just labels on a calendar. */
export function calculateAvailability(studio: Studio, service: Service, date: string, bookings: Booking[], now = new Date()): Availability {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  const hours = studio.schedule[String(day)];
  if (!hours || studio.daysOff.includes(date) || !service.enabled) return { date, available: [], unavailable: [] };
  const from = Number(hours.open.slice(0, 2)) * 60 + Number(hours.open.slice(3));
  const to = Number(hours.close.slice(0, 2)) * 60 + Number(hours.close.slice(3));
  const available: string[] = [], unavailable: string[] = [];
  for (let m = Math.ceil(from / 30) * 30; m < to; m += 30) {
    if (service.durationMinutes < 1440 && m + service.durationMinutes > to) break;
    const startsAt = isoSlot(date, `${String(Math.floor(m / 60)).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`, studio.timezone);
    const startMs = Date.parse(startsAt);
    if (startMs < now.getTime() + 30 * 60_000) continue;
    const endMs = addMinutes(new Date(startsAt), service.durationMinutes + service.bufferMinutes).getTime();
    const hasBay = studio.bays.some(bay => bay.enabled && !bookings.some(b => b.status !== 'cancelled' && b.bayId === bay.id && Date.parse(b.startsAt) < endMs && Date.parse(b.endsAt) > startMs));
    (hasBay ? available : unavailable).push(startsAt);
  }
  return { date, available, unavailable };
}
export function hourLabel(iso: string, timezone: string) { return formatInTimeZone(new Date(iso), timezone, 'HH:mm'); }
export function weekDay(isoDay: string) { return format(new Date(`${isoDay}T12:00:00`), 'EEE'); }
