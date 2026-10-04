import { describe, expect, it } from 'vitest'
import { compareEvents, eventCovers, eventTimeLabel, formatTime, monthGrid, nextDue, recurrenceLabel, taskBucket } from './home'

describe('recurrenceLabel', () => {
  it('beskriver gentagelser på dansk', () => {
    expect(recurrenceLabel('none')).toBe('Gentages ikke')
    expect(recurrenceLabel('daily')).toBe('Hver dag')
    expect(recurrenceLabel('weekly', 2)).toBe('Hver 2. uge')
    expect(recurrenceLabel('monthly', 1)).toBe('Hver måned')
    expect(recurrenceLabel('monthly', 3)).toBe('Hver 3. måned')
  })
})

describe('nextDue', () => {
  it('spejler databasens beregning', () => {
    expect(nextDue('2026-10-04', 'daily', 2)).toBe('2026-10-06')
    expect(nextDue('2026-10-28', 'weekly', 1)).toBe('2026-11-04')
    expect(nextDue('2026-01-31', 'monthly', 1)).toBe('2026-02-28')
    expect(nextDue('2026-12-15', 'monthly', 2)).toBe('2027-02-15')
    expect(nextDue('2026-10-04', 'none')).toBeNull()
  })
})

describe('tid og aftaler', () => {
  const base = { event_date: '2026-10-10', end_date: null, all_day: false, start_time: '09:30:00', end_time: '10:00:00' }
  it('formaterer tider med punktum', () => {
    expect(formatTime('09:30:00')).toBe('09.30')
    expect(formatTime(null)).toBe('')
    expect(eventTimeLabel(base)).toBe('09.30–10.00')
    expect(eventTimeLabel({ ...base, end_time: null })).toBe('09.30')
    expect(eventTimeLabel({ ...base, all_day: true, start_time: null, end_time: null })).toBe('Hele dagen')
  })
  it('flerdagsaftaler dækker hele perioden', () => {
    const ferie = { ...base, all_day: true, start_time: null, end_time: null, end_date: '2026-10-16' }
    expect(eventCovers(ferie, '2026-10-09')).toBe(false)
    expect(eventCovers(ferie, '2026-10-13')).toBe(true)
    expect(eventCovers(ferie, '2026-10-16')).toBe(true)
    expect(eventCovers(ferie, '2026-10-17')).toBe(false)
  })
  it('sorterer heldagsaftaler først', () => {
    const allDay = { ...base, all_day: true, start_time: null, end_time: null }
    expect([base, allDay].sort(compareEvents)[0]).toBe(allDay)
  })
})

describe('monthGrid', () => {
  it('starter mandag og dækker hele uger', () => {
    const g = monthGrid('2026-10-01') // 1. oktober 2026 er en torsdag
    expect(g[0]).toBe('2026-09-28')
    expect(g).toHaveLength(35)
    expect(g.at(-1)).toBe('2026-11-01')
  })
  it('februar der starter mandag fylder 4 uger', () => {
    expect(monthGrid('2027-02-01')).toHaveLength(28)
  })
})

describe('taskBucket', () => {
  it('grupperer efter forfaldsdato', () => {
    const t = '2026-10-04'
    expect(taskBucket(null, t)).toBe('none')
    expect(taskBucket('2026-10-03', t)).toBe('overdue')
    expect(taskBucket(t, t)).toBe('today')
    expect(taskBucket('2026-10-11', t)).toBe('week')
    expect(taskBucket('2026-10-12', t)).toBe('later')
  })
})
