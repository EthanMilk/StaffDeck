import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  FileSearchOutlined,
  MoreOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Checkbox,
  Dropdown,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Segmented,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, TENANT_ID } from '../api/client';
import { employeeDisplayName } from '../employee';
import type { AgentProfileRead, ScheduledTaskRead, ScheduledTaskRunRead } from '../types';

const ENTERPRISE_AGENT_STORAGE_KEY = 'ultrarag_enterprise_agent_scope';
const WEEKDAY_OPTIONS = [
  { label: '周一', value: 0 },
  { label: '周二', value: 1 },
  { label: '周三', value: 2 },
  { label: '周四', value: 3 },
  { label: '周五', value: 4 },
  { label: '周六', value: 5 },
  { label: '周日', value: 6 },
];

type TaskFormValues = {
  title: string;
  prompt: string;
  description?: string;
  schedule_type: 'once' | 'daily' | 'weekly' | 'monthly';
  time: string;
  run_at: string;
  weekdays: number[];
  day_of_month: number;
  status: 'active' | 'paused';
  max_runs?: number;
};

type TaskListFilter = 'all' | 'pending' | 'completed' | 'paused';
type RunListFilter = 'all' | 'pending' | 'completed' | 'failed';
type StatusPresentation = {
  color: string;
  text: string;
};

const INITIAL_VALUES: TaskFormValues = {
  title: '',
  prompt: '',
  description: '',
  schedule_type: 'daily',
  time: '09:00',
  run_at: '',
  weekdays: [0],
  day_of_month: 1,
  status: 'active',
  max_runs: undefined,
};
const TASK_STATUS_PRESENTATION: Record<string, StatusPresentation> = {
  active: { color: 'green', text: '启用' },
  paused: { color: 'gold', text: '暂停' },
  completed: { color: 'blue', text: '已完成' },
  archived: { color: 'default', text: '已删除' },
};
const RUN_STATUS_PRESENTATION: Record<string, StatusPresentation> = {
  succeeded: { color: 'green', text: '成功' },
  failed: { color: 'red', text: '失败' },
  running: { color: 'blue', text: '执行中' },
  skipped: { color: 'default', text: '已跳过' },
};
const TASK_FILTERS: Record<TaskListFilter, (row: ScheduledTaskRead) => boolean> = {
  all: () => true,
  pending: (row) => row.status === 'active',
  paused: (row) => row.status === 'paused',
  completed: (row) => row.status === 'completed',
};
const RUN_FILTERS: Record<RunListFilter, (row: ScheduledTaskRunRead) => boolean> = {
  all: () => true,
  pending: (row) => row.status === 'queued' || row.status === 'running',
  failed: (row) => row.status === 'failed' || row.status === 'skipped',
  completed: (row) => row.status === 'succeeded',
};
const SCHEDULE_TYPES = new Set<TaskFormValues['schedule_type']>([
  'once',
  'daily',
  'weekly',
  'monthly',
]);
const SCHEDULE_BUILDERS: Record<
  TaskFormValues['schedule_type'],
  (values: TaskFormValues) => Record<string, unknown>
> = {
  once: (values) => ({ run_at: values.run_at }),
  weekly: (values) => ({
    time: values.time || '09:00',
    weekdays: values.weekdays?.length ? values.weekdays : [0],
  }),
  monthly: (values) => ({
    time: values.time || '09:00',
    day_of_month: values.day_of_month || 1,
  }),
  daily: (values) => ({ time: values.time || '09:00' }),
};
const SCHEDULE_FORMATTERS: Record<
  TaskFormValues['schedule_type'],
  (row: ScheduledTaskRead, schedule: Record<string, unknown>) => string
> = {
  once: (row, schedule) =>
    `一次性 · ${formatTime(String(schedule.run_at || row.next_run_at || ''))}`,
  weekly: (_row, schedule) => {
    const days = Array.isArray(schedule.weekdays)
      ? schedule.weekdays
          .map((item) => WEEKDAY_OPTIONS[Number(item)]?.label)
          .filter(Boolean)
          .join('、')
      : '周一';
    return `每周 ${days} ${schedule.time || '09:00'}`;
  },
  monthly: (_row, schedule) =>
    `每月 ${schedule.day_of_month || 1} 号 ${schedule.time || '09:00'}`,
  daily: (_row, schedule) => `每天 ${schedule.time || '09:00'}`,
};

export default function ScheduledTasksPage() {
  const [rows, setRows] = useState<ScheduledTaskRead[]>([]);
  const [agents, setAgents] = useState<AgentProfileRead[]>([]);
  const [agentId, setAgentId] = useState(() => window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '');
  const [loading, setLoading] = useState(false);
  const [runsOpen, setRunsOpen] = useState(false);
  const [runRows, setRunRows] = useState<ScheduledTaskRunRead[]>([]);
  const [allRunRows, setAllRunRows] = useState<ScheduledTaskRunRead[]>([]);
  const [taskFilter, setTaskFilter] = useState<TaskListFilter>('all');
  const [runFilter, setRunFilter] = useState<RunListFilter>('all');
  const [runLoading, setRunLoading] = useState(false);
  const navigate = useNavigate();

  const selectedAgent = agents.find((item) => item.id === agentId) || null;

  useEffect(() => {
    const onScopeChange = (event: Event) => {
      const nextAgentId = (event as CustomEvent<{ agentId?: string }>).detail?.agentId || window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '';
      setAgentId(nextAgentId);
    };
    window.addEventListener('ultrarag-enterprise-agent-scope-change', onScopeChange);
    return () => window.removeEventListener('ultrarag-enterprise-agent-scope-change', onScopeChange);
  }, []);

  useEffect(() => {
    void loadAgents();
  }, []);

  useEffect(() => {
    if (agentId) void load();
  }, [agentId]);

  async function loadAgents() {
    try {
      const result = await api.get<AgentProfileRead[]>(`/api/enterprise/agents?tenant_id=${TENANT_ID}`);
      setAgents(result);
    } catch {
      setAgents([]);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const [result, runResult] = await Promise.all([
        api.get<ScheduledTaskRead[]>(
          `/api/enterprise/scheduled-tasks?tenant_id=${TENANT_ID}&agent_id=${encodeURIComponent(agentId)}`,
        ),
        api.get<ScheduledTaskRunRead[]>(
          `/api/enterprise/scheduled-tasks/runs?tenant_id=${TENANT_ID}&agent_id=${encodeURIComponent(agentId)}&limit=200`,
        ),
      ]);
      setRows(result);
      setAllRunRows(runResult);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载定时任务失败');
    } finally {
      setLoading(false);
    }
  }

  async function toggleStatus(row: ScheduledTaskRead) {
    if (row.status === 'archived') {
      message.warning('已删除的定时任务不能重新启用');
      return;
    }
    if (row.status === 'completed') {
      message.warning('已完成的定时任务可编辑后重新启用');
      return;
    }
    const nextStatus = row.status === 'active' ? 'paused' : 'active';
    try {
      await api.put<ScheduledTaskRead>(`/api/enterprise/scheduled-tasks/${row.id}`, {
        tenant_id: TENANT_ID,
        status: nextStatus,
      });
      message.success(nextStatus === 'active' ? '定时任务已启用' : '定时任务已暂停');
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新定时任务失败');
    }
  }

  async function runNow(row: ScheduledTaskRead) {
    if (row.status === 'archived') {
      message.warning('已删除的定时任务不能运行');
      return;
    }
    const hide = message.loading('正在创建执行记录...', 0);
    try {
      const run = await api.post<ScheduledTaskRunRead>(
        `/api/enterprise/scheduled-tasks/${row.id}/run-now?tenant_id=${TENANT_ID}`,
      );
      message.success(run.session_id ? '已创建独立任务会话，后台开始执行' : '已触发后台执行');
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '立即执行失败');
    } finally {
      hide();
    }
  }

  function remove(row: ScheduledTaskRead) {
    Modal.confirm({
      title: `删除定时任务「${row.title}」？`,
      content: '删除后不再唤醒该员工，历史执行记录会继续保留。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await api.delete(`/api/enterprise/scheduled-tasks/${row.id}?tenant_id=${TENANT_ID}`);
        message.success('已删除');
        await load();
      },
    });
  }

  async function openRuns(row: ScheduledTaskRead) {
    setRunsOpen(true);
    setRunLoading(true);
    try {
      const result = await api.get<ScheduledTaskRunRead[]>(
        `/api/enterprise/scheduled-tasks/${row.id}/runs?tenant_id=${TENANT_ID}`,
      );
      setRunRows(result);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载执行记录失败');
    } finally {
      setRunLoading(false);
    }
  }

  function handleCreateAction(key: string) {
    if (key === 'blank') {
      navigate('/enterprise/scheduled-tasks/new');
    }
  }

  function openChatSession(sessionId?: string) {
    if (!sessionId) return;
    window.open(`/chat/${sessionId}`, '_blank', 'noopener,noreferrer');
  }

  const activeRows = rows.filter((item) => item.status === 'active');
  const taskRows = rows.filter((item) => item.status !== 'archived');
  const visibleRows = taskRows.filter((item) => matchesTaskFilter(item, taskFilter));
  const visibleRunRows = allRunRows.filter((item) => matchesRunFilter(item, runFilter));
  const renderTaskActions = (row: ScheduledTaskRead) => {
    const isArchived = row.status === 'archived';
    const isCompleted = row.status === 'completed';
    const items = [
      {
        key: 'runs',
        icon: <FileSearchOutlined />,
        label: '执行记录',
      },
      ...(!isArchived ? [
        {
          key: 'edit',
          icon: <EditOutlined />,
          label: '编辑',
        },
        {
          key: 'run',
          icon: <PlayCircleOutlined />,
          label: '立即执行',
        },
        ...(!isCompleted ? [
          {
            key: 'toggle',
            icon: row.status === 'active' ? <PauseCircleOutlined /> : <PlayCircleOutlined />,
            label: row.status === 'active' ? '暂停' : '启用',
          },
        ] : []),
        {
          key: 'delete',
          icon: <DeleteOutlined />,
          label: '删除',
          danger: true,
        },
      ] : []),
    ];
    return (
      <Dropdown
        trigger={['click']}
        placement="bottomRight"
        menu={{
          items,
          onClick: ({ key }) => {
            if (key === 'runs') void openRuns(row);
            if (key === 'edit') navigate(`/enterprise/scheduled-tasks/${row.id}/edit`);
            if (key === 'run') void runNow(row);
            if (key === 'toggle') void toggleStatus(row);
            if (key === 'delete') remove(row);
          },
        }}
      >
        <Button size="small" icon={<MoreOutlined />} className="scheduled-task-action-trigger">
          操作
        </Button>
      </Dropdown>
    );
  };
  const columns: ColumnsType<ScheduledTaskRead> = [
    {
      title: '定时任务',
      dataIndex: 'title',
      width: 220,
      render: (value, row) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{value}</Typography.Text>
          <Typography.Text type="secondary" ellipsis style={{ maxWidth: 320 }}>{row.prompt}</Typography.Text>
        </Space>
      ),
    },
    { title: '计划', width: 210, render: (_, row) => formatSchedule(row) },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (value) => <TaskStatusTag status={value} />,
    },
    { title: '下次执行', dataIndex: 'next_run_at', width: 180, render: formatTime },
    { title: '已执行', dataIndex: 'run_count', width: 90, render: (value) => `${value || 0} 次` },
    { title: '最近结果', dataIndex: 'last_status', width: 110, render: (value) => value ? <TaskRunStatusTag status={value} /> : '暂无' },
    {
      title: '操作',
      fixed: 'right',
      width: 110,
      align: 'right',
      render: (_, row) => renderTaskActions(row),
    },
  ];
  const runColumns: ColumnsType<ScheduledTaskRunRead> = [
    {
      title: '定时任务',
      dataIndex: 'task_title',
      width: '18%',
      render: (value, row) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong ellipsis className="scheduled-task-run-title">
            {value || row.scheduled_task_id}
          </Typography.Text>
          {row.task_status === 'archived' && <Tag>任务已删除</Tag>}
        </Space>
      ),
    },
    { title: '计划时间', dataIndex: 'scheduled_for', width: '13%', render: formatTime },
    { title: '状态', dataIndex: 'status', width: '8%', render: (value) => <TaskRunStatusTag status={value} /> },
    { title: '完成时间', dataIndex: 'finished_at', width: '13%', render: formatTime },
    {
      title: '结果',
      dataIndex: 'result_summary',
      width: '40%',
      ellipsis: true,
      render: (value, row) => (
        <Typography.Text className="scheduled-task-run-summary">
          {value || row.error || '暂无'}
        </Typography.Text>
      ),
    },
    {
      title: '操作',
      width: '8%',
      align: 'right',
      render: (_, row) => (
        <Button size="small" disabled={!row.session_id} onClick={() => openChatSession(row.session_id)}>
          打开会话
        </Button>
      ),
    },
  ];

  return (
    <div className="page scheduled-task-page">
      <div className="page-title">
        <div>
          <Typography.Title level={3}>定时任务</Typography.Title>
          <Typography.Paragraph type="secondary">
            为当前员工设置周期或一次性任务，到点后会新建独立执行记录，并按员工已有 SOP、技能、资料和工具执行。
          </Typography.Paragraph>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>刷新</Button>
          <Dropdown
            trigger={['click']}
            disabled={!agentId || Boolean(selectedAgent?.is_overall)}
            menu={{
              items: [
                { key: 'blank', icon: <PlusOutlined />, label: '新建空白' },
              ],
              onClick: ({ key }) => handleCreateAction(key),
            }}
          >
            <Button type="primary" className="create-dropdown-button" disabled={!agentId || Boolean(selectedAgent?.is_overall)}>
              新增 <DownOutlined />
            </Button>
          </Dropdown>
        </Space>
      </div>

      {selectedAgent?.is_overall ? (
        <Card className="empty-workspace-card">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请先选择一个数字员工再配置定时任务。" />
        </Card>
      ) : (
        <>
          <div className="scheduled-task-stats">
            <TaskStat title="当前员工" value={selectedAgent ? employeeDisplayName(selectedAgent) : '未选择'} />
            <TaskStat title="待完成" value={activeRows.length} />
            <TaskStat title="已完成" value={taskRows.filter((item) => item.status === 'completed').length} />
            <TaskStat title="执行记录" value={allRunRows.length} />
          </div>
          <Card
            className="data-card scheduled-task-list-card"
            title="任务列表"
            extra={(
              <Segmented
                size="small"
                value={taskFilter}
                onChange={(value) => setTaskFilter(value as TaskListFilter)}
                options={[
                  { label: '全部', value: 'all' },
                  { label: '待完成', value: 'pending' },
                  { label: '已完成', value: 'completed' },
                  { label: '已暂停', value: 'paused' },
                ]}
              />
            )}
          >
            <div className="scheduled-task-mobile-list">
              {visibleRows.length ? visibleRows.map((row) => (
                <article className="scheduled-task-mobile-card" key={row.id}>
                  <div className="scheduled-task-mobile-card-head">
                    <Typography.Text strong>{row.title}</Typography.Text>
                    <TaskStatusTag status={row.status} />
                  </div>
                  <Typography.Paragraph className="scheduled-task-mobile-summary" type="secondary">
                    {row.prompt}
                  </Typography.Paragraph>
                  <div className="scheduled-task-mobile-meta">
                    <span><b>计划</b>{formatSchedule(row)}</span>
                    <span><b>下次</b>{formatTime(row.next_run_at)}</span>
                    <span><b>已执行</b>{row.run_count || 0} 次</span>
                    <span><b>最近</b>{row.last_status ? <TaskRunStatusTag status={row.last_status} /> : '暂无'}</span>
                  </div>
                  <div className="scheduled-task-mobile-actions">{renderTaskActions(row)}</div>
                </article>
              )) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无定时任务" />
              )}
            </div>
            <Table
              className="scheduled-task-desktop-table"
              rowKey="id"
              columns={columns}
              dataSource={visibleRows}
              loading={loading}
              pagination={{ pageSize: 8, showSizeChanger: true, pageSizeOptions: [8, 16, 32] }}
              scroll={{ x: 1220 }}
            />
          </Card>
          <Card
            className="data-card scheduled-task-list-card"
            title="执行记录"
            extra={(
              <Segmented
                size="small"
                value={runFilter}
                onChange={(value) => setRunFilter(value as RunListFilter)}
                options={[
                  { label: '全部', value: 'all' },
                  { label: '待完成', value: 'pending' },
                  { label: '已完成', value: 'completed' },
                  { label: '失败/跳过', value: 'failed' },
                ]}
              />
            )}
          >
            <div className="scheduled-task-mobile-list">
              {visibleRunRows.length ? visibleRunRows.map((row) => (
                <article className="scheduled-task-mobile-card scheduled-task-run-mobile-card" key={row.id}>
                  <div className="scheduled-task-mobile-card-head">
                    <Typography.Text strong>{row.task_title || row.scheduled_task_id}</Typography.Text>
                    <TaskRunStatusTag status={row.status} />
                  </div>
                  {row.task_status === 'archived' && <Tag className="scheduled-task-mobile-tag">任务已删除</Tag>}
                  <div className="scheduled-task-mobile-meta">
                    <span><b>计划时间</b>{formatTime(row.scheduled_for)}</span>
                    <span><b>完成时间</b>{formatTime(row.finished_at)}</span>
                  </div>
                  <Typography.Paragraph className="scheduled-task-mobile-summary" type="secondary">
                    {row.result_summary || row.error || '暂无结果'}
                  </Typography.Paragraph>
                  <span className="table-actions scheduled-task-actions">
                    <Button size="small" icon={<FileSearchOutlined />} disabled={!row.session_id} onClick={() => openChatSession(row.session_id)}>
                      打开会话
                    </Button>
                  </span>
                </article>
              )) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无执行记录" />
              )}
            </div>
            <Table
              className="scheduled-task-desktop-table scheduled-task-run-table"
              rowKey="id"
              columns={runColumns}
              dataSource={visibleRunRows}
              loading={loading}
              pagination={{ pageSize: 8, showSizeChanger: true, pageSizeOptions: [8, 16, 32] }}
            />
          </Card>
        </>
      )}

      <Modal
        width={920}
        title="执行记录"
        open={runsOpen}
        footer={null}
        onCancel={() => setRunsOpen(false)}
      >
        <Table
          rowKey="id"
          size="small"
          loading={runLoading}
          dataSource={runRows}
          pagination={{ pageSize: 6 }}
          columns={[
            { title: '计划时间', dataIndex: 'scheduled_for', width: 170, render: formatTime },
            { title: '状态', dataIndex: 'status', width: 110, render: (value) => <TaskRunStatusTag status={value} /> },
            { title: '会话', dataIndex: 'session_id', width: 180, render: (value) => value || '未生成' },
            { title: '结果', dataIndex: 'result_summary', ellipsis: true, render: (value, row) => value || row.error || '暂无' },
          ]}
        />
      </Modal>
    </div>
  );
}

export function ScheduledTaskNewPage() {
  return <ScheduledTaskEditorPage mode="new" />;
}

export function ScheduledTaskEditPage() {
  return <ScheduledTaskEditorPage mode="edit" />;
}

function ScheduledTaskEditorPage({ mode }: { mode: 'new' | 'edit' }) {
  const [form] = Form.useForm<TaskFormValues>();
  const [loading, setLoading] = useState(false);
  const [task, setTask] = useState<ScheduledTaskRead | null>(null);
  const [agentId, setAgentId] = useState(() => window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '');
  const navigate = useNavigate();
  const { taskId } = useParams();
  const scheduleType = Form.useWatch('schedule_type', form) || 'daily';
  const isEdit = mode === 'edit';

  useEffect(() => {
    const onScopeChange = (event: Event) => {
      const nextAgentId = (event as CustomEvent<{ agentId?: string }>).detail?.agentId || window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '';
      setAgentId(nextAgentId);
    };
    window.addEventListener('ultrarag-enterprise-agent-scope-change', onScopeChange);
    return () => window.removeEventListener('ultrarag-enterprise-agent-scope-change', onScopeChange);
  }, []);

  useEffect(() => {
    if (!isEdit) {
      form.setFieldsValue(INITIAL_VALUES);
      return;
    }
    if (!taskId) return;
    setLoading(true);
    api
      .get<ScheduledTaskRead>(`/api/enterprise/scheduled-tasks/${taskId}?tenant_id=${TENANT_ID}`)
      .then((row) => {
        setTask(row);
        setAgentId(row.agent_id);
        form.setFieldsValue(taskToFormValues(row));
      })
      .catch((error) => message.error(error instanceof Error ? error.message : '加载定时任务失败'))
      .finally(() => setLoading(false));
  }, [form, isEdit, taskId]);

  async function save() {
    let values: TaskFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    if (!agentId) {
      message.error('请先选择员工');
      return;
    }
    const payload = {
      tenant_id: TENANT_ID,
      agent_id: agentId,
      title: values.title.trim(),
      prompt: values.prompt.trim(),
      description: values.description?.trim() || undefined,
      schedule_type: values.schedule_type,
      schedule: buildSchedule(values),
      timezone: 'Asia/Shanghai',
      status: values.status,
      concurrency_policy: 'forbid',
      misfire_policy: 'coalesce',
      max_runs: values.max_runs || undefined,
    };
    setLoading(true);
    try {
      const saved = isEdit && taskId
        ? await api.put<ScheduledTaskRead>(`/api/enterprise/scheduled-tasks/${taskId}`, payload)
        : await api.post<ScheduledTaskRead>('/api/enterprise/scheduled-tasks', payload);
      message.success('定时任务已保存');
      if (!isEdit) {
        navigate(`/enterprise/scheduled-tasks/${saved.id}/edit`, { replace: true });
      } else {
        setTask(saved);
        form.setFieldsValue(taskToFormValues(saved));
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存定时任务失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page scheduled-task-editor-page">
      <div className="page-title">
        <div>
          <Typography.Title level={3}>{isEdit ? '编辑定时任务' : '新建空白定时任务'}</Typography.Title>
          <Typography.Text type="secondary">
            保存后到点会拉起一个新的执行记录，并交给当前员工按 SOP、技能、资料和工具执行。
          </Typography.Text>
        </div>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/enterprise/scheduled-tasks')}>返回定时任务</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={loading} onClick={() => void save()}>保存</Button>
        </Space>
      </div>
      <Form form={form} layout="vertical" initialValues={INITIAL_VALUES}>
        <div className="grid-2 scheduled-task-editor-grid">
          <Card className="editor-card" title="任务说明" loading={loading && isEdit && !task}>
            <Form.Item name="title" label="任务名称" rules={[{ required: true, message: '请填写任务名称' }]}>
              <Input prefix={<ClockCircleOutlined />} maxLength={80} placeholder="例如：每日售后质量复盘" />
            </Form.Item>
            <Form.Item name="prompt" label="每次执行时交给员工的任务" rules={[{ required: true, message: '请填写任务描述' }]}>
              <Input.TextArea rows={7} maxLength={10000} showCount placeholder="描述员工每次执行时需要做什么，可以包含拆解要求、输出格式和注意事项。" />
            </Form.Item>
            <Form.Item name="description" label="内部备注">
              <Input.TextArea rows={3} placeholder="可选，用于说明这个定时任务的来源和目的" />
            </Form.Item>
          </Card>
          <Card className="editor-card" title="唤醒计划">
            <Form.Item name="status" label="启用状态" valuePropName="checked" getValueFromEvent={(checked: boolean) => checked ? 'active' : 'paused'} getValueProps={(value) => ({ checked: value !== 'paused' })}>
              <Switch checkedChildren="启用" unCheckedChildren="暂停" />
            </Form.Item>
            <Form.Item name="schedule_type" label="调度类型" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'daily', label: '每天' },
                  { value: 'weekly', label: '每周' },
                  { value: 'monthly', label: '每月' },
                  { value: 'once', label: '一次性' },
                ]}
              />
            </Form.Item>
            {scheduleType === 'once' ? (
              <Form.Item name="run_at" label="执行时间" rules={[{ required: true, message: '请选择执行时间' }]}>
                <Input type="datetime-local" />
              </Form.Item>
            ) : (
              <Form.Item name="time" label="执行时间" rules={[{ required: true, message: '请填写执行时间' }]}>
                <Input type="time" />
              </Form.Item>
            )}
            {scheduleType === 'weekly' && (
              <Form.Item name="weekdays" label="执行日期" rules={[{ required: true, message: '请选择星期' }]}>
                <Checkbox.Group options={WEEKDAY_OPTIONS} />
              </Form.Item>
            )}
            {scheduleType === 'monthly' && (
              <Form.Item name="day_of_month" label="每月几号">
                <InputNumber min={1} max={31} />
              </Form.Item>
            )}
            <Form.Item name="max_runs" label="最大运行次数">
              <InputNumber min={1} placeholder="不填为无限制" style={{ width: '100%' }} />
            </Form.Item>
            <div className="scheduled-task-policy-note">
              默认使用 forbid 并发策略：上一轮未结束时跳过本次唤醒，避免同一员工重复处理同一批任务。
            </div>
          </Card>
        </div>
      </Form>
    </div>
  );
}

function TaskStat({ title, value }: { title: string; value: string | number }) {
  return (
    <Card className="scheduled-task-stat">
      <Typography.Text type="secondary">{title}</Typography.Text>
      <strong>{value}</strong>
    </Card>
  );
}

function TaskStatusTag({ status }: { status: string }) {
  const { color, text } = TASK_STATUS_PRESENTATION[status] || TASK_STATUS_PRESENTATION.archived;
  return <Tag color={color}>{text}</Tag>;
}

function TaskRunStatusTag({ status }: { status: string }) {
  const { color, text } = RUN_STATUS_PRESENTATION[status] || {
    color: 'default',
    text: status || '暂无',
  };
  return <Tag color={color}>{text}</Tag>;
}

function matchesTaskFilter(row: ScheduledTaskRead, filter: TaskListFilter): boolean {
  return TASK_FILTERS[filter](row);
}

function matchesRunFilter(row: ScheduledTaskRunRead, filter: RunListFilter): boolean {
  return RUN_FILTERS[filter](row);
}

function buildSchedule(values: TaskFormValues): Record<string, unknown> {
  return SCHEDULE_BUILDERS[values.schedule_type](values);
}

function taskToFormValues(row: ScheduledTaskRead): TaskFormValues {
  const schedule = row.schedule || {};
  return {
    title: row.title,
    prompt: row.prompt,
    description: row.description || '',
    schedule_type: normalizeScheduleType(row.schedule_type),
    time: String(schedule.time || '09:00'),
    run_at: toDatetimeLocal(String(schedule.run_at || row.next_run_at || '')),
    weekdays: Array.isArray(schedule.weekdays) ? schedule.weekdays.map((item) => Number(item)) : [0],
    day_of_month: Number(schedule.day_of_month || 1),
    status: row.status === 'active' ? 'active' : 'paused',
    max_runs: row.max_runs,
  };
}

function normalizeScheduleType(value: string): TaskFormValues['schedule_type'] {
  const scheduleType = value as TaskFormValues['schedule_type'];
  return SCHEDULE_TYPES.has(scheduleType) ? scheduleType : 'daily';
}

function toDatetimeLocal(value: string): string {
  if (!value) return '';
  const date = parseBackendTime(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function formatSchedule(row: ScheduledTaskRead): string {
  const schedule = row.schedule || {};
  return SCHEDULE_FORMATTERS[normalizeScheduleType(row.schedule_type)](row, schedule);
}

function formatTime(value?: string): string {
  if (!value) return '暂无';
  const date = parseBackendTime(value);
  if (Number.isNaN(date.getTime())) return '暂无';
  return date.toLocaleString('zh-CN', { hour12: false });
}

function parseBackendTime(value: string): Date {
  const text = String(value || '').trim();
  if (!text) return new Date('');
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(text)) return new Date(text);
  return new Date(`${text}Z`);
}
