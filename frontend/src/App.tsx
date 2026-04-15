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
import ChildProgressPage from "./pages/ChildProgressPage";
import PreviewLessonPage from "./pages/PreviewLessonPage";
import SubjectLessonPage from "./pages/SubjectLessonPage";
import HeroWalkPage from "./pages/HeroWalkPage";
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
            <Route path="/packages/:id/preview" element={<PreviewLessonPage />} />
            <Route path="/children" element={<ChildrenPage />} />
            <Route path="/children/:childId/progress" element={<ChildProgressPage />} />
          </>
        ) : (
          <>
            <Route path="/" element={<ChildHome />} />
            <Route path="/lesson/subject/:subject" element={<SubjectLessonPage />} />
            <Route path="/lesson/:packageId" element={<LessonPage />} />
            <Route path="/games/hero-walk" element={<HeroWalkPage />} />
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
