import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './useAuth.ts';
import { LoadingScreen } from '../components/LoadingScreen.tsx';

/** Guards authenticated-app routes: an unauthenticated visitor is sent to the landing page. */
export function RequireAuth() {
  const { status } = useAuth();

  if (status === 'loading') {
    return <LoadingScreen />;
  }
  if (status === 'unauthenticated') {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
