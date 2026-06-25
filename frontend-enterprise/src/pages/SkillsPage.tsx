import {
  CheckCircleOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  EyeOutlined,
  HistoryOutlined,
  MoreOutlined,
  PlusOutlined,
  RollbackOutlined,
  StopOutlined,
  SyncOutlined,
  TeamOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { Button, Card, Col, Descriptions, Dropdown, Input, Modal, Row, Segmented, Select, Space, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, TENANT_ID } from '../api/client';
import type { AgentProfileRead, SkillRead, SkillVersionRead } from '../types';

const ENTERPRISE_AGENT_STORAGE_KEY = 'ultrarag_enterprise_agent_scope';

const STATUS_LABELS: Record<SkillRead['status'], { text: string; color: string }> = {
  draft: { text: '草稿', color: 'blue' },
  published: { text: '已启用', color: 'green' },
  archived: { text: '已停用', color: 'default' },
};

type RankingMode = 'calls' | 'positive' | 'negative';
type RankingScope = 'current' | 'total';
type RankedSkill = SkillRead & { rank: number };
type RankingModalState = { mode: RankingMode; scope: RankingScope };
type SkillStatusFilter = 'all' | SkillRead['status'];
type BranchFilter = 'all' | 'synced' | 'diverged' | 'inactive';
type NumericSkillMetric =
  | 'call_count'
  | 'positive_feedback_count'
  | 'negative_feedback_count'
  | 'positive_rate'
  | 'negative_rate'
  | 'total_call_count'
  | 'total_positive_feedback_count'
  | 'total_negative_feedback_count'
  | 'total_positive_rate'
  | 'total_negative_rate'
  | 'recent_call_count'
  | 'recent_positive_feedback_count'
  | 'recent_negative_feedback_count'
  | 'recent_positive_rate'
  | 'recent_negative_rate';

export default function SkillsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<SkillRead[]>([]);
  const [versionRows, setVersionRows] = useState<SkillVersionRead[]>([]);
  const [versionSkill, setVersionSkill] = useState<SkillRead | null>(null);
  const [detailVersion, setDetailVersion] = useState<SkillVersionRead | null>(null);
  const [rankingModal, setRankingModal] = useState<RankingModalState | null>(null);
  const [positiveScope, setPositiveScope] = useState<RankingScope>('current');
  const [negativeScope, setNegativeScope] = useState<RankingScope>('current');
  const [versionModalTitle, setVersionModalTitle] = useState('');
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agentId, setAgentId] = useState(() => window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '');
  const [isOverallAgent, setIsOverallAgent] = useState(() => {
    const stored = window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '';
    return !stored || stored.includes('overall');
  });
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<SkillStatusFilter>('all');
  const [branchFilter, setBranchFilter] = useState<BranchFilter>('all');
  const [agents, setAgents] = useState<AgentProfileRead[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<'plaza' | 'employee'>('plaza');
  const [importSourceAgentId, setImportSourceAgentId] = useState('');
  const [importSourceSkills, setImportSourceSkills] = useState<SkillRead[]>([]);
  const [importSelectedSkillIds, setImportSelectedSkillIds] = useState<string[]>([]);
  const [importLoading, setImportLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const suffix = agentId ? `&agent_id=${encodeURIComponent(agentId)}` : '';
      const result = await api.get<SkillRead[]>(`/api/enterprise/skills?tenant_id=${TENANT_ID}${suffix}`);
      setRows(result);
      const agentRows = await api.get<AgentProfileRead[]>(`/api/enterprise/agents?tenant_id=${TENANT_ID}`);
      setAgents(agentRows);
      setIsOverallAgent(Boolean(agentRows.find((item) => item.id === agentId)?.is_overall ?? true));
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [agentId]);

  useEffect(() => {
    if (searchParams.get('add') !== 'plaza') return;
    if (agents.length === 0) return;
    const resourceId = searchParams.get('resourceId') || undefined;
    if (isOverallAgent) {
      message.warning('请先选择一个数字员工，再从广场复制 SOP');
    } else {
      void openImport('plaza', resourceId);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('add');
    next.delete('resourceId');
    setSearchParams(next, { replace: true });
  }, [agents.length, isOverallAgent, searchParams, setSearchParams]);

  useEffect(() => {
    const onScopeChange = (event: Event) => {
      const detail = (event as CustomEvent<{ agentId?: string }>).detail;
      setAgentId(detail?.agentId || window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '');
    };
    window.addEventListener('ultrarag-enterprise-agent-scope-change', onScopeChange);
    return () => window.removeEventListener('ultrarag-enterprise-agent-scope-change', onScopeChange);
  }, []);

  const filteredRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesKeyword = !keyword || [
        row.name,
        row.skill_id,
        row.business_domain || '',
        row.description || '',
        row.version,
      ].some((value) => value.toLowerCase().includes(keyword));
      const matchesStatus = statusFilter === 'all' || row.status === statusFilter;
      const branchState = row.branch_status === 'inactive' ? 'inactive' : row.branch_sync_state || 'synced';
      const matchesBranch = isOverallAgent || branchFilter === 'all' || branchState === branchFilter;
      return matchesKeyword && matchesStatus && matchesBranch;
    });
  }, [branchFilter, isOverallAgent, rows, searchText, statusFilter]);

  const columns: ColumnsType<SkillRead> = useMemo(
    () => [
      { title: 'SOP 名称', dataIndex: 'name', width: 180, ellipsis: true },
      { title: 'SOP ID', dataIndex: 'skill_id', width: 190, ellipsis: true },
      { title: '业务域', dataIndex: 'business_domain', width: 140, ellipsis: true },
      { title: '版本', dataIndex: 'version', width: 90 },
      {
        title: '本地版本',
        width: 120,
        render: (_, row) => {
          if (isOverallAgent) return <Tag>广场版</Tag>;
          if (row.branch_status === 'inactive') return <Tag>已停用</Tag>;
          const state = row.branch_sync_state || 'synced';
          return <Tag color={state === 'diverged' ? 'gold' : 'green'}>{state === 'diverged' ? '本地版本' : '已同步'}</Tag>;
        },
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 110,
        render: (status: SkillRead['status']) => {
          const option = STATUS_LABELS[status] || { text: status, color: 'default' };
          return <Tag color={option.color}>{option.text}</Tag>;
        },
      },
      { title: '调用次数', dataIndex: 'call_count', width: 100 },
      {
        title: '好评率',
        dataIndex: 'positive_rate',
        width: 100,
        render: (value: number) => percent(value),
      },
      {
        title: '差评率',
        dataIndex: 'negative_rate',
        width: 100,
        render: (value: number) => percent(value),
      },
      {
        title: '操作',
        width: 80,
        fixed: 'right',
        render: (_, row) => (
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'edit', icon: <EditOutlined />, label: isOverallAgent ? '编辑' : '编辑本地版本' },
                { key: 'versions', icon: <HistoryOutlined />, label: '版本管理' },
                row.status === 'published'
                  ? { key: 'archive', icon: <StopOutlined />, label: isOverallAgent ? '停用' : '停用本地版本' }
                  : { key: 'publish', icon: <CheckCircleOutlined />, label: isOverallAgent ? '启用' : '启用本地版本' },
                ...(!isOverallAgent
                  ? [
                      { key: 'sync', icon: <SyncOutlined />, label: '从广场同步' },
                      { key: 'promote', icon: <UploadOutlined />, label: '发布到广场' },
                      { key: 'delete', icon: <DeleteOutlined />, label: '移除', danger: true },
                    ]
                  : [{ key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true }]),
              ] as any,
              onClick: ({ key }) => handleAction(key, row),
            }}
          >
            <Button type="text" icon={<MoreOutlined />} aria-label="SOP 操作" />
          </Dropdown>
        ),
      },
    ],
    [agentId, isOverallAgent],
  );

  const rankingRows = useMemo(
    () => ({
      calls: rankByMetric(rows, 'total_call_count'),
      positiveCurrent: rankByMetric(rows, 'positive_rate', 'positive_feedback_count', 'call_count'),
      positiveTotal: rankByMetric(rows, 'total_positive_rate', 'total_positive_feedback_count', 'total_call_count'),
      negativeCurrent: rankByMetric(rows, 'negative_rate', 'negative_feedback_count', 'call_count'),
      negativeTotal: rankByMetric(rows, 'total_negative_rate', 'total_negative_feedback_count', 'total_call_count'),
    }),
    [rows],
  );

  const positiveRankingRows = positiveScope === 'current' ? rankingRows.positiveCurrent : rankingRows.positiveTotal;
  const negativeRankingRows = negativeScope === 'current' ? rankingRows.negativeCurrent : rankingRows.negativeTotal;
  const rankingModalRows = rankingModal ? rankingRowsFor(rankingRows, rankingModal.mode, rankingModal.scope) : [];
  const rankingModalTitle = rankingModal ? rankingTitle(rankingModal.mode, rankingModal.scope) : '完整排行';
  const rankingModalColumns = useMemo<ColumnsType<RankedSkill>>(
    () => [
      { title: '排名', dataIndex: 'rank', width: 80 },
      { title: 'SOP 名称', dataIndex: 'name', ellipsis: true },
      { title: 'SOP ID', dataIndex: 'skill_id', ellipsis: true },
      {
        title: rankingModal?.scope === 'current' ? '版本' : '版本范围',
        width: 130,
        render: (_, row) => rankingVersionText(row, rankingModal?.scope || 'total'),
      },
      { title: '业务域', dataIndex: 'business_domain', width: 140, ellipsis: true },
      {
        title: rankingMetricTitle(rankingModal?.mode || 'calls', rankingModal?.scope || 'total'),
        width: 130,
        render: (_, row) => rankingMetricValue(row, rankingModal?.mode || 'calls', rankingModal?.scope || 'total'),
      },
      {
        title: '调用次数',
        width: 110,
        render: (_, row) => `${rankingCalls(row, rankingModal?.scope || 'total')} 次`,
      },
      {
        title: '好评率',
        width: 110,
        render: (_, row) => percent(rankingPositiveRate(row, rankingModal?.scope || 'total')),
      },
      {
        title: '差评率',
        width: 110,
        render: (_, row) => percent(rankingNegativeRate(row, rankingModal?.scope || 'total')),
      },
      {
        title: '反馈数',
        width: 110,
        render: (_, row) => rankingFeedbackText(row, rankingModal?.scope || 'total'),
      },
    ],
    [rankingModal],
  );

  function openCreate() {
    navigate(`/enterprise/skills/distill?mode=create${agentId ? `&agent_id=${encodeURIComponent(agentId)}` : ''}`);
  }

  async function openImport(mode: 'plaza' | 'employee' = 'plaza', selectedResourceId?: string) {
    try {
      const agentRows = agents.length ? agents : await api.get<AgentProfileRead[]>(`/api/enterprise/agents?tenant_id=${TENANT_ID}`);
      setAgents(agentRows);
      setImportMode(mode);
      const candidates = agentRows.filter((item) => (
        item.id !== agentId && (mode === 'plaza' ? item.is_overall : !item.is_overall)
      ));
      const firstSource = candidates[0]?.id || '';
      setImportSourceAgentId(firstSource);
      setImportSelectedSkillIds([]);
      setImportOpen(true);
      if (firstSource) {
        const sourceRows = await loadImportSourceSkills(firstSource);
        if (selectedResourceId && sourceRows.some((item) => item.id === selectedResourceId)) {
          setImportSelectedSkillIds([selectedResourceId]);
        }
      } else {
        setImportSourceSkills([]);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载员工失败');
    }
  }

  async function loadImportSourceSkills(sourceAgentId: string): Promise<SkillRead[]> {
    setImportSourceSkills([]);
    setImportSelectedSkillIds([]);
    if (!sourceAgentId) return [];
    try {
      const sourceRows = await api.get<SkillRead[]>(`/api/enterprise/agents/${sourceAgentId}/skills?tenant_id=${TENANT_ID}`);
      const publishedRows = sourceRows.filter((item) => item.status === 'published');
      setImportSourceSkills(publishedRows);
      return publishedRows;
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载来源 SOP 失败');
      return [];
    }
  }

  async function submitImportSkills() {
    if (!agentId) {
      message.warning('请先选择一个数字员工');
      return;
    }
    if (!importSourceAgentId) {
      message.warning(importMode === 'plaza' ? '请选择 SOP 广场' : '请选择复制来源员工');
      return;
    }
    if (importSelectedSkillIds.length === 0) {
      message.warning('请选择要复制的 SOP');
      return;
    }
    setImportLoading(true);
    try {
      const result = await api.post<{ imported: Array<Record<string, unknown>>; missing: Array<Record<string, unknown>> }>(
        `/api/enterprise/agents/${agentId}/resources/import`,
        {
          tenant_id: TENANT_ID,
          source_agent_id: importSourceAgentId,
          resource_type: 'skill',
          resource_ids: importSelectedSkillIds,
        },
      );
      const importedCount = result.imported?.length || 0;
      const missingCount = result.missing?.length || 0;
      message.success(`已复制 ${importedCount} 个 SOP${missingCount ? `，${missingCount} 个未复制` : ''}`);
      setImportOpen(false);
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '复制失败');
    } finally {
      setImportLoading(false);
    }
  }

  function openEdit(row: SkillRead) {
    const suffix = agentId ? `&agent_id=${encodeURIComponent(agentId)}` : '';
    navigate(`/enterprise/skills/distill?skill_id=${encodeURIComponent(row.skill_id)}${suffix}`);
  }

  function handleCreateAction(key: string) {
    if (key === 'blank') {
      openCreate();
      return;
    }
    if (key === 'plaza') {
      void openImport('plaza');
      return;
    }
    if (key === 'employee') {
      void openImport('employee');
    }
  }

  async function publish(row: SkillRead) {
    await api.post(`/api/enterprise/skills/${row.skill_id}/publish?tenant_id=${TENANT_ID}${agentQuery()}`);
    message.success('已启用');
    load();
  }

  async function archive(row: SkillRead) {
    await api.post(`/api/enterprise/skills/${row.skill_id}/archive?tenant_id=${TENANT_ID}${agentQuery()}`);
    message.success('已停用');
    load();
  }

  async function openVersions(row: SkillRead) {
    setVersionSkill(row);
    setVersionModalTitle(`版本管理：${row.name}`);
    setVersionModalOpen(true);
    try {
      const result = await api.get<SkillVersionRead[]>(
        `/api/enterprise/skills/${encodeURIComponent(row.skill_id)}/versions?tenant_id=${TENANT_ID}${agentQuery()}`,
      );
      setVersionRows(result);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载版本失败');
    }
  }

  async function showVersionDetail(row: SkillVersionRead) {
    try {
      const result = await api.get<SkillVersionRead>(
        `/api/enterprise/skills/${encodeURIComponent(row.skill_id)}/versions/${encodeURIComponent(row.version)}?tenant_id=${TENANT_ID}`,
      );
      setDetailVersion(result);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载版本详情失败');
    }
  }

  function rollbackVersion(row: SkillVersionRead) {
    Modal.confirm({
      title: `回滚到版本 ${row.version}？`,
      content: `当前 SOP 将切换为「${row.name}」的 ${row.version} 版本内容，历史对话和反馈数据不会被删除。`,
      okText: '回滚',
      cancelText: '取消',
      onOk: async () => {
        const result = await api.post<SkillRead>(
          `/api/enterprise/skills/${encodeURIComponent(row.skill_id)}/versions/${encodeURIComponent(row.version)}/rollback?tenant_id=${TENANT_ID}${agentQuery()}`,
        );
        message.success(`已回滚到 ${row.version}`);
        await load();
        await openVersions(result);
      },
    });
  }

  function remove(row: SkillRead) {
    const branchMode = !isOverallAgent;
    Modal.confirm({
      title: branchMode ? `移除 SOP「${row.name}」？` : `删除 SOP「${row.name}」？`,
      content: branchMode
        ? '这只会在当前数字员工中隐藏该 SOP；开放广场和其他数字员工仍然保留。'
        : '删除后不会移除历史对话记录，但组织 SOP 列表中将不再显示该流程。',
      okText: branchMode ? '移除' : '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await api.delete(`/api/enterprise/skills/${row.skill_id}?tenant_id=${TENANT_ID}${agentQuery()}`);
        message.success(branchMode ? '已移除' : '已删除');
        load();
      },
    });
  }

  function handleAction(key: string, row: SkillRead) {
    if (key === 'edit') openEdit(row);
    if (key === 'versions') void openVersions(row);
    if (key === 'publish') void publish(row);
    if (key === 'archive') void archive(row);
    if (key === 'delete') remove(row);
    if (key === 'sync') void syncFromOverall(row);
    if (key === 'promote') void promoteToOverall(row);
  }

  async function syncFromOverall(row: SkillRead) {
    if (!agentId) return;
    await api.post(`/api/enterprise/agents/${agentId}/skills/${encodeURIComponent(row.skill_id)}/sync-from-overall?tenant_id=${TENANT_ID}`);
    message.success('已从广场同步');
    load();
  }

  async function promoteToOverall(row: SkillRead) {
    if (!agentId) return;
    Modal.confirm({
      title: `将「${row.name}」发布到广场？`,
      content: '这会把当前数字员工的本地版本发布为广场可复用的 SOP 新版本。',
      okText: '发布',
      cancelText: '取消',
      onOk: async () => {
        await api.post(`/api/enterprise/agents/${agentId}/skills/${encodeURIComponent(row.skill_id)}/promote-to-overall?tenant_id=${TENANT_ID}`);
        message.success('已发布到广场');
        load();
      },
    });
  }

  function agentQuery() {
    return agentId ? `&agent_id=${encodeURIComponent(agentId)}` : '';
  }

  return (
    <>
      <div className="page-title">
        <div>
          <Typography.Title level={3}>SOP</Typography.Title>
        </div>
      </div>
      <Card
        className="data-card"
        title={isOverallAgent ? 'SOP 广场列表' : '本地 SOP'}
        extra={(
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'blank', icon: <PlusOutlined />, label: '新建空白 SOP' },
                ...(!isOverallAgent ? [{ key: 'plaza', icon: <UploadOutlined />, label: '从广场复制' }] : []),
                ...(!isOverallAgent ? [{ key: 'employee', icon: <TeamOutlined />, label: '从数字员工复制 SOP' }] : []),
              ],
              onClick: ({ key }) => handleCreateAction(key),
            }}
          >
            <Button type="primary" className="create-dropdown-button">
              新增 <DownOutlined />
            </Button>
          </Dropdown>
        )}
      >
        <div className="skill-table-toolbar">
          <div className="skill-filter-combo">
            <Input.Search
              allowClear
              placeholder="搜索 SOP 名称、ID、业务域"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              className="skill-filter-search"
            />
            <Select<SkillStatusFilter>
              value={statusFilter}
              onChange={setStatusFilter}
              className="skill-filter-select skill-filter-select-status"
              options={[
                { label: '全部', value: 'all' },
                { label: '已启用', value: 'published' },
                { label: '草稿', value: 'draft' },
                { label: '已停用', value: 'archived' },
              ]}
            />
            {!isOverallAgent && (
              <Select<BranchFilter>
                value={branchFilter}
                onChange={setBranchFilter}
                className="skill-filter-select skill-filter-select-branch"
                options={[
                  { label: '全部版本', value: 'all' },
                  { label: '已同步', value: 'synced' },
                  { label: '本地版本', value: 'diverged' },
                  { label: '已停用', value: 'inactive' },
                ]}
              />
            )}
          </div>
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filteredRows}
          loading={loading}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 1080 }}
          size="middle"
        />
      </Card>
      <Row gutter={[16, 16]} className="skill-rank-row">
        <Col xs={24} lg={8}>
          <RankingCard
            title="调用排行"
            rows={rankingRows.calls.slice(0, 5)}
            value={(row) => `${row.total_call_count || 0} 次`}
            onMore={() => setRankingModal({ mode: 'calls', scope: 'total' })}
          />
        </Col>
        <Col xs={24} lg={8}>
          <RankingCard
            title="好评 SOP"
            rows={positiveRankingRows.slice(0, 5)}
            value={(row) => percent(positiveScope === 'current' ? row.positive_rate : row.total_positive_rate)}
            version={(row) => rankingVersionText(row, positiveScope)}
            scope={positiveScope}
            onScopeChange={setPositiveScope}
            onMore={() => setRankingModal({ mode: 'positive', scope: positiveScope })}
          />
        </Col>
        <Col xs={24} lg={8}>
          <RankingCard
            title="待改进 SOP"
            rows={negativeRankingRows.slice(0, 5)}
            value={(row) => percent(negativeScope === 'current' ? row.negative_rate : row.total_negative_rate)}
            version={(row) => rankingVersionText(row, negativeScope)}
            scope={negativeScope}
            onScopeChange={setNegativeScope}
            onMore={() => setRankingModal({ mode: 'negative', scope: negativeScope })}
          />
        </Col>
      </Row>
      <Modal
        open={importOpen}
        title={importMode === 'plaza' ? '从广场复制 SOP' : '从数字员工复制 SOP'}
        width={720}
        okText="复制"
        cancelText="取消"
        confirmLoading={importLoading}
        onOk={() => void submitImportSkills()}
        onCancel={() => setImportOpen(false)}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Select
            value={importSourceAgentId || undefined}
            placeholder={importMode === 'plaza' ? '选择 SOP 广场' : '选择复制来源'}
            onChange={(value) => {
              setImportSourceAgentId(value);
              void loadImportSourceSkills(value);
            }}
            options={agents
              .filter((item) => item.id !== agentId && (importMode === 'plaza' ? item.is_overall : !item.is_overall))
              .map((item) => ({
                value: item.id,
                label: item.is_overall ? 'SOP 广场' : item.name,
              }))}
            style={{ width: '100%' }}
          />
          <Select
            mode="multiple"
            value={importSelectedSkillIds}
            placeholder="选择一个或多个 SOP"
            onChange={setImportSelectedSkillIds}
            options={importSourceSkills.map((item) => ({
              value: item.id,
              label: `${item.name} · ${item.skill_id}`,
            }))}
            optionFilterProp="label"
            notFoundContent={importSourceAgentId ? '没有可复制的 SOP' : '请先选择复制来源'}
            style={{ width: '100%' }}
          />
          <Typography.Text type="secondary">
            {importMode === 'plaza'
              ? '从广场复制可用 SOP；不可复制内容不会出现在列表。'
              : '从数字员工复制可用 SOP；不可见内容不会出现在列表。'}
          </Typography.Text>
        </Space>
      </Modal>
      <Modal
        open={Boolean(rankingModal)}
        title={rankingModalTitle}
        width={1080}
        footer={null}
        onCancel={() => setRankingModal(null)}
      >
        <Table
          rowKey="skill_id"
          dataSource={rankingModalRows}
          columns={rankingModalColumns}
          pagination={{ pageSize: 10, pageSizeOptions: [10, 15], showSizeChanger: true }}
          size="small"
          scroll={{ x: 960 }}
        />
      </Modal>
      <Modal
        open={versionModalOpen}
        title={versionModalTitle}
        width={1080}
        footer={null}
        onCancel={() => {
          setVersionModalOpen(false);
          setVersionSkill(null);
        }}
      >
        <Table
          rowKey="id"
          dataSource={versionRows}
          pagination={false}
          size="small"
          columns={[
            { title: '版本', dataIndex: 'version', width: 100 },
            { title: 'SOP 名称', dataIndex: 'name', ellipsis: true },
            { title: '业务域', dataIndex: 'business_domain', width: 140, ellipsis: true },
            { title: '调用次数', dataIndex: 'call_count', width: 100 },
            { title: '好评率', dataIndex: 'positive_rate', width: 100, render: (value: number) => percent(value) },
            { title: '差评率', dataIndex: 'negative_rate', width: 100, render: (value: number) => percent(value) },
            { title: '更新时间', dataIndex: 'updated_at', width: 150, render: (value: string) => value.slice(0, 10) },
            {
              title: '操作',
              width: 80,
              fixed: 'right',
              render: (_, row) => (
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: [
                      { key: 'detail', icon: <EyeOutlined />, label: '查看详情' },
                      {
                        key: 'rollback',
                        icon: <RollbackOutlined />,
                        label: row.version === versionSkill?.version ? '当前版本' : '回滚到此版本',
                        disabled: row.version === versionSkill?.version,
                      },
                    ],
                    onClick: ({ key }) => {
                      if (key === 'detail') void showVersionDetail(row);
                      if (key === 'rollback') rollbackVersion(row);
                    },
                  }}
                >
                  <Button type="text" icon={<MoreOutlined />} aria-label="版本操作" />
                </Dropdown>
              ),
            },
          ]}
        />
      </Modal>
      <Modal
        open={Boolean(detailVersion)}
        title={detailVersion ? `版本详情：${detailVersion.name} / ${detailVersion.version}` : '版本详情'}
        width={920}
        footer={null}
        onCancel={() => setDetailVersion(null)}
      >
        {detailVersion && (
          <div className="version-detail">
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="SOP ID">{detailVersion.skill_id}</Descriptions.Item>
              <Descriptions.Item label="版本">{detailVersion.version}</Descriptions.Item>
              <Descriptions.Item label="业务域">{detailVersion.business_domain || '-'}</Descriptions.Item>
              <Descriptions.Item label="状态">{statusText(detailVersion.status)}</Descriptions.Item>
              <Descriptions.Item label="调用次数">{detailVersion.call_count}</Descriptions.Item>
              <Descriptions.Item label="好评率">{percent(detailVersion.positive_rate)}</Descriptions.Item>
              <Descriptions.Item label="差评率">{percent(detailVersion.negative_rate)}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{detailVersion.updated_at.slice(0, 10)}</Descriptions.Item>
            </Descriptions>
            <pre className="version-detail-source">{skillSourceText(detailVersion)}</pre>
          </div>
        )}
      </Modal>
    </>
  );
}

function RankingCard({
  title,
  rows,
  value,
  version,
  scope,
  onScopeChange,
  onMore,
}: {
  title: string;
  rows: RankedSkill[];
  value: (row: RankedSkill) => string;
  version?: (row: RankedSkill) => string;
  scope?: RankingScope;
  onScopeChange?: (scope: RankingScope) => void;
  onMore: () => void;
}) {
  return (
    <Card
      title={title}
      extra={
        <div className="skill-ranking-extra">
          {scope && onScopeChange && (
            <Segmented
              size="small"
              value={scope}
              options={[
                { label: '当前', value: 'current' },
                { label: '总榜', value: 'total' },
              ]}
              onChange={(value) => onScopeChange(value as RankingScope)}
            />
          )}
          <Button type="link" size="small" onClick={onMore}>
            查看更多
          </Button>
        </div>
      }
      className="skill-ranking-card"
    >
      {rows.length === 0 ? (
        <Typography.Text type="secondary">暂无数据</Typography.Text>
      ) : (
        rows.map((row) => (
          <div className="skill-ranking-item" key={`${title}_${row.skill_id}`}>
            <span className="skill-ranking-index">{row.rank}</span>
            <span className="skill-ranking-main">
              <span className="skill-ranking-name" title={row.name}>{row.name}</span>
              {version && <span className="skill-ranking-version">{version(row)}</span>}
            </span>
            <strong>{value(row)}</strong>
          </div>
        ))
      )}
    </Card>
  );
}

function rankByMetric(
  rows: SkillRead[],
  field: NumericSkillMetric,
  tieBreaker?: NumericSkillMetric,
  callTieBreaker: NumericSkillMetric = 'total_call_count',
): RankedSkill[] {
  return [...rows]
    .sort((a, b) => {
      const primary = (b[field] || 0) - (a[field] || 0);
      if (primary !== 0) return primary;
      if (tieBreaker) {
        const secondary = (b[tieBreaker] || 0) - (a[tieBreaker] || 0);
        if (secondary !== 0) return secondary;
      }
      return (b[callTieBreaker] || 0) - (a[callTieBreaker] || 0);
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function percent(value: number | undefined): string {
  return `${Math.round((value || 0) * 100)}%`;
}

function rankingTitle(mode: RankingMode, scope: RankingScope): string {
  if (mode === 'calls') return '完整排行：全历史调用';
  if (mode === 'positive') return scope === 'current' ? '完整排行：当前版本好评率' : '完整排行：历史总榜好评率';
  return scope === 'current' ? '完整排行：当前版本差评率' : '完整排行：历史总榜差评率';
}

function rankingRowsFor(
  rows: {
    calls: RankedSkill[];
    positiveCurrent: RankedSkill[];
    positiveTotal: RankedSkill[];
    negativeCurrent: RankedSkill[];
    negativeTotal: RankedSkill[];
  },
  mode: RankingMode,
  scope: RankingScope,
): RankedSkill[] {
  if (mode === 'calls') return rows.calls;
  if (mode === 'positive') return scope === 'current' ? rows.positiveCurrent : rows.positiveTotal;
  return scope === 'current' ? rows.negativeCurrent : rows.negativeTotal;
}

function rankingVersionText(row: SkillRead, scope: RankingScope): string {
  return scope === 'current' ? `v${row.version}` : '全版本';
}

function rankingMetricTitle(mode: RankingMode, scope: RankingScope): string {
  if (mode === 'calls') return '全历史调用';
  if (mode === 'positive') return scope === 'current' ? '当前好评率' : '总好评率';
  return scope === 'current' ? '当前差评率' : '总差评率';
}

function rankingMetricValue(row: SkillRead, mode: RankingMode, scope: RankingScope): string {
  if (mode === 'calls') return `${row.total_call_count || 0} 次`;
  if (mode === 'positive') return percent(scope === 'current' ? row.positive_rate : row.total_positive_rate);
  return percent(scope === 'current' ? row.negative_rate : row.total_negative_rate);
}

function rankingCalls(row: SkillRead, scope: RankingScope): number {
  return scope === 'current' ? row.call_count || 0 : row.total_call_count || 0;
}

function rankingPositiveRate(row: SkillRead, scope: RankingScope): number {
  return scope === 'current' ? row.positive_rate || 0 : row.total_positive_rate || 0;
}

function rankingNegativeRate(row: SkillRead, scope: RankingScope): number {
  return scope === 'current' ? row.negative_rate || 0 : row.total_negative_rate || 0;
}

function rankingFeedbackText(row: SkillRead, scope: RankingScope): string {
  if (scope === 'current') {
    return `${row.positive_feedback_count || 0}/${row.negative_feedback_count || 0}`;
  }
  return `${row.total_positive_feedback_count || 0}/${row.total_negative_feedback_count || 0}`;
}

function statusText(status: string): string {
  return STATUS_LABELS[status as SkillRead['status']]?.text || status;
}

function skillSourceText(row: SkillVersionRead): string {
  const skill = row.content;
  const nodes = skillGraphSteps(skill);
  return [
    `# ${skill.name}`,
    `- skill_id: ${skill.skill_id}`,
    `- version: ${skill.version}`,
    `- business_domain: ${skill.business_domain || '-'}`,
    `- description: ${skill.description || '-'}`,
    `- trigger_intents: ${formatList(skill.trigger_intents)}`,
    `- user_utterance_examples: ${formatList(skill.user_utterance_examples)}`,
    `- goal: ${formatList(skill.goal)}`,
    `- required_info: ${formatList(skill.required_info)}`,
    `- response_rules: ${formatList(skill.response_rules)}`,
    '',
    '## 详细节点',
    ...nodes.flatMap((step, index) => [
      '',
      `### 节点 ${index + 1}: ${String(step.name || step.node_id || '-')}`,
      `- node_id: ${String(step.node_id || '-')}`,
      `- node_type: ${String(step.type || 'collect_info')}`,
      `- condition: ${String(step.condition || '-')}`,
      `- instruction: ${String(step.instruction || '-')}`,
      `- expected_user_info: ${formatList(step.expected_user_info)}`,
      `- allowed_actions: ${formatList(step.allowed_actions)}`,
    ]),
  ].join('\n');
}

function skillGraphSteps(skill: SkillVersionRead['content']): Array<Record<string, unknown>> {
  if (Array.isArray(skill.nodes) && skill.nodes.length > 0) {
    return skill.nodes.map((node, index) => ({
      node_id: node.node_id || `node_${index + 1}`,
      type: node.type || 'collect_info',
      condition: node.condition || '',
      name: node.name || node.node_id || `节点 ${index + 1}`,
      instruction: node.instruction || '',
      expected_user_info: Array.isArray(node.expected_user_info) ? node.expected_user_info : [],
      allowed_actions: Array.isArray(node.allowed_actions) ? node.allowed_actions : [],
    }));
  }
  return [];
}

function formatList(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return '-';
  return value.map(String).join(', ');
}
