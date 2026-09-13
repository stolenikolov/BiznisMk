import { createBrowserRouter } from 'react-router-dom';
import { PublicLayout } from '../layouts/PublicLayout.tsx';
import { DashboardLayout } from '../layouts/DashboardLayout.tsx';
import { PublicOnlyRoute } from '../auth/PublicOnlyRoute.tsx';
import { RequireAuth } from '../auth/RequireAuth.tsx';
import { LandingPage } from '../pages/LandingPage.tsx';
import { OverviewPage } from '../pages/OverviewPage.tsx';
import { AccountsPage } from '../pages/AccountsPage.tsx';
import { BankAccountDetailPage } from '../pages/BankAccountDetailPage.tsx';
import { CompanySettingsPage } from '../pages/CompanySettingsPage.tsx';
import { SectionStubPage } from '../pages/SectionStubPage.tsx';
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
        ],
      },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <DashboardLayout />,
        children: [
          { path: '/dashboard', element: <OverviewPage /> },
          { path: '/finance', element: <SectionStubPage section="finance" /> },
          { path: '/finance/accounts', element: <AccountsPage /> },
          { path: '/finance/accounts/:accountId', element: <BankAccountDetailPage /> },
          { path: '/finance/transactions', element: <SectionStubPage section="transactions" /> },
          { path: '/employees', element: <SectionStubPage section="employees" /> },
          { path: '/invoices', element: <SectionStubPage section="invoices" /> },
          { path: '/schedule', element: <SectionStubPage section="schedule" /> },
          { path: '/settings/company', element: <CompanySettingsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
