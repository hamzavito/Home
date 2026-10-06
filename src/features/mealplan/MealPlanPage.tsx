import { Plus } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { RecipeList } from './RecipeList'
import { WeekView } from './WeekView'

type Tab = 'uge' | 'opskrifter' | 'favoritter'

/** Madplan: ugeplan, opskrifter og favoritter. Fanen huskes i adressen (?vis=). */
export function MealPlanPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const v = params.get('vis')
  const tab: Tab = v === 'opskrifter' || v === 'favoritter' ? v : 'uge'

  return (
    <>
      <PageHeader
        title="Madplan"
        back="/hjemmet"
        action={
          tab !== 'uge' && (
            <Button size="sm" onClick={() => navigate('/hjemmet/madplan/opskrift/ny')}>
              <Plus className="size-4" strokeWidth={2.6} /> Opskrift
            </Button>
          )
        }
      />
      <div className="mb-4">
        <SegmentedControl<Tab>
          label="Madplan"
          value={tab}
          onChange={(t) =>
            setParams(
              (p) => {
                const n = new URLSearchParams(p)
                if (t === 'uge') n.delete('vis')
                else n.set('vis', t)
                return n
              },
              { replace: true },
            )
          }
          options={[
            { value: 'uge', label: 'Ugeplan' },
            { value: 'opskrifter', label: 'Opskrifter' },
            { value: 'favoritter', label: 'Favoritter' },
          ]}
        />
      </div>
      {tab === 'uge' ? <WeekView /> : <RecipeList key={tab} favoritesOnly={tab === 'favoritter'} />}
    </>
  )
}
