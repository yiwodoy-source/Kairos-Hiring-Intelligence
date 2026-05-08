import { getCalendarClient } from './google_client';

type AvailabilitySlot = {
    start: string;
    end: string;
    label: string;
};

type ScheduleCandidate = {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    applied_role?: string;
    current_role?: string;
};

type ScheduledInterview = {
    eventId: string;
    meetLink: string;
    start: string;
    end: string;
};

const DEFAULT_TIMEZONE = process.env.INTERVIEW_TIMEZONE || 'Asia/Kolkata';
const DEFAULT_SLOT_MINUTES = Number(process.env.INTERVIEW_SLOT_MINUTES || 30);
const DEFAULT_WINDOW_DAYS = Number(process.env.INTERVIEW_LOOKAHEAD_DAYS || 5);
const WORKDAY_START_HOUR = Number(process.env.INTERVIEW_WORKDAY_START_HOUR || 10);
const WORKDAY_END_HOUR = Number(process.env.INTERVIEW_WORKDAY_END_HOUR || 18);
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';

function toDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
}

function addMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * 60_000);
}

function isWeekday(date: Date): boolean {
    const day = date.getDay();
    return day >= 1 && day <= 5;
}

function formatSlotLabel(start: Date, end: Date): string {
    return `${start.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} ${start.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })} - ${end.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
}

function overlaps(start: Date, end: Date, busyStart: Date, busyEnd: Date): boolean {
    return start < busyEnd && end > busyStart;
}

export async function getInterviewAvailability(options?: {
    days?: number;
    slotMinutes?: number;
    from?: Date | string;
}): Promise<AvailabilitySlot[]> {
    const calendar = getCalendarClient();
    const slotMinutes = options?.slotMinutes || DEFAULT_SLOT_MINUTES;
    const days = options?.days || DEFAULT_WINDOW_DAYS;
    const rangeStart = toDate(options?.from || new Date());
    rangeStart.setSeconds(0, 0);

    const rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeEnd.getDate() + days);
    rangeEnd.setHours(23, 59, 59, 999);

    const freeBusy = await calendar.freebusy.query({
        requestBody: {
            timeMin: rangeStart.toISOString(),
            timeMax: rangeEnd.toISOString(),
            timeZone: DEFAULT_TIMEZONE,
            items: [{ id: CALENDAR_ID }]
        }
    });

    const busyWindows = (freeBusy.data.calendars?.[CALENDAR_ID]?.busy || []).map(window => ({
        start: new Date(window.start || ''),
        end: new Date(window.end || '')
    }));

    const slots: AvailabilitySlot[] = [];

    for (let offset = 0; offset < days; offset += 1) {
        const day = new Date(rangeStart);
        day.setDate(rangeStart.getDate() + offset);
        if (!isWeekday(day)) continue;

        const dayStart = new Date(day);
        dayStart.setHours(WORKDAY_START_HOUR, 0, 0, 0);
        const dayEnd = new Date(day);
        dayEnd.setHours(WORKDAY_END_HOUR, 0, 0, 0);

        for (let cursor = new Date(dayStart); addMinutes(cursor, slotMinutes) <= dayEnd; cursor = addMinutes(cursor, slotMinutes)) {
            const slotStart = new Date(cursor);
            const slotEnd = addMinutes(slotStart, slotMinutes);

            if (slotStart <= new Date()) continue;

            const hasConflict = busyWindows.some(window => overlaps(slotStart, slotEnd, window.start, window.end));
            if (!hasConflict) {
                slots.push({
                    start: slotStart.toISOString(),
                    end: slotEnd.toISOString(),
                    label: formatSlotLabel(slotStart, slotEnd)
                });
            }
        }
    }

    return slots.slice(0, 20);
}

export async function scheduleCandidateInterview(
    candidate: ScheduleCandidate,
    startTimeIso: string,
    durationMinutes: number,
    notes?: string
): Promise<ScheduledInterview> {
    const calendar = getCalendarClient();
    const start = new Date(startTimeIso);
    if (Number.isNaN(start.getTime())) {
        throw new Error('Invalid startTime provided');
    }

    const end = addMinutes(start, durationMinutes || DEFAULT_SLOT_MINUTES);
    const fullName = [candidate.first_name, candidate.last_name].filter(Boolean).join(' ').trim() || 'Candidate';
    const role = candidate.applied_role || candidate.current_role || 'the role';
    const summary = `Interview - ${fullName} (${role})`;
    const description = [
        `Candidate: ${fullName}`,
        `Email: ${candidate.email}`,
        `Applied Role: ${role}`,
        notes ? `Notes: ${notes}` : '',
        '',
        'Scheduled via Talent Operations Console'
    ].filter(Boolean).join('\n');

    const requestId = `toc-${candidate.id}-${Date.now()}`;
    const event = await calendar.events.insert({
        calendarId: CALENDAR_ID,
        conferenceDataVersion: 1,
        sendUpdates: 'all',
        requestBody: {
            summary,
            description,
            start: {
                dateTime: start.toISOString(),
                timeZone: DEFAULT_TIMEZONE
            },
            end: {
                dateTime: end.toISOString(),
                timeZone: DEFAULT_TIMEZONE
            },
            attendees: candidate.email ? [{ email: candidate.email }] : undefined,
            conferenceData: {
                createRequest: {
                    requestId,
                    conferenceSolutionKey: {
                        type: 'hangoutsMeet'
                    }
                }
            }
        }
    });

    return {
        eventId: event.data.id || '',
        meetLink: event.data.hangoutLink || event.data.conferenceData?.entryPoints?.find(point => point.entryPointType === 'video')?.uri || '',
        start: start.toISOString(),
        end: end.toISOString()
    };
}
