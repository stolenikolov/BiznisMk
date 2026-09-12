import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './useAuth.ts';
import { LoadingScreen } from '../components/LoadingScreen.tsx';

/** Guards "/", "/login" and "/register": an already-authenticated visitor never sees them. */
export function PublicOnlyRoute() {
  const { status } = useAuth();

  if (status === 'loading') {
    return <LoadingScreen />;
  }
  if (status === 'authenticated') {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}
