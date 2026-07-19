import React from 'react';
import ReactDOM from 'react-dom/client';
import { Dashboard } from './Dashboard';
import { PublicReservation } from './PublicReservation';
import { Login } from './Login';
import { Register } from './Register';
import { CustomerDashboard } from './CustomerDashboard';
import { getStoredUser } from './auth';
import './index.css';

function AppRouter() {
  const path = window.location.pathname;
  const user = getStoredUser();

  // Public reservation route
  if (path === '/reservation') {
    return <PublicReservation />;
  }

  // Auth pages
  if (path === '/login') {
    return <Login />;
  }
  if (path === '/register') {
    return <Register />;
  }

  // If not logged in, redirect to login page
  if (!user) {
    if (path !== '/login') {
      window.history.replaceState({}, '', '/login');
    }
    return <Login />;
  }

  // Redirect based on role
  if (user.role === 'manager') {
    if (path !== '/') {
      window.history.replaceState({}, '', '/');
    }
    return <Dashboard />;
  }

  if (user.role === 'customer') {
    if (path !== '/customer') {
      window.history.replaceState({}, '', '/customer');
    }
    return <CustomerDashboard />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 text-slate-800">
      <div className="text-center">
        <h1 className="text-2xl font-bold">404 - Not Found</h1>
        <p className="mt-2 text-slate-600">The page you are looking for does not exist.</p>
        <a href="/" className="mt-4 inline-block text-amber-700 hover:underline">Go Home</a>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>
);

