import { ConfigProvider } from 'antd';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { getAuthSession } from './api/client';
import ChatWindowPage from './pages/ChatWindowPage';
import LoginPage from './pages/LoginPage';
import SessionListPage from './pages/SessionListPage';

function RequireAuth({ children }: { children: JSX.Element }) {
  return getAuthSession() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <ConfigProvider
      button={{ autoInsertSpace: false }}
      theme={{
        token: {
          colorPrimary: '#0f766e',
          borderRadius: 8,
          colorText: '#20201d',
          colorTextSecondary: '#6d726e',
          colorBorder: '#ded7cc',
          fontFamily:
            '"Avenir Next", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif',
        },
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/chat" element={<RequireAuth><SessionListPage /></RequireAuth>} />
          <Route path="/chat/:sessionId" element={<RequireAuth><ChatWindowPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}
