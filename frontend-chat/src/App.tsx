import { ConfigProvider, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { getAuthSession } from './api/client';
import ChatWindowPage from './pages/ChatWindowPage';
import EmployeeGalleryPage from './pages/EmployeeGalleryPage';
import LoginPage from './pages/LoginPage';
import { useThemeController } from './theme';

function RequireAuth({ children }: { children: JSX.Element }) {
  const location = useLocation();
  const from = `${location.pathname}${location.search}`;
  return getAuthSession() ? children : <Navigate to="/login" replace state={{ from }} />;
}

export default function App() {
  const { effectiveTheme } = useThemeController();
  const isDark = effectiveTheme === 'dark';

  return (
    <ConfigProvider
      locale={zhCN}
      button={{ autoInsertSpace: false }}
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: isDark ? '#f4f4f5' : '#111111',
          borderRadius: 6,
          colorBgBase: isDark ? '#111111' : '#f7f8fa',
          colorBgContainer: isDark ? '#111827' : '#ffffff',
          colorBgElevated: isDark ? '#1e293b' : '#ffffff',
          colorFillSecondary: isDark ? 'rgba(255, 255, 255, 0.1)' : '#f3f4f6',
          colorText: isDark ? '#f8fafc' : '#111111',
          colorTextSecondary: isDark ? '#a1a1aa' : '#6b7280',
          colorBorder: isDark ? 'rgba(255, 255, 255, 0.14)' : '#e5e7eb',
          fontFamily:
            '"Inter", "Avenir Next", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif',
        },
      }}
    >
      <BrowserRouter basename="/chat">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RequireAuth><EmployeeGalleryPage /></RequireAuth>} />
          <Route path="/employees" element={<RequireAuth><EmployeeGalleryPage /></RequireAuth>} />
          <Route path="/gallery" element={<RequireAuth><EmployeeGalleryPage /></RequireAuth>} />
          <Route path="/draft/:draftAgentId" element={<RequireAuth><ChatWindowPage /></RequireAuth>} />
          <Route path="/:sessionId" element={<RequireAuth><ChatWindowPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}
