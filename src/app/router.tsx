import { Navigate, createBrowserRouter } from 'react-router-dom'
import { OnboardingPage } from '../features/auth/pages/OnboardingPage'
import { SignInPage } from '../features/auth/pages/SignInPage'
import { SignUpPage } from '../features/auth/pages/SignUpPage'
import { StaffLoginPage } from '../features/auth/pages/StaffLoginPage'
import { MenuManagementPage } from '../features/menu/pages/MenuManagementPage'
import { OpenOrdersPage } from '../features/ordering/pages/OpenOrdersPage'
import { RecentOrdersPage } from '../features/ordering/pages/RecentOrdersPage'
import { PaymentPage } from '../features/payment/pages/PaymentPage'
import { DailySalesReportPage } from '../features/reports/pages/DailySalesReportPage'
import { OwnerDashboardPage } from '../features/reports/pages/OwnerDashboardPage'
import { OutletSettingsPage } from '../features/settings/pages/OutletSettingsPage'
import { StaffManagementPage } from '../features/staff/pages/StaffManagementPage'
import { TablesManagementPage } from '../features/tables/pages/TablesManagementPage'
import { BackofficeHome } from './backoffice/BackofficeHome'
import { PosHome } from './pos/PosHome'

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/signup', element: <SignUpPage /> },
  { path: '/signin', element: <SignInPage /> },
  { path: '/onboarding', element: <OnboardingPage /> },
  { path: '/login', element: <StaffLoginPage /> },
  { path: '/pos', element: <PosHome /> },
  { path: '/pos/open-orders', element: <OpenOrdersPage /> },
  { path: '/pos/orders', element: <RecentOrdersPage /> },
  { path: '/pos/pay/:orderId', element: <PaymentPage /> },
  { path: '/reports/daily-sales', element: <DailySalesReportPage /> },
  { path: '/backoffice', element: <BackofficeHome /> },
  { path: '/backoffice/menu', element: <MenuManagementPage /> },
  { path: '/backoffice/tables', element: <TablesManagementPage /> },
  { path: '/backoffice/settings', element: <OutletSettingsPage /> },
  { path: '/backoffice/staff', element: <StaffManagementPage /> },
  { path: '/backoffice/dashboard', element: <OwnerDashboardPage /> },
])
