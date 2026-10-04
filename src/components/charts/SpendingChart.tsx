import { useId } from 'react'

type Props = {
  /** Kumuleret forbrug pr. dag (index 0 = dag 1) */
  series: number[]
  days: number
  budgetOre: number
  tone?: 'hero' | 'default'
  height?: number
}

/**
 * Forbrug gennem måneden: en kurve for faktisk forbrug og en stiplet linje
 * for "jævnt tempo" mod budgettet. Let at aflæse på 2 sekunder:
 * er kurven under den stiplede linje, er vi på sporet.
 */
export function SpendingChart({ series, days, budgetOre, tone = 'default', height = 96 }: Props) {
  const gid = useId()
  const W = 300
  const H = height
  const pad = 4
  const last = series.at(-1) ?? 0
  const max = Math.max(budgetOre, last, 1) * 1.05
  const x = (i: number) => pad + (i / Math.max(days - 1, 1)) * (W - pad * 2)
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2)

  const line = series.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = series.length > 0 ? `${line} L${x(series.length - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z` : ''
  const over = budgetOre > 0 && last > budgetOre

  const stroke = tone === 'hero' ? (over ? '#ff8a8a' : '#ffffff') : over ? 'var(--danger)' : 'var(--accent)'
  const guide = tone === 'hero' ? 'rgb(255 255 255 / 0.35)' : 'var(--text-tertiary)'
  const label = tone === 'hero' ? 'rgb(255 255 255 / 0.5)' : 'var(--text-tertiary)'

  return (
    <figure className="relative m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full overflow-visible" style={{ height }} preserveAspectRatio="none" role="img" aria-label="Forbrug gennem måneden sammenlignet med jævnt tempo">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={stroke} stopOpacity={tone === 'hero' ? 0.28 : 0.2} />
            <stop offset="1" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        {budgetOre > 0 && (
          <line x1={x(0)} y1={y(0)} x2={x(days - 1)} y2={y(budgetOre)} stroke={guide} strokeWidth={1.25} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        )}
        {series.length > 0 && (
          <>
            <path d={area} fill={`url(#${gid})`} className="[animation:fade-in_600ms_ease-out_both]" />
            <path
              d={line}
              fill="none"
              stroke={stroke}
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              pathLength={1000}
              strokeDasharray={1000}
              className="[animation:draw-line_900ms_var(--ease-spring)_both]"
            />
          </>
        )}
      </svg>
      {series.length > 0 && (
        <span
          aria-hidden
          className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 [animation:fade-in_300ms_700ms_both]"
          style={{ left: `${(x(series.length - 1) / W) * 100}%`, top: `${(y(last) / H) * height}px`, background: stroke, ['--tw-ring-color' as string]: tone === 'hero' ? 'rgb(255 255 255 / 0.18)' : 'var(--accent-soft)' }}
        />
      )}
      <figcaption className="mt-1.5 flex justify-between text-[11px] font-medium" style={{ color: label }}>
        <span>1.</span>
        <span>{Math.ceil(days / 2)}.</span>
        <span>{days}.</span>
      </figcaption>
    </figure>
  )
}
