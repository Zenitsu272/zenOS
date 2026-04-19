import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import { getToken } from "./lib/storage";
import { useUiStore } from "./store/uiStore";

function ProtectedRoute() {
  const token = getToken();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <DashboardPage />;
}

export default function App() {
  const theme = useUiStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/" element={<ProtectedRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
