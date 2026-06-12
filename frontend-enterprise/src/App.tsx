import {
  ApiOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DislikeOutlined,
  EditOutlined,
  FileAddOutlined,
  FileSearchOutlined,
  MessageOutlined,
  PlusOutlined,
  ProfileOutlined,
  RobotOutlined,
  ToolOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Button, ConfigProvider, Input, Layout, Menu, Modal, Select, Typography, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, TENANT_ID } from './api/client';
import DashboardPage from './pages/DashboardPage';
import DistillPage from './pages/DistillPage';
import FeedbackPage from './pages/FeedbackPage';
import GeneralSkillsPage from './pages/GeneralSkillsPage';
import KnowledgeManagePage, { KnowledgeAddPage } from './pages/KnowledgePage';
import MemoriesPage from './pages/MemoriesPage';
import ModelsPage from './pages/ModelsPage';
import PersonaPage from './pages/PersonaPage';
import SkillsPage from './pages/SkillsPage';
import ToolsPage from './pages/ToolsPage';
import { ThemeToggleButton, useThemeController, type EffectiveTheme } from './theme';
import type { AgentProfileRead } from './types';

const { Header, Sider, Content } = Layout;
const ENTERPRISE_AGENT_STORAGE_KEY = 'ultrarag_enterprise_agent_scope';

function Shell({ effectiveTheme }: { effectiveTheme: EffectiveTheme }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [agents, setAgents] = useState<AgentProfileRead[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState(() => window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '');
  const [agentModalMode, setAgentModalMode] = useState<'create' | 'edit' | null>(null);
  const [agentForm, setAgentForm] = useState({ name: '', description: '' });
  const selected = location.pathname === '/enterprise'
    ? '/enterprise/dashboard'
    : location.pathname.startsWith('/enterprise/knowledge/new')
      ? '/enterprise/knowledge/new'
      : location.pathname;
  const isDistillRoute = location.pathname === '/enterprise/skills/distill';
  const [lastDistillSearch, setLastDistillSearch] = useState(() => (isDistillRoute ? location.search : ''));
  const distillSearch = isDistillRoute ? location.search : lastDistillSearch;
  const distillSearchParams = useMemo(() => new URLSearchParams(distillSearch), [distillSearch]);

  useEffect(() => {
    if (isDistillRoute) {
      setLastDistillSearch(location.search);
    }
  }, [isDistillRoute, location.search]);

  useEffect(() => {
    loadAgents();
  }, []);

  function loadAgents() {
    return api
      .get<AgentProfileRead[]>(`/api/enterprise/agents?tenant_id=${TENANT_ID}`)
      .then((rows) => {
        setAgents(rows);
        setSelectedAgentId((current) => {
          if (current && rows.some((item) => item.id === current)) return current;
          const next = rows.find((item) => item.is_overall)?.id || rows[0]?.id || '';
          if (next) window.localStorage.setItem(ENTERPRISE_AGENT_STORAGE_KEY, next);
          return next;
        });
      })
      .catch(() => setAgents([]));
  }

  function changeAgentScope(agentId: string) {
    setSelectedAgentId(agentId);
    window.localStorage.setItem(ENTERPRISE_AGENT_STORAGE_KEY, agentId);
    window.dispatchEvent(new CustomEvent('ultrarag-enterprise-agent-scope-change', { detail: { agentId } }));
  }

  const selectedAgent = agents.find((item) => item.id === selectedAgentId);

  function openAgentModal(mode: 'create' | 'edit') {
    const target = mode === 'edit' ? selectedAgent : undefined;
    setAgentForm({
      name: target?.name || '',
      description: target?.description || '',
    });
    setAgentModalMode(mode);
  }

  async function saveAgentModal() {
    const name = agentForm.name.trim();
    if (!name) return;
    if (agentModalMode === 'create') {
      const created = await api.post<AgentProfileRead>('/api/enterprise/agents', {
        tenant_id: TENANT_ID,
        name,
        description: agentForm.description,
      });
      await loadAgents();
      changeAgentScope(created.id);
    } else if (agentModalMode === 'edit' && selectedAgent) {
      await api.put<AgentProfileRead>(`/api/enterprise/agents/${selectedAgent.id}`, {
        tenant_id: TENANT_ID,
        name,
        description: agentForm.description,
      });
      await loadAgents();
    }
    setAgentModalMode(null);
  }

  return (
    <Layout className="app-shell">
      <Sider width={232} theme={effectiveTheme} className="sidebar">
        <div className="brand">
          <span className="brand-mark">UR</span>
          <div>
            <div className="brand-title">UltraRAG4</div>
            <div className="brand-subtitle">Skill Studio</div>
          </div>
        </div>
        <Menu
          className="nav-menu"
          mode="inline"
          selectedKeys={[selected]}
          onClick={(item) => navigate(item.key)}
          items={[
            {
              key: 'workspace',
              type: 'group',
              label: '工作区',
              children: [
                { key: '/enterprise/dashboard', icon: <DashboardOutlined />, label: '看板' },
                { key: '/enterprise/memories', icon: <DatabaseOutlined />, label: '记忆查询' },
                { key: '/enterprise/feedback', icon: <DislikeOutlined />, label: '负反馈会话' },
              ],
            },
            {
              key: 'knowledge',
              type: 'group',
              label: '知识',
              children: [
                { key: '/enterprise/knowledge', icon: <FileSearchOutlined />, label: '知识管理' },
                { key: '/enterprise/knowledge/new', icon: <FileAddOutlined />, label: '新增知识' },
              ],
            },
            {
              key: 'skills',
              type: 'group',
              label: '技能',
              children: [
                { key: '/enterprise/skills', icon: <ProfileOutlined />, label: '技能管理' },
                { key: '/enterprise/skills/distill', icon: <MessageOutlined />, label: '技能改写' },
                { key: '/enterprise/tools', icon: <ToolOutlined />, label: '工具配置' },
              ],
            },
            { key: '/enterprise/models', icon: <ApiOutlined />, label: '模型配置' },
          ]}
        />
        <div className="agent-dock">
          <div className="agent-dock-mark">
            <RobotOutlined />
          </div>
          <div className="agent-dock-main">
            <div className="agent-dock-label">智能体</div>
            <Select
              className="agent-dock-select"
              value={selectedAgentId || undefined}
              placeholder="选择智能体"
              popupMatchSelectWidth={260}
              options={agents.map((agent) => ({
                value: agent.id,
                label: agent.is_overall ? `整体 · ${agent.name}` : agent.name,
              }))}
              onChange={changeAgentScope}
            />
          </div>
          <Button className="agent-dock-icon" icon={<EditOutlined />} onClick={() => openAgentModal('edit')} />
          <Button className="agent-dock-icon" icon={<PlusOutlined />} onClick={() => openAgentModal('create')} />
        </div>
      </Sider>
      <Layout>
        <Header className="topbar">
          <div className="topbar-scope">
            <Typography.Text strong>{selectedAgent?.name || '智能体'}</Typography.Text>
            <div className="topbar-subtitle">
              {selectedAgent?.is_overall ? '整体资源池' : selectedAgent?.description || '分支工作域'}
            </div>
          </div>
          <div className="topbar-actions">
            <ThemeToggleButton />
            <Button icon={<UserOutlined />} onClick={() => navigate('/enterprise/persona')}>人设</Button>
          </div>
        </Header>
        <Content className="content">
          <div className={isDistillRoute ? 'persistent-distill active' : 'persistent-distill hidden'}>
            <DistillPage active={isDistillRoute} searchParamsOverride={distillSearchParams} />
          </div>
          {!isDistillRoute && (
            <Routes>
              <Route path="/enterprise" element={<Navigate to="/enterprise/dashboard" replace />} />
              <Route path="/enterprise/dashboard" element={<DashboardPage />} />
              <Route path="/enterprise/memories" element={<MemoriesPage />} />
              <Route path="/enterprise/knowledge" element={<KnowledgeManagePage />} />
              <Route path="/enterprise/knowledge/new" element={<KnowledgeAddPage />} />
              <Route path="/enterprise/feedback" element={<FeedbackPage />} />
              <Route path="/enterprise/skills" element={<SkillsPage />} />
              <Route path="/enterprise/general-skills" element={<GeneralSkillsPage />} />
              <Route path="/enterprise/models" element={<ModelsPage />} />
              <Route path="/enterprise/tools" element={<ToolsPage />} />
              <Route path="/enterprise/persona" element={<PersonaPage />} />
              <Route path="*" element={<Navigate to="/enterprise/dashboard" replace />} />
            </Routes>
          )}
        </Content>
      </Layout>
      <Modal
        title={agentModalMode === 'create' ? '新增智能体' : '编辑智能体'}
        open={agentModalMode !== null}
        onCancel={() => setAgentModalMode(null)}
        onOk={saveAgentModal}
        okText="保存"
        cancelText="取消"
      >
        <div className="agent-editor-form">
          <label>
            名称
            <Input value={agentForm.name} onChange={(event) => setAgentForm((prev) => ({ ...prev, name: event.target.value }))} />
          </label>
          <label>
            描述
            <Input.TextArea
              rows={3}
              value={agentForm.description}
              onChange={(event) => setAgentForm((prev) => ({ ...prev, description: event.target.value }))}
            />
          </label>
        </div>
      </Modal>
    </Layout>
  );
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
          colorPrimary: isDark ? '#e4b976' : '#04756f',
          borderRadius: 8,
          colorBgBase: isDark ? '#0f172a' : '#fbfaf6',
          colorBgContainer: isDark ? '#111827' : '#ffffff',
          colorBgElevated: isDark ? '#1e293b' : '#ffffff',
          colorFillSecondary: isDark ? 'rgba(148, 163, 184, 0.16)' : '#f5f1eb',
          colorText: isDark ? '#f8fafc' : '#1d1d1b',
          colorTextSecondary: isDark ? '#94a3b8' : '#737373',
          colorBorder: isDark ? 'rgba(148, 163, 184, 0.24)' : '#e7e1d8',
          fontFamily:
            '"Avenir Next", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif',
        },
      }}
    >
      <BrowserRouter>
        <Shell effectiveTheme={effectiveTheme} />
      </BrowserRouter>
    </ConfigProvider>
  );
}
