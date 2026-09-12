import { RouterProvider } from 'react-router-dom';
import { router } from './routes/router.tsx';
import { AuthProvider } from './auth/AuthContext.tsx';

function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

export default App;
