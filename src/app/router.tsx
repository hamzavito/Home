import { createBrowserRouter } from 'react-router'
import { NotFound } from '@/features/NotFound'
import { LoginPage } from '@/features/auth/LoginPage'
import { RequireHousehold } from '@/features/auth/RequireHousehold'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { BudgetsPage } from '@/features/budgets/BudgetsPage'
import { CategoryDetailPage } from '@/features/budgets/CategoryDetailPage'
import { CategoryNewPage } from '@/features/budgets/CategoryNewPage'
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage'
import { FinanceLayout } from '@/features/finance/FinanceLayout'
import { OverviewPage } from '@/features/finance/OverviewPage'
import { TransactionsPage } from '@/features/finance/TransactionsPage'
import { FixedItemPage } from '@/features/fixed/FixedItemPage'
import { FixedNewPage } from '@/features/fixed/FixedNewPage'
import { FixedPage } from '@/features/fixed/FixedPage'
import { TransactionFormPage } from '@/features/finance/TransactionFormPage'
import { ReceiptDetailPage } from '@/features/receipts/ReceiptDetailPage'
import { GoalNewPage } from '@/features/savings/GoalNewPage'
import { GoalPage } from '@/features/savings/GoalPage'
import { SavingsPage } from '@/features/savings/SavingsPage'
import { UpcomingFormPage } from '@/features/upcoming/UpcomingFormPage'
import { UpcomingPage } from '@/features/upcoming/UpcomingPage'
import { ReceiptsPage } from '@/features/receipts/ReceiptsPage'
import { ScanPage } from '@/features/receipts/ScanPage'
import { HomeHubPage } from '@/features/home/HomeHubPage'
import { TaskFormPage } from '@/features/home/TaskFormPage'
import { ShoppingPage } from '@/features/shopping/ShoppingPage'
import { CalendarPage } from '@/features/calendar/CalendarPage'
import { EventFormPage } from '@/features/calendar/EventFormPage'
import { MealPlanPage } from '@/features/mealplan/MealPlanPage'
import { RecipeFormPage } from '@/features/mealplan/RecipeFormPage'
import { RecipePage } from '@/features/mealplan/RecipePage'
import { MorePage } from '@/features/more/MorePage'
import { MemberPage } from '@/features/settings/MemberPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { AppLayout } from './AppLayout'
import { FocusLayout } from './FocusLayout'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/glemt-adgangskode', element: <ForgotPasswordPage /> },
  {
    element: <RequireHousehold />,
    children: [
      {
        element: <FocusLayout />,
        children: [{ path: '/kvitteringer/scan', element: <ScanPage /> }],
      },
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          {
            path: '/okonomi',
            element: <FinanceLayout />,
            children: [
              { index: true, element: <OverviewPage /> },
              { path: 'budgetter', element: <BudgetsPage /> },
              { path: 'faste', element: <FixedPage /> },
              { path: 'transaktioner', element: <TransactionsPage /> },
            ],
          },
          { path: '/okonomi/faste/ny', element: <FixedNewPage /> },
          { path: '/okonomi/faste/:id', element: <FixedItemPage /> },
          { path: '/okonomi/ny', element: <TransactionFormPage /> },
          { path: '/okonomi/udgift/:id', element: <TransactionFormPage /> },
          { path: '/okonomi/budgetter/ny', element: <CategoryNewPage /> },
          { path: '/okonomi/budgetter/:id', element: <CategoryDetailPage /> },
          { path: '/hjemmet', element: <HomeHubPage /> },
          { path: '/hjemmet/ny', element: <TaskFormPage /> },
          { path: '/hjemmet/opgave/:id', element: <TaskFormPage /> },
          { path: '/hjemmet/kalender', element: <CalendarPage /> },
          { path: '/hjemmet/kalender/ny', element: <EventFormPage /> },
          { path: '/hjemmet/kalender/:id', element: <EventFormPage /> },
          { path: '/hjemmet/madplan', element: <MealPlanPage /> },
          { path: '/hjemmet/madplan/opskrift/ny', element: <RecipeFormPage /> },
          { path: '/hjemmet/madplan/opskrift/:id', element: <RecipePage /> },
          { path: '/hjemmet/madplan/opskrift/:id/rediger', element: <RecipeFormPage /> },
          { path: '/indkob', element: <ShoppingPage /> },
          { path: '/mere', element: <MorePage /> },
          { path: '/indstillinger', element: <SettingsPage /> },
          { path: '/indstillinger/medlem/:id', element: <MemberPage /> },
          { path: '/okonomi/kommende', element: <UpcomingPage /> },
          { path: '/okonomi/kommende/ny', element: <UpcomingFormPage /> },
          { path: '/okonomi/kommende/:id', element: <UpcomingFormPage /> },
          { path: '/kvitteringer', element: <ReceiptsPage /> },
          { path: '/kvitteringer/:id', element: <ReceiptDetailPage /> },
          { path: '/opsparing', element: <SavingsPage /> },
          { path: '/opsparing/ny', element: <GoalNewPage /> },
          { path: '/opsparing/:id', element: <GoalPage /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
])
