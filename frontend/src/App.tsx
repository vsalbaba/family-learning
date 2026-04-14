import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import AppShell from "./components/layout/AppShell";
import LoginScreen from "./components/auth/LoginScreen";
import ParentHome from "./pages/ParentHome";
import ChildHome from "./pages/ChildHome";
import ImportPage from "./pages/ImportPage";
import PackageDetailPage from "./pages/PackageDetailPage";
import LessonPage from "./pages/LessonPage";
import ChildrenPage from "./pages/ChildrenPage";
import "./styles/global.css";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="app-loading">Načítání...</div>;
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        {user.role === "parent" ? (
          <>
            <Route path="/" element={<ParentHome />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/packages/:id" element={<PackageDetailPage />} />
            <Route path="/children" element={<ChildrenPage />} />
          </>
        ) : (
          <>
            <Route path="/" element={<ChildHome />} />
            <Route path="/lesson/:packageId" element={<LessonPage />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
