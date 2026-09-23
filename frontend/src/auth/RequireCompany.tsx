import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './useAuth.ts';

/**
 * Guards the app itself: everything in it belongs to one company, so a
 * session that has not entered one — a user with several, just signed in —
 * is sent to choose first. Sits inside RequireAuth, which has already settled
 * that there is a user.
 */
export function RequireCompany() {
  const { user } = useAuth();

  if (!user?.companyId) {
    return <Navigate to="/select-company" replace />;
  }
  return <Outlet />;
}
