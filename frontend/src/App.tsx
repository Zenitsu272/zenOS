import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import TeamPage from "./pages/TeamPage";
import JoinSpacePage from "./pages/JoinSpacePage";
import { getToken } from "./lib/storage";
import { useUiStore } from "./store/uiStore";

function ProtectedRoute({ personal = false }: { personal?: boolean }) {
  const token = getToken();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return personal ? <DashboardPage /> : <TeamPage />;
}

export default function App() {
  const theme = useUiStore((state) => state.theme);
  const queryClient = useQueryClient();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    // A login or logout in another tab must not leave the previous person's
    // workspace visible. Reloading also preserves an open invitation URL.
    const onSessionChange = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (event.key === "zenos_token" || event.key === null)) {
        queryClient.clear();
        window.location.reload();
      }
    };
    window.addEventListener("storage", onSessionChange);
    return () => window.removeEventListener("storage", onSessionChange);
  }, [queryClient]);

  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/join/:code" element={<JoinSpacePage />} />
      <Route path="/" element={<ProtectedRoute />} />
      <Route path="/personal" element={<ProtectedRoute personal />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
