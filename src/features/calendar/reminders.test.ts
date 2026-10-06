import { describe, expect, it } from 'vitest'
import { defaultReminder, reminderAfterAllDayChange, reminderChoices } from './reminders'

describe('påmindelser', () => {
  it('standard: 1 time før, men ingen for heldagsaftaler', () => {
    expect(defaultReminder(false)).toBe(60)
    expect(defaultReminder(true)).toBeNull()
  })

  it('valg afhænger af heldag', () => {
    expect(reminderChoices(false, 60).map((c) => c.label)).toContain('1 time før')
    expect(reminderChoices(true, null).map((c) => c.label)).toEqual(['Ingen', 'Samme dag kl. 8', 'Dagen før kl. 18'])
  })

  it('ukendt værdi bevares som eget valg', () => {
    const c = reminderChoices(false, 45)
    expect(c.at(-1)).toEqual({ value: 45, label: '45 min. før' })
    expect(reminderChoices(false, 180).at(-1)?.label).toBe('3 timer før')
  })

  it('skift til/fra heldag', () => {
    expect(reminderAfterAllDayChange(60, true)).toBeNull()
    expect(reminderAfterAllDayChange(360, false)).toBe(60)
    expect(reminderAfterAllDayChange(null, false)).toBeNull()
  })
})
