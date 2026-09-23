import { createBrowserRouter, Navigate } from 'react-router-dom';
import { PublicLayout } from '../layouts/PublicLayout.tsx';
import { DashboardLayout } from '../layouts/DashboardLayout.tsx';
import { PublicOnlyRoute } from '../auth/PublicOnlyRoute.tsx';
import { RequireAuth } from '../auth/RequireAuth.tsx';
import { RequireCompany } from '../auth/RequireCompany.tsx';
import { LandingPage } from '../pages/LandingPage.tsx';
import { SelectCompanyPage } from '../pages/SelectCompanyPage.tsx';
import { OverviewPage } from '../pages/OverviewPage.tsx';
import { FinancePage } from '../pages/FinancePage.tsx';
import { AccountsPage } from '../pages/AccountsPage.tsx';
import { BankAccountDetailPage } from '../pages/BankAccountDetailPage.tsx';
import { TransactionsPage } from '../pages/TransactionsPage.tsx';
import { InvoicesPage } from '../pages/InvoicesPage.tsx';
import { EmployeesPage } from '../pages/EmployeesPage.tsx';
import { InvoiceDetailPage } from '../pages/InvoiceDetailPage.tsx';
import { SettingsIndex, SettingsLayout } from '../layouts/SettingsLayout.tsx';
import { CompanySettingsPage } from '../pages/settings/CompanySettingsPage.tsx';
import { PayrollSettingsPage } from '../pages/settings/PayrollSettingsPage.tsx';
import { EmailSettingsPage } from '../pages/settings/EmailSettingsPage.tsx';
import { ProfileSettingsPage } from '../pages/settings/ProfileSettingsPage.tsx';
import { BusinessesSettingsPage } from '../pages/settings/BusinessesSettingsPage.tsx';
import { LanguageSettingsPage } from '../pages/settings/LanguageSettingsPage.tsx';
import { CloseAccountPage } from '../pages/settings/CloseAccountPage.tsx';
import { SchedulePage } from '../pages/SchedulePage.tsx';
import { NotificationsPage } from '../pages/NotificationsPage.tsx';
import { NotFoundPage } from '../pages/NotFoundPage.tsx';

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      {
        element: <PublicOnlyRoute />,
        children: [
          // /login and /register render the same landing page underneath —
          // PublicLayout reads the path and overlays the matching modal on top.
          { path: '/', element: <LandingPage /> },
          { path: '/login', element: <LandingPage /> },
          { path: '/register', element: <LandingPage /> },
          { path: '/forgot-password', element: <LandingPage /> },
        ],
      },
      // Outside PublicOnlyRoute: the emailed link has to work even in a
      // browser that is still signed in.
      { path: '/reset-password', element: <LandingPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      // Signed in but not yet in a company: a login with several picks one here.
      { path: '/select-company', element: <SelectCompanyPage /> },
      {
        element: <RequireCompany />,
        children: [
          {
            element: <DashboardLayout />,
            children: [
              { path: '/dashboard', element: <OverviewPage /> },
              { path: '/finance', element: <FinancePage /> },
              { path: '/finance/accounts', element: <AccountsPage /> },
              { path: '/finance/accounts/:accountId', element: <BankAccountDetailPage /> },
              { path: '/finance/transactions', element: <TransactionsPage /> },
              // The same page, with the add or edit form open over the list.
              { path: '/employees', element: <EmployeesPage /> },
              { path: '/employees/new', element: <EmployeesPage /> },
              { path: '/employees/:employeeId', element: <EmployeesPage /> },
              { path: '/invoices', element: <InvoicesPage /> },
              { path: '/invoices/:invoiceId', element: <InvoiceDetailPage /> },
              { path: '/schedule', element: <SchedulePage /> },
              { path: '/notifications', element: <NotificationsPage /> },
              {
                path: '/settings',
                element: <SettingsLayout />,
                children: [
                  { index: true, element: <SettingsIndex /> },
                  { path: 'company', element: <CompanySettingsPage /> },
                  { path: 'payroll', element: <PayrollSettingsPage /> },
                  { path: 'email', element: <EmailSettingsPage /> },
                  { path: 'profile', element: <ProfileSettingsPage /> },
                  // Security now sits under the profile; an old link still lands there.
                  { path: 'security', element: <Navigate to="/settings/profile" replace /> },
                  { path: 'businesses', element: <BusinessesSettingsPage /> },
                  { path: 'language', element: <LanguageSettingsPage /> },
                  { path: 'account', element: <CloseAccountPage /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
