// Påmindelser: minutter før start. Heldagsaftaler regnes fra midnat
// (360 = dagen før kl. 18, -480 = samme dag kl. 8). NULL = ingen påmindelse.

export type ReminderChoice = { value: number | null; label: string }

const TIMED: ReminderChoice[] = [
  { value: null, label: 'Ingen' },
  { value: 0, label: 'På tidspunktet' },
  { value: 15, label: '15 min. før' },
  { value: 30, label: '30 min. før' },
  { value: 60, label: '1 time før' },
  { value: 120, label: '2 timer før' },
  { value: 1440, label: 'Dagen før' },
]

const ALL_DAY: ReminderChoice[] = [
  { value: null, label: 'Ingen' },
  { value: -480, label: 'Samme dag kl. 8' },
  { value: 360, label: 'Dagen før kl. 18' },
]

/** Standard for nye aftaler: 1 time før – heldagsaftaler (fx ferie) får ingen */
export function defaultReminder(allDay: boolean) {
  return allDay ? null : 60
}

function customLabel(minutes: number) {
  if (minutes < 0) return `${Math.round(-minutes / 60)} timer efter midnat`
  if (minutes % 1440 === 0) return minutes === 1440 ? 'Dagen før' : `${minutes / 1440} dage før`
  if (minutes % 60 === 0) return minutes === 60 ? '1 time før' : `${minutes / 60} timer før`
  return `${minutes} min. før`
}

/** Valgmulighederne – en værdi der ikke er i listen (fx fra en ældre version) bevares */
export function reminderChoices(allDay: boolean, current: number | null): ReminderChoice[] {
  const list = allDay ? ALL_DAY : TIMED
  if (current === null || list.some((c) => c.value === current)) return list
  return [...list, { value: current, label: customLabel(current) }]
}

/** Skift mellem heldag og klokkeslæt: behold valget hvis det giver mening, ellers standard */
export function reminderAfterAllDayChange(current: number | null, allDay: boolean) {
  if (current === null) return null
  return (allDay ? ALL_DAY : TIMED).some((c) => c.value === current) ? current : defaultReminder(allDay)
}
