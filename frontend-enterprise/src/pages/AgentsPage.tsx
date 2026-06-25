import {
  CommentOutlined,
  DeleteOutlined,
  EditOutlined,
  GlobalOutlined,
  MoreOutlined,
  PauseCircleOutlined,
  PictureOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { Button, Card, Dropdown, Modal, Space, Tag, Typography, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, TENANT_ID } from '../api/client';
import { isEmployeeOwnedBy, isGalleryEmployee, type EnterpriseAuthUser } from '../auth';
import EmployeeAvatar from '../components/EmployeeAvatar';
import EmployeeAvatarEditor from '../components/EmployeeAvatarEditor';
import EmployeeProfileEditor from '../components/EmployeeProfileEditor';
import { employeeDisplayName, employeeProfile, resourceCount } from '../employee';
import type { AgentProfileRead } from '../types';

const ENTERPRISE_AGENT_STORAGE_KEY = 'ultrarag_enterprise_agent_scope';

export default function AgentsPage({
  currentUser,
  isAdmin = false,
}: {
  currentUser?: EnterpriseAuthUser;
  isAdmin?: boolean;
}) {
  const [agents, setAgents] = useState<AgentProfileRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState(() => window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '');
  const [avatarAgent, setAvatarAgent] = useState<AgentProfileRead | null>(null);
  const [profileAgent, setProfileAgent] = useState<AgentProfileRead | null>(null);
  const navigate = useNavigate();

  async function load() {
    setLoading(true);
    try {
      const rows = await api.get<AgentProfileRead[]>(`/api/enterprise/agents?tenant_id=${TENANT_ID}`);
      setAgents(rows);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载员工失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    function handleScopeChange(event: Event) {
      const customEvent = event as CustomEvent<{ agentId?: string }>;
      setSelectedAgentId(customEvent.detail?.agentId || window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '');
    }

    function handleScopeRefresh() {
      setSelectedAgentId(window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '');
    }

    window.addEventListener('ultrarag-enterprise-agent-scope-change', handleScopeChange);
    window.addEventListener('ultrarag-enterprise-agent-scope-refresh', handleScopeRefresh);
    window.addEventListener('storage', handleScopeRefresh);
    return () => {
      window.removeEventListener('ultrarag-enterprise-agent-scope-change', handleScopeChange);
      window.removeEventListener('ultrarag-enterprise-agent-scope-refresh', handleScopeRefresh);
      window.removeEventListener('storage', handleScopeRefresh);
    };
  }, []);

  const overallAgent = agents.find((item) => item.is_overall);
  const currentScopeAgent = agents.find((item) => item.id === selectedAgentId) || (isAdmin ? overallAgent : undefined);
  const isOverallScope = Boolean(currentScopeAgent?.is_overall);
  const employees = useMemo(
    () => agents.filter((item) => (
      !item.is_overall && (isAdmin || isEmployeeOwnedBy(item, currentUser) || isGalleryEmployee(item))
    )),
    [agents, currentUser, isAdmin],
  );

  function selectEmployee(row: AgentProfileRead) {
    window.localStorage.setItem(ENTERPRISE_AGENT_STORAGE_KEY, row.id);
    window.dispatchEvent(new CustomEvent('ultrarag-enterprise-agent-scope-change', { detail: { agentId: row.id } }));
    navigate('/enterprise/dashboard');
  }

  function startEmployeeChat(row: AgentProfileRead) {
    const url = new URL('/chat/', window.location.origin);
    url.searchParams.set('agent_id', row.id);
    url.searchParams.set('create', '1');
    window.location.href = `${url.pathname}${url.search}`;
  }

  async function updateStatus(row: AgentProfileRead, status: 'active' | 'archived') {
    try {
      await api.put<AgentProfileRead>(`/api/enterprise/agents/${row.id}`, {
        tenant_id: TENANT_ID,
        status,
        metadata: row.metadata || {},
      });
      message.success(status === 'active' ? '员工已上线' : '员工已下线');
      await load();
      window.dispatchEvent(new Event('ultrarag-enterprise-agent-scope-refresh'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新员工状态失败');
    }
  }

  async function updateGalleryState(row: AgentProfileRead, published: boolean) {
    try {
      const metadata = {
        ...(row.metadata || {}),
        published_to_gallery: published,
        gallery_published_at: published ? new Date().toISOString() : undefined,
        gallery_published_by: published ? currentUser?.username : undefined,
      };
      await api.put<AgentProfileRead>(`/api/enterprise/agents/${row.id}`, {
        tenant_id: TENANT_ID,
        metadata,
      });
      message.success(published ? '已发布到广场' : '已从广场下架');
      await load();
      window.dispatchEvent(new Event('ultrarag-enterprise-agent-scope-refresh'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新广场状态失败');
    }
  }

  function deleteEmployee(row: AgentProfileRead) {
    Modal.confirm({
      title: `删除员工「${employeeDisplayName(row)}」？`,
      content: '删除后该员工的所有配置将一并移除，操作不可撤销。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      async onOk() {
        try {
          await api.delete(`/api/enterprise/agents/${row.id}?tenant_id=${TENANT_ID}`);
          if (window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) === row.id && overallAgent) {
            window.localStorage.setItem(ENTERPRISE_AGENT_STORAGE_KEY, overallAgent.id);
            window.dispatchEvent(new CustomEvent('ultrarag-enterprise-agent-scope-change', { detail: { agentId: overallAgent.id } }));
          }
          message.success('员工已删除');
          await load();
          window.dispatchEvent(new Event('ultrarag-enterprise-agent-scope-refresh'));
        } catch (error) {
          message.error(error instanceof Error ? error.message : '删除员工失败');
        }
      },
    });
  }

  function updateAgentInList(row: AgentProfileRead) {
    setAgents((current) => current.map((item) => (item.id === row.id ? row : item)));
  }

  return (
    <div className="page agents-page">
      <div className="page-title">
        <div>
          <Typography.Title level={2}>{isOverallScope ? '数字员工广场' : '我的数字员工'}</Typography.Title>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
          刷新
        </Button>
      </div>

      <div className="agents-summary-grid">
        <Card className="agent-summary-card">
          <span>员工总数</span>
          <strong>{employees.length}</strong>
          <small>{employees.filter((item) => item.status === 'active').length} 位在线</small>
        </Card>
        <Card className="agent-summary-card">
          <span>已发布到广场</span>
          <strong>{employees.filter(isGalleryEmployee).length}</strong>
          <small>聊天端可选择</small>
        </Card>
        <Card className="agent-summary-card">
          <span>已下线</span>
          <strong>{employees.filter((item) => item.status !== 'active').length}</strong>
          <small>下线后聊天端不可选择</small>
        </Card>
      </div>

      <div className="employee-roster-grid">
        {employees.map((employee) => (
          <EmployeeCard
            key={employee.id}
            employee={employee}
            canManage={isAdmin || isEmployeeOwnedBy(employee, currentUser)}
            onOpen={() => selectEmployee(employee)}
            onStatus={(status) => void updateStatus(employee, status)}
            onGallery={(published) => void updateGalleryState(employee, published)}
            onDelete={() => deleteEmployee(employee)}
            onAvatar={() => setAvatarAgent(employee)}
            onEdit={() => setProfileAgent(employee)}
            onChat={() => startEmployeeChat(employee)}
          />
        ))}
      </div>
      <EmployeeAvatarEditor
        agent={avatarAgent}
        open={Boolean(avatarAgent)}
        onClose={() => setAvatarAgent(null)}
        onSaved={updateAgentInList}
      />
      <EmployeeProfileEditor
        agent={profileAgent}
        open={Boolean(profileAgent)}
        currentUser={currentUser}
        onClose={() => setProfileAgent(null)}
        onSaved={updateAgentInList}
      />
    </div>
  );
}

function EmployeeCard({
  employee,
  canManage,
  onOpen,
  onStatus,
  onGallery,
  onDelete,
  onAvatar,
  onEdit,
  onChat,
}: {
  employee: AgentProfileRead;
  canManage: boolean;
  onOpen: () => void;
  onStatus: (status: 'active' | 'archived') => void;
  onGallery: (published: boolean) => void;
  onDelete: () => void;
  onAvatar: () => void;
  onEdit: () => void;
  onChat: () => void;
}) {
  const profile = employeeProfile(employee);
  const sopCount = resourceCount(employee.resources, 'skill');
  const skillCount = resourceCount(employee.resources, 'general_skill');
  const kbCount = resourceCount(employee.resources, 'knowledge_base');
  const galleryPublished = isGalleryEmployee(employee);
  return (
    <Card className="employee-roster-card" hoverable onClick={onOpen}>
      <div className="employee-roster-head">
        <EmployeeAvatar agent={employee} size={54} />
        <div className="employee-roster-title">
          <strong>{employeeDisplayName(employee)}</strong>
          <span>{profile.roleName}</span>
        </div>
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'chat', icon: <CommentOutlined />, label: '发起对话', disabled: employee.status !== 'active' },
              employee.status === 'active'
                ? { key: 'archive', icon: <PauseCircleOutlined />, label: '下线', disabled: !canManage }
                : { key: 'active', icon: <PlayCircleOutlined />, label: '上线', disabled: !canManage },
              {
                key: 'gallery',
                icon: <GlobalOutlined />,
                label: galleryPublished ? '从广场下架' : '发布到广场',
                disabled: !canManage,
              },
              { key: 'edit', icon: <EditOutlined />, label: '编辑资料', disabled: !canManage },
              { key: 'avatar', icon: <PictureOutlined />, label: '设置头像', disabled: !canManage },
              { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true, disabled: !canManage },
            ],
            onClick: ({ key, domEvent }) => {
              domEvent.stopPropagation();
              if (key === 'chat') onChat();
              if (key === 'active') onStatus('active');
              if (key === 'archive') onStatus('archived');
              if (key === 'gallery') onGallery(!galleryPublished);
              if (key === 'edit') onEdit();
              if (key === 'avatar') onAvatar();
              if (key === 'delete') onDelete();
            },
          }}
        >
          <Button
            type="text"
            icon={<MoreOutlined />}
            aria-label="员工操作"
            onClick={(event) => event.stopPropagation()}
          />
        </Dropdown>
      </div>
      <Typography.Paragraph ellipsis={{ rows: 2 }}>
        {employee.description || '暂无描述'}
      </Typography.Paragraph>
      <Space wrap className="employee-roster-tags">
        <Tag color={employee.status === 'active' ? 'green' : 'default'}>{employee.status === 'active' ? '在线' : '下线'}</Tag>
        {galleryPublished && <Tag color="cyan">广场</Tag>}
        <Tag>SOP {sopCount}</Tag>
        <Tag>技能 {skillCount}</Tag>
        <Tag>资料 {kbCount}</Tag>
      </Space>
      <div className="employee-roster-styles">
        {profile.workStyles.slice(0, 3).map((item) => <span key={item}>{item}</span>)}
      </div>
    </Card>
  );
}
