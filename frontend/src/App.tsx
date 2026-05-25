import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FactoriesPage from './pages/FactoriesPage';
import ProjectsPage from './pages/ProjectsPage';
import GanttPage from './pages/GanttPage';
import DashboardPage from './pages/DashboardPage';

const queryClient = new QueryClient();

function Nav() {
  const base = 'px-4 py-2 rounded-md text-sm font-medium transition-colors';
  const active = 'bg-blue-600 text-white';
  const inactive = 'text-gray-600 hover:bg-gray-100';
  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4">
      <img src="/logo.png" alt="FLAS" className="h-16 mr-4 object-contain" />
      <NavLink to="/dashboard" className={({ isActive }) => `${base} ${isActive ? active : inactive}`}>
        경영 대시보드
      </NavLink>
      <NavLink to="/gantt" className={({ isActive }) => `${base} ${isActive ? active : inactive}`}>
        면적 부하 현황
      </NavLink>
      <NavLink to="/projects" className={({ isActive }) => `${base} ${isActive ? active : inactive}`}>
        프로젝트 관리
      </NavLink>
      <NavLink to="/factories" className={({ isActive }) => `${base} ${isActive ? active : inactive}`}>
        공장·구역 관리
      </NavLink>
    </nav>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-50">
          <Nav />
          <main className="max-w-full px-6 py-6">
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/gantt" element={<GanttPage />} />
              <Route path="/factories" element={<FactoriesPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
