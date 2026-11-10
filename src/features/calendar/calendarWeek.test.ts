import { describe, expect, it } from 'vitest'
import { weekDays } from './calendarWeek'

describe('weekDays', () => {
  it('starts Monday and ends Sunday', () => {
    expect(weekDays('2026-11-09')).toEqual(['2026-11-09','2026-11-10','2026-11-11','2026-11-12','2026-11-13','2026-11-14','2026-11-15'])
  })
  it('works across year boundaries', () => {
    expect(weekDays('2027-01-01')).toEqual(['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03'])
  })
})
