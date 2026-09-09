import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ref } from 'firebase/database';
import { useListVals } from 'react-firebase-hooks/database';

import { db } from './firebaseConfig';
import { CallData } from './types/calls';
import { AuthProvider } from './context/AuthProvider';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Dashboard } from './components/Dashboard';

import './index.css';

const ProtectedDashboardRoute: React.FC = () => {
  const [values, loading, error] = useListVals<CallData>(ref(db, 'calls'));

  const calls: CallData[] | undefined = values
    ?.map((call) => ({ ...call, key: call.callSid }))
    .filter(({ key }) => Boolean(key));

  return <Dashboard calls={calls} loading={loading} error={error} />;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Landing Screen */}
          <Route path="/" element={<Landing />} />

          {/* Public Operator Authentication */}
          <Route path="/login" element={<Login />} />

          {/* Protected Dispatcher Dashboard */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <ProtectedDashboardRoute />
              </ProtectedRoute>
            }
          />

          {/* Catch-all route -> redirect to Landing */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
