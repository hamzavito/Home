import { createBrowserRouter } from 'react-router'
import { ComingSoon, NotFound } from '@/features/ComingSoon'
import { LoginPage } from '@/features/auth/LoginPage'
import { RequireHousehold } from '@/features/auth/RequireHousehold'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { FinancePage } from '@/features/finance/FinancePage'
import { HomeHubPage } from '@/features/home/HomeHubPage'
import { MorePage } from '@/features/more/MorePage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { AppLayout } from './AppLayout'
import { sections } from './sections'

const soon = (s: (typeof sections)[keyof typeof sections]) => ({ path: s.path, element: <ComingSoon section={s} /> })

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireHousehold />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: '/okonomi', element: <FinancePage /> },
          { path: '/hjemmet', element: <HomeHubPage /> },
          { path: '/mere', element: <MorePage /> },
          { path: '/indstillinger', element: <SettingsPage /> },
          soon(sections.budgets),
          soon(sections.upcoming),
          soon(sections.receipts),
          soon(sections.savings),
          soon(sections.shopping),
          soon(sections.calendar),
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
])
