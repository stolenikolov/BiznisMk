import { createBrowserRouter } from 'react-router-dom';
import { PublicLayout } from '../layouts/PublicLayout.tsx';
import { AppLayout } from '../layouts/AppLayout.tsx';
import { PublicOnlyRoute } from '../auth/PublicOnlyRoute.tsx';
import { RequireAuth } from '../auth/RequireAuth.tsx';
import { LandingPage } from '../pages/LandingPage.tsx';
import { DashboardPage } from '../pages/DashboardPage.tsx';
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
        element: <AppLayout />,
        children: [{ path: '/dashboard', element: <DashboardPage /> }],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
