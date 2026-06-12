import {
  CheckOutlined,
  CloseOutlined,
  DatabaseOutlined,
  FileAddOutlined,
  FileSearchOutlined,
  InboxOutlined,
  ReloadOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { Button, Card, Col, Collapse, Empty, Input, Progress, Row, Select, Space, Table, Tag, Typography, Upload, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, TENANT_ID } from '../api/client';
import type {
  KnowledgeBaseRead,
  KnowledgeBucketRead,
  KnowledgeDiscoveryRead,
  KnowledgeDocumentRead,
  KnowledgeIngestJobRead,
} from '../types';

const { Dragger } = Upload;
const ENTERPRISE_AGENT_STORAGE_KEY = 'ultrarag_enterprise_agent_scope';

export default function KnowledgeManagePage() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<KnowledgeDocumentRead[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseRead[]>([]);
  const [discoveries, setDiscoveries] = useState<KnowledgeDiscoveryRead[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<KnowledgeDocumentRead | null>(null);
  const [buckets, setBuckets] = useState<KnowledgeBucketRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [agentId, setAgentId] = useState(() => window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '');

  const actionableDiscoveries = discoveries.filter((item) => item.status === 'pending' && item.suggestion_type !== 'warning');
  const warningDiscoveries = discoveries.filter((item) => item.suggestion_type === 'warning' || item.status !== 'pending');

  useEffect(() => {
    void refresh();
  }, [agentId]);

  useEffect(() => {
    const onScopeChange = (event: Event) => {
      setAgentId((event as CustomEvent<{ agentId?: string }>).detail?.agentId || window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '');
    };
    window.addEventListener('ultrarag-enterprise-agent-scope-change', onScopeChange);
    return () => window.removeEventListener('ultrarag-enterprise-agent-scope-change', onScopeChange);
  }, []);

  async function refresh() {
    setLoading(true);
    const suffix = agentId ? `&agent_id=${encodeURIComponent(agentId)}` : '';
    try {
      const [docRows, discoveryRows, kbRows] = await Promise.all([
        api.get<KnowledgeDocumentRead[]>(`/api/enterprise/knowledge/documents?tenant_id=${TENANT_ID}${suffix}`),
        api.get<KnowledgeDiscoveryRead[]>(`/api/enterprise/knowledge/discoveries?tenant_id=${TENANT_ID}${suffix}`),
        api.get<KnowledgeBaseRead[]>(`/api/enterprise/knowledge-bases?tenant_id=${TENANT_ID}${suffix}`),
      ]);
      setDocuments(docRows);
      setDiscoveries(discoveryRows);
      setKnowledgeBases(kbRows);
      const current = selectedDocument ? docRows.find((item) => item.id === selectedDocument.id) || null : docRows[0] || null;
      setSelectedDocument(current);
      if (current) {
        await loadBuckets(current, false);
      } else {
        setBuckets([]);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '刷新知识库失败');
    } finally {
      setLoading(false);
    }
  }

  async function loadBuckets(document: KnowledgeDocumentRead, select = true) {
    if (select) setSelectedDocument(document);
    try {
      const rows = await api.get<KnowledgeBucketRead[]>(
        `/api/enterprise/knowledge/documents/${document.id}/buckets?tenant_id=${TENANT_ID}`,
      );
      setBuckets(rows);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载知识桶失败');
    }
  }

  async function confirmDiscovery(item: KnowledgeDiscoveryRead) {
    try {
      await api.post(`/api/enterprise/knowledge/discoveries/${item.id}/confirm?tenant_id=${TENANT_ID}`);
      message.success('已确认建议');
      await refresh();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '确认失败');
    }
  }

  async function rejectDiscovery(item: KnowledgeDiscoveryRead) {
    try {
      await api.post(`/api/enterprise/knowledge/discoveries/${item.id}/reject?tenant_id=${TENANT_ID}`);
      message.success('已拒绝建议');
      await refresh();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '拒绝失败');
    }
  }

  const documentColumns: ColumnsType<KnowledgeDocumentRead> = [
    {
      title: '知识',
      dataIndex: 'title',
      render: (_value, row) => (
        <button type="button" className="knowledge-doc-link" onClick={() => void loadBuckets(row)}>
          <span>{row.title || row.filename}</span>
          <small>{row.filename}</small>
        </button>
      ),
    },
    { title: '格式', dataIndex: 'file_type', width: 92, render: (value) => <Tag>{value}</Tag> },
    { title: '状态', dataIndex: 'status', width: 104, render: (value) => statusTag(value) },
    { title: '桶', dataIndex: 'bucket_count', width: 72 },
    { title: '片段', dataIndex: 'chunk_count', width: 72 },
    { title: '更新', dataIndex: 'updated_at', width: 120, render: (value) => String(value).slice(0, 10) },
  ];

  return (
    <div className="knowledge-page knowledge-manage-page">
      <div className="knowledge-hero">
        <div>
          <Typography.Title level={3}>知识管理</Typography.Title>
          <Typography.Text type="secondary">查看已入库文档、分桶切片结果，以及待确认的技能和工具发现。</Typography.Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => refresh()} loading={loading}>刷新</Button>
          <Button type="primary" icon={<FileAddOutlined />} onClick={() => navigate('/enterprise/knowledge/new')}>
            新增知识
          </Button>
        </Space>
      </div>

      <Row gutter={[18, 18]}>
        <Col xs={24}>
          <Card className="knowledge-card knowledge-card-solid" title="知识库">
            {knowledgeBases.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无知识库" />
            ) : (
              <div className="knowledge-base-grid">
                {knowledgeBases.map((item) => (
                  <div className="knowledge-base-card" key={item.id}>
                    <div>
                      <Typography.Text strong>{item.name}</Typography.Text>
                      <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }}>
                        {item.description || '未填写描述'}
                      </Typography.Paragraph>
                    </div>
                    <Space size={6} wrap>
                      {statusTag(item.status)}
                      {item.version && <Tag>v{item.version}</Tag>}
                      {item.branch_sync_state && <Tag color={item.branch_sync_state === 'diverged' ? 'gold' : 'green'}>
                        {item.branch_sync_state === 'diverged' ? '分支修改' : '已同步'}
                      </Tag>}
                      <Tag>{item.document_count} 文档</Tag>
                      <Tag>{item.bucket_count} 桶</Tag>
                      <Tag>{item.chunk_count} 片段</Tag>
                    </Space>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} xl={14}>
          <Card className="knowledge-card knowledge-card-solid" title="现有知识" extra={<DatabaseOutlined />}>
            <Table
              rowKey="id"
              columns={documentColumns}
              dataSource={documents}
              loading={loading}
              pagination={{ pageSize: 8 }}
              rowClassName={(row) => (row.id === selectedDocument?.id ? 'knowledge-row-selected' : '')}
            />
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card
            className="knowledge-card knowledge-card-solid"
            title={selectedDocument ? `知识桶 · ${selectedDocument.title || selectedDocument.filename}` : '知识桶'}
            extra={<FileSearchOutlined />}
          >
            {!selectedDocument ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择一个文档查看知识桶" />
            ) : buckets.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无分桶结果" />
            ) : (
              <div className="knowledge-bucket-list">
                {buckets.map((bucket) => (
                  <div className="knowledge-bucket-item" key={bucket.id}>
                    <div className="knowledge-bucket-title">
                      <span>{bucket.title}</span>
                      {bucketStatusTag(bucket)}
                    </div>
                    <Typography.Paragraph ellipsis={{ rows: 3 }}>{bucket.summary}</Typography.Paragraph>
                    <div className="knowledge-bucket-meta">
                      <Tag>{bucket.bucket_key}</Tag>
                      <Tag>{bucket.chunk_count} 片段</Tag>
                      <Tag>{bucket.token_estimate} tokens</Tag>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Card className="knowledge-card knowledge-card-solid" title="自发现建议">
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={13}>
            <DiscoveryColumn
              title="可确认建议"
              description="模型从知识中发现的技能和工具草案。确认后才会进入系统。"
              items={actionableDiscoveries}
              onConfirm={confirmDiscovery}
              onReject={rejectDiscovery}
            />
          </Col>
          <Col xs={24} lg={11}>
            <DiscoveryColumn
              title="信息与警告"
              description="不满足入库条件、已处理或需要人工补充的信息。"
              items={warningDiscoveries}
              onConfirm={confirmDiscovery}
              onReject={rejectDiscovery}
              readonly
            />
          </Col>
        </Row>
      </Card>
    </div>
  );
}

export function KnowledgeAddPage() {
  const navigate = useNavigate();
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseRead[]>([]);
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState('');
  const [newKnowledgeBaseName, setNewKnowledgeBaseName] = useState('');
  const [jobs, setJobs] = useState<Record<string, KnowledgeIngestJobRead>>({});
  const [agentId, setAgentId] = useState(() => window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '');
  const activeJobs = useMemo(
    () => Object.values(jobs).filter((job) => ['queued', 'running'].includes(job.status)),
    [jobs],
  );

  useEffect(() => {
    void refreshKnowledgeBases();
  }, [agentId]);

  useEffect(() => {
    const onScopeChange = (event: Event) => {
      setAgentId((event as CustomEvent<{ agentId?: string }>).detail?.agentId || window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '');
    };
    window.addEventListener('ultrarag-enterprise-agent-scope-change', onScopeChange);
    return () => window.removeEventListener('ultrarag-enterprise-agent-scope-change', onScopeChange);
  }, []);

  useEffect(() => {
    if (activeJobs.length === 0) return;
    const timer = window.setInterval(() => {
      activeJobs.forEach((job) => {
        void api
          .get<KnowledgeIngestJobRead>(`/api/enterprise/knowledge/jobs/${job.id}?tenant_id=${TENANT_ID}`)
          .then((next) => setJobs((prev) => ({ ...prev, [next.id]: next })))
          .catch(() => undefined);
      });
    }, 1400);
    return () => window.clearInterval(timer);
  }, [activeJobs]);

  async function refreshKnowledgeBases() {
    try {
      const suffix = agentId ? `&agent_id=${encodeURIComponent(agentId)}` : '';
      const rows = await api.get<KnowledgeBaseRead[]>(`/api/enterprise/knowledge-bases?tenant_id=${TENANT_ID}${suffix}`);
      setKnowledgeBases(rows);
      setSelectedKnowledgeBaseId((current) => current || rows.find((item) => item.status === 'active')?.id || rows[0]?.id || '');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载知识库失败');
    }
  }

  async function createKnowledgeBase() {
    const name = newKnowledgeBaseName.trim();
    if (!name) {
      message.warning('请先输入知识库名称');
      return;
    }
    try {
      const query = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : '';
      const row = await api.post<KnowledgeBaseRead>(`/api/enterprise/knowledge-bases${query}`, {
        tenant_id: TENANT_ID,
        name,
        description: '',
      });
      setKnowledgeBases((prev) => [row, ...prev]);
      setSelectedKnowledgeBaseId(row.id);
      setNewKnowledgeBaseName('');
      message.success('已创建知识库');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '创建知识库失败');
    }
  }

  async function uploadFile(file: File) {
    if (!selectedKnowledgeBaseId) {
      message.warning('请先选择或创建知识库');
      return;
    }
    try {
      const contentBase64 = await fileToBase64(file);
      const suffix = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : '';
      const job = await api.post<KnowledgeIngestJobRead>(`/api/enterprise/knowledge/documents${suffix}`, {
        tenant_id: TENANT_ID,
        knowledge_base_id: selectedKnowledgeBaseId,
        filename: file.name,
        title: file.name.replace(/\.[^.]+$/, ''),
        content_base64: contentBase64,
      });
      setJobs((prev) => ({ ...prev, [job.id]: job }));
      message.success('已创建知识入库任务');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '上传失败');
    }
  }

  return (
    <div className="knowledge-page knowledge-add-page">
      <div className="knowledge-hero">
        <div>
          <Typography.Title level={3}>新增知识</Typography.Title>
          <Typography.Text type="secondary">上传业务文档，后台会完成解析、分桶、切片和自发现建议生成。</Typography.Text>
        </div>
        <Button icon={<RightOutlined />} onClick={() => navigate('/enterprise/knowledge')}>查看知识管理</Button>
      </div>

      <Card className="knowledge-card knowledge-upload-card">
        <div className="knowledge-upload-controls">
          <div>
            <Typography.Text strong>归属知识库</Typography.Text>
            <Typography.Text type="secondary">每个上传文档、知识桶和切片都会归属到这里。</Typography.Text>
          </div>
          <Space wrap>
            <Select
              className="knowledge-base-select"
              placeholder="选择知识库"
              value={selectedKnowledgeBaseId || undefined}
              onChange={setSelectedKnowledgeBaseId}
              options={knowledgeBases.map((item) => ({ value: item.id, label: item.name }))}
            />
            <Input
              className="knowledge-base-create-input"
              placeholder="新建知识库名称"
              value={newKnowledgeBaseName}
              onChange={(event) => setNewKnowledgeBaseName(event.target.value)}
              onPressEnter={() => void createKnowledgeBase()}
            />
            <Button onClick={() => void createKnowledgeBase()}>新建知识库</Button>
          </Space>
        </div>
        <Dragger
          multiple
          showUploadList={false}
          beforeUpload={(file) => {
            void uploadFile(file);
            return false;
          }}
          accept=".doc,.docx,.txt,.md,.markdown,.html,.htm,.pdf"
        >
          <div className="knowledge-upload-inner">
            <InboxOutlined />
            <div>
              <strong>拖拽文档到这里，或点击选择文件</strong>
              <span>支持 doc/docx/txt/md/html/pdf；旧版 doc 会提示转换为 docx。</span>
            </div>
          </div>
        </Dragger>
      </Card>

      <Card className="knowledge-card knowledge-card-solid" title="入库任务">
        {Object.values(jobs).length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="上传后这里会显示解析和分桶进度" />
        ) : (
          <div className="knowledge-jobs">
            {Object.values(jobs).map((job) => (
              <div className="knowledge-job" key={job.id}>
                <div className="knowledge-job-head">
                  <div>
                    <Typography.Text strong>{job.filename}</Typography.Text>
                    <Typography.Text type="secondary"> · {job.stage}</Typography.Text>
                  </div>
                  {statusTag(job.status)}
                </div>
                <Progress percent={Math.round(job.progress * 100)} status={job.status === 'failed' ? 'exception' : undefined} />
                {job.error && <Typography.Text type="danger">{job.error}</Typography.Text>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function DiscoveryColumn({
  title,
  description,
  items,
  readonly = false,
  onConfirm,
  onReject,
}: {
  title: string;
  description: string;
  items: KnowledgeDiscoveryRead[];
  readonly?: boolean;
  onConfirm: (item: KnowledgeDiscoveryRead) => Promise<void>;
  onReject: (item: KnowledgeDiscoveryRead) => Promise<void>;
}) {
  return (
    <div className="knowledge-discovery-column">
      <div className="knowledge-section-heading">
        <div>
          <strong>{title}</strong>
          <span>{description}</span>
        </div>
        <Tag>{items.length}</Tag>
      </div>
      {items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无内容" />
      ) : (
        <Space direction="vertical" size={12} className="knowledge-discovery-list">
          {items.map((item) => (
            <div className={`knowledge-discovery ${item.suggestion_type}`} key={item.id}>
              <div className="knowledge-discovery-header">
                <Space size={8} wrap>
                  <Typography.Text strong>{item.title}</Typography.Text>
                  <Tag>{typeLabel(item.suggestion_type)}</Tag>
                  {statusTag(item.status)}
                </Space>
                {!readonly && item.status === 'pending' && (
                  <Space size={8}>
                    <Button size="small" shape="circle" icon={<CheckOutlined />} onClick={() => void onConfirm(item)} />
                    <Button size="small" shape="circle" icon={<CloseOutlined />} onClick={() => void onReject(item)} />
                  </Space>
                )}
              </div>
              {item.reason && <Typography.Paragraph type="secondary">{item.reason}</Typography.Paragraph>}
              <Collapse
                ghost
                items={[
                  {
                    key: 'payload',
                    label: '查看详情',
                    children: <pre className="knowledge-json">{JSON.stringify(item.payload, null, 2)}</pre>,
                  },
                ]}
              />
            </div>
          ))}
        </Space>
      )}
    </div>
  );
}

function statusTag(status: string) {
  const color = status === 'succeeded' || status === 'ready' || status === 'confirmed' ? 'green' : status === 'failed' ? 'red' : 'gold';
  return <Tag color={color}>{status}</Tag>;
}

function bucketStatusTag(bucket: KnowledgeBucketRead) {
  if (bucket.status === 'ready') return <Tag color="green">达标</Tag>;
  return <Tag color="gold">待补足</Tag>;
}

function typeLabel(type: string) {
  if (type === 'skill') return '技能';
  if (type === 'tool') return '工具';
  return '提示';
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',').pop() || '' : result);
    };
    reader.readAsDataURL(file);
  });
}
