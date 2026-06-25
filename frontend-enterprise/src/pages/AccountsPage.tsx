import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, UserOutlined } from '@ant-design/icons';
import { Button, Card, Input, Modal, Space, Table, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';
import { api, TENANT_ID } from '../api/client';

type EmployeeAccount = {
  id: string;
  tenant_id: string;
  username: string;
  display_name?: string;
  created_at?: string;
  updated_at?: string;
};

type AccountDraft = {
  displayName: string;
  password: string;
};

type AccountCreateDraft = {
  username: string;
  displayName: string;
  password: string;
};

export default function AccountsPage() {
  const [rows, setRows] = useState<EmployeeAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<EmployeeAccount | null>(null);
  const [draft, setDraft] = useState<AccountDraft>({ displayName: '', password: '' });
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<AccountCreateDraft>({ username: '', displayName: '', password: '' });
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const result = await api.get<EmployeeAccount[]>(`/api/auth/users?tenant_id=${TENANT_ID}`);
      setRows(result);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载账号失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openEdit(row: EmployeeAccount) {
    setEditing(row);
    setDraft({ displayName: row.display_name || row.username, password: '' });
  }

  function openCreate() {
    setCreateDraft({ username: '', displayName: '', password: '' });
    setCreateOpen(true);
  }

  async function saveCreate() {
    const username = createDraft.username.trim();
    const password = createDraft.password.trim();
    if (!username || !password) {
      message.error('请填写账号和密码');
      return;
    }
    setCreating(true);
    try {
      await api.post('/api/auth/users', {
        tenant_id: TENANT_ID,
        username,
        password,
        display_name: createDraft.displayName.trim() || username,
      });
      message.success('账号已创建');
      setCreateOpen(false);
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '创建账号失败');
    } finally {
      setCreating(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    try {
      await api.put(`/api/auth/users/${editing.id}`, {
        tenant_id: TENANT_ID,
        display_name: draft.displayName.trim() || editing.username,
        password: draft.password.trim() || undefined,
      });
      message.success('账号已更新');
      setEditing(null);
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存账号失败');
    } finally {
      setSaving(false);
    }
  }

  function remove(row: EmployeeAccount) {
    Modal.confirm({
      title: `删除账号「${row.username}」？`,
      content: '删除后该账号无法登录，但其创建的数字员工仍然保留。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.delete(`/api/auth/users/${row.id}?tenant_id=${TENANT_ID}`);
          message.success('账号已删除');
          await load();
        } catch (error) {
          message.error(error instanceof Error ? error.message : '删除账号失败');
        }
      },
    });
  }

  const columns: ColumnsType<EmployeeAccount> = [
    {
      title: '用户名',
      dataIndex: 'username',
      width: 180,
      ellipsis: true,
      render: (value) => (
        <span className="account-name-cell">
          <UserOutlined />
          {value}
        </span>
      ),
    },
    { title: '显示名', dataIndex: 'display_name', width: 200, ellipsis: true, render: (value, row) => value || row.username },
    { title: '创建时间', dataIndex: 'created_at', width: 180, render: formatTime },
    { title: '最近更新', dataIndex: 'updated_at', width: 180, render: formatTime },
    {
      title: '操作',
      width: 180,
      fixed: 'right',
      render: (_, row) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>编辑</Button>
          <Button size="small" danger icon={<DeleteOutlined />} disabled={row.username === 'admin' || row.username === 'admin_demo'} onClick={() => remove(row)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="page accounts-page">
      <div className="page-title">
        <div>
          <Typography.Title level={3}>账号管理</Typography.Title>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>刷新</Button>
      </div>
      <Card
        className="data-card"
        title="账号列表"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建账号</Button>}
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50] }}
          scroll={{ x: 920 }}
        />
      </Card>
      <Modal
        title="新建账号"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void saveCreate()}
        confirmLoading={creating}
        okText="创建"
        cancelText="取消"
        destroyOnClose
      >
        <div className="agent-editor-form">
          <label>
            用户名
            <Input
              value={createDraft.username}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, username: event.target.value }))}
              placeholder="例如 zhang_san"
            />
          </label>
          <label>
            显示名
            <Input
              value={createDraft.displayName}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, displayName: event.target.value }))}
              placeholder="例如 张三"
            />
          </label>
          <label>
            初始密码
            <Input.Password
              value={createDraft.password}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, password: event.target.value }))}
            />
          </label>
        </div>
      </Modal>
      <Modal
        title={editing ? `编辑账号：${editing.username}` : '编辑账号'}
        open={Boolean(editing)}
        onCancel={() => setEditing(null)}
        onOk={() => void saveEdit()}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <div className="agent-editor-form">
          <label>
            显示名
            <Input
              value={draft.displayName}
              onChange={(event) => setDraft((prev) => ({ ...prev, displayName: event.target.value }))}
            />
          </label>
          <label>
            新密码
            <Input.Password
              value={draft.password}
              placeholder="不修改请留空"
              onChange={(event) => setDraft((prev) => ({ ...prev, password: event.target.value }))}
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}

function formatTime(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}
