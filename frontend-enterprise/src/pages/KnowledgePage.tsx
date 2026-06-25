import {
  AuditOutlined,
  CheckOutlined,
  CloseOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  DownloadOutlined,
  DownOutlined,
  EditOutlined,
  FileAddOutlined,
  FileMarkdownOutlined,
  HistoryOutlined,
  InboxOutlined,
  MoreOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  RightOutlined,
  SaveOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Button, Card, Col, Collapse, Dropdown, Empty, Input, Modal, Progress, Row, Select, Space, Table, Tag, Typography, Upload, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, TENANT_ID } from '../api/client';
import type {
  KnowledgeBaseRead,
  KnowledgeBucketRead,
  KnowledgeChunkRead,
  KnowledgeConceptRead,
  KnowledgeDiscoveryRead,
  KnowledgeDocumentRead,
  KnowledgeIngestJobRead,
  KnowledgeSearchResponse,
  AgentProfileRead,
} from '../types';

const { Dragger } = Upload;
const ENTERPRISE_AGENT_STORAGE_KEY = 'ultrarag_enterprise_agent_scope';

type KnowledgeBaseVersionRead = {
  id: string;
  version: string;
  name: string;
  description?: string;
  status: string;
  is_head: boolean;
  is_base: boolean;
  updated_at: string;
  created_at: string;
};

type IngestStepView = {
  key: string;
  label: string;
  progress: number;
  status: 'pending' | 'running' | 'done';
};

type OkfLintIssue = {
  issue_type?: string;
  title?: string;
  message?: string;
  concept_id?: string;
  concept_type?: string;
  document_id?: string;
};

const DEFAULT_INGEST_STEPS: IngestStepView[] = [
  { key: 'queued', label: '排队中', progress: 0, status: 'pending' },
  { key: 'parsing', label: '解析原始资料', progress: 0.08, status: 'pending' },
  { key: 'normalizing', label: '规范化原始资料', progress: 0.16, status: 'pending' },
  { key: 'documenting', label: '写入文档页', progress: 0.24, status: 'pending' },
  { key: 'bucketing', label: '规划知识图谱', progress: 0.36, status: 'pending' },
  { key: 'bucket_writing', label: '写入知识图谱', progress: 0.48, status: 'pending' },
  { key: 'chunking', label: '生成引用来源', progress: 0.62, status: 'pending' },
  { key: 'summarizing', label: '刷新 目录索引', progress: 0.74, status: 'pending' },
  { key: 'discovering', label: '发现 SOP/工具', progress: 0.88, status: 'pending' },
  { key: 'done', label: '完成入库', progress: 1, status: 'pending' },
];

export default function KnowledgeManagePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [documents, setDocuments] = useState<KnowledgeDocumentRead[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseRead[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<KnowledgeDocumentRead | null>(null);
  const [buckets, setBuckets] = useState<KnowledgeBucketRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [agentId, setAgentId] = useState(() => window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '');
  const [agents, setAgents] = useState<AgentProfileRead[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<'plaza' | 'employee'>('plaza');
  const [importSourceAgentId, setImportSourceAgentId] = useState('');
  const [importSourceKnowledgeBases, setImportSourceKnowledgeBases] = useState<KnowledgeBaseRead[]>([]);
  const [importSelectedKnowledgeBaseIds, setImportSelectedKnowledgeBaseIds] = useState<string[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [editingKnowledgeBase, setEditingKnowledgeBase] = useState<KnowledgeBaseRead | null>(null);
  const [knowledgeBaseDraft, setKnowledgeBaseDraft] = useState({ name: '', description: '', status: 'active' });
  const [versionKnowledgeBase, setVersionKnowledgeBase] = useState<KnowledgeBaseRead | null>(null);
  const [knowledgeBaseVersions, setKnowledgeBaseVersions] = useState<KnowledgeBaseVersionRead[]>([]);
  const [editingDocument, setEditingDocument] = useState<KnowledgeDocumentRead | null>(null);
  const [documentDraft, setDocumentDraft] = useState({ title: '', status: 'ready' });
  const [editingBucket, setEditingBucket] = useState<KnowledgeBucketRead | null>(null);
  const [bucketDraft, setBucketDraft] = useState({ title: '', summary: '' });
  const [bucketChunks, setBucketChunks] = useState<KnowledgeChunkRead[]>([]);
  const [chunkDrafts, setChunkDrafts] = useState<Record<string, { content: string; summary: string }>>({});
  const [contentSaving, setContentSaving] = useState(false);
  const [documentSearch, setDocumentSearch] = useState('');
  const [knowledgeBaseFilter, setKnowledgeBaseFilter] = useState('__all__');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<KnowledgeSearchResponse | null>(null);
  const [okfConcepts, setOkfConcepts] = useState<KnowledgeConceptRead[]>([]);
  const [okfLoading, setOkfLoading] = useState(false);
  const [okfImportOpen, setOkfImportOpen] = useState(false);
  const [okfImporting, setOkfImporting] = useState(false);
  const [okfLintIssues, setOkfLintIssues] = useState<OkfLintIssue[]>([]);
  const [okfLintReportOpen, setOkfLintReportOpen] = useState(false);
  const [okfLintKnowledgeBase, setOkfLintKnowledgeBase] = useState<KnowledgeBaseRead | null>(null);
  const [viewingConcept, setViewingConcept] = useState<KnowledgeConceptRead | null>(null);
  const [editingConcept, setEditingConcept] = useState<KnowledgeConceptRead | null>(null);
  const [conceptDraft, setConceptDraft] = useState('');
  const conceptEditorType = editingConcept
    ? okfFrontmatterValue(conceptDraft, 'type', editingConcept.concept_type || 'Topic')
    : 'Topic';
  const conceptEditorTitle = editingConcept
    ? okfFrontmatterValue(conceptDraft, 'title', editingConcept.title || editingConcept.concept_id)
    : '';
  const conceptEditorDescription = editingConcept
    ? okfFrontmatterValue(conceptDraft, 'description', editingConcept.description || '')
    : '';

  const currentAgent = useMemo(() => agents.find((item) => item.id === agentId), [agents, agentId]);
  const isOverallAgent = !currentAgent || currentAgent.is_overall;
  const visibleKnowledgeBases = useMemo(
    () => knowledgeBases.filter((item) => !isEmptyDefaultKnowledgeBase(item)),
    [knowledgeBases],
  );
  const selectedKnowledgeBase = useMemo(() => {
    if (selectedDocument) {
      return visibleKnowledgeBases.find((item) => item.id === selectedDocument.knowledge_base_id) || null;
    }
    if (knowledgeBaseFilter !== '__all__') {
      return visibleKnowledgeBases.find((item) => item.id === knowledgeBaseFilter) || null;
    }
    return visibleKnowledgeBases[0] || null;
  }, [knowledgeBaseFilter, selectedDocument, visibleKnowledgeBases]);
  const filteredKnowledgeBases = useMemo(() => {
    const query = documentSearch.trim().toLowerCase();
    if (!query) return visibleKnowledgeBases;
    return visibleKnowledgeBases.filter((item) => {
      const searchable = [
        item.name,
        item.description,
        item.status,
        item.version,
        item.branch_sync_state,
        item.document_count,
        item.bucket_count,
        item.chunk_count,
      ]
        .filter((value) => value !== undefined && value !== null)
        .join(' ')
        .toLowerCase();
      return searchable.includes(query);
    });
  }, [documentSearch, visibleKnowledgeBases]);
  useEffect(() => {
    void refresh();
  }, [agentId]);

  useEffect(() => {
    if (searchParams.get('add') !== 'plaza') return;
    if (agents.length === 0) return;
    const resourceId = searchParams.get('resourceId') || undefined;
    if (isOverallAgent) {
      message.warning('请先选择一个数字员工，再从广场复制知识库');
    } else {
      void openImportKnowledgeBases('plaza', resourceId);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('add');
    next.delete('resourceId');
    setSearchParams(next, { replace: true });
  }, [agents.length, isOverallAgent, searchParams, setSearchParams]);

  useEffect(() => {
    if (knowledgeBaseFilter !== '__all__' && !visibleKnowledgeBases.some((item) => item.id === knowledgeBaseFilter)) {
      setKnowledgeBaseFilter('__all__');
    }
  }, [visibleKnowledgeBases, knowledgeBaseFilter]);

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
      const [docRows, kbRows, agentRows] = await Promise.all([
        api.get<KnowledgeDocumentRead[]>(`/api/enterprise/knowledge/documents?tenant_id=${TENANT_ID}&include_all_versions=true${suffix}`),
        api.get<KnowledgeBaseRead[]>(`/api/enterprise/knowledge-bases?tenant_id=${TENANT_ID}${suffix}`),
        api.get<AgentProfileRead[]>(`/api/enterprise/agents?tenant_id=${TENANT_ID}`),
      ]);
      setDocuments(docRows);
      setKnowledgeBases(kbRows);
      setAgents(agentRows);
      const scopedDocRows =
        knowledgeBaseFilter === '__all__'
          ? docRows
          : docRows.filter((item) => item.knowledge_base_id === knowledgeBaseFilter);
      const current = selectedDocument
        ? scopedDocRows.find((item) => item.id === selectedDocument.id) || scopedDocRows[0] || null
        : scopedDocRows[0] || null;
      setSelectedDocument(current);
      if (current) {
        await loadBuckets(current, false);
      } else {
        setBuckets([]);
        const visibleKbRows = kbRows.filter((item) => !isEmptyDefaultKnowledgeBase(item));
        const fallbackKnowledgeBaseId =
          knowledgeBaseFilter !== '__all__' ? knowledgeBaseFilter : visibleKbRows[0]?.id || '';
        await loadOkfConcepts(fallbackKnowledgeBaseId, false);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '刷新知识库失败');
    } finally {
      setLoading(false);
    }
  }

  async function loadBuckets(document: KnowledgeDocumentRead, select = true) {
    if (select) setSelectedDocument(document);
    setSearchResult(null);
    try {
      const [rows] = await Promise.all([
        api.get<KnowledgeBucketRead[]>(`/api/enterprise/knowledge/documents/${document.id}/buckets?tenant_id=${TENANT_ID}`),
        loadOkfConcepts(document.knowledge_base_id, false),
      ]);
      setBuckets(rows);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载内部索引失败');
    }
  }

  async function loadOkfConcepts(knowledgeBaseId?: string, showLoading = true) {
    if (!knowledgeBaseId) {
      setOkfConcepts([]);
      setOkfLintIssues([]);
      return;
    }
    if (showLoading) setOkfLoading(true);
    const suffix = agentId ? `&agent_id=${encodeURIComponent(agentId)}` : '';
    try {
      const rows = await api.get<KnowledgeConceptRead[]>(
        `/api/enterprise/knowledge-bases/${knowledgeBaseId}/okf/concepts?tenant_id=${TENANT_ID}${suffix}`,
      );
      setOkfConcepts(rows);
      setOkfLintIssues([]);
    } catch (error) {
      setOkfConcepts([]);
      message.error(error instanceof Error ? error.message : '加载知识图谱失败');
    } finally {
      if (showLoading) setOkfLoading(false);
    }
  }

  function selectKnowledgeBase(knowledgeBaseId: string) {
    setKnowledgeBaseFilter(knowledgeBaseId);
    const nextDocument =
      knowledgeBaseId === '__all__'
        ? documents[0] || null
        : documents.find((item) => item.knowledge_base_id === knowledgeBaseId) || null;
    if (nextDocument) {
      void loadBuckets(nextDocument);
      return;
    }
    setSelectedDocument(null);
    setBuckets([]);
    setSearchResult(null);
    void loadOkfConcepts(knowledgeBaseId === '__all__' ? undefined : knowledgeBaseId);
  }

  async function runKnowledgeSearch() {
    const query = searchQuery.trim();
    if (!query) {
      message.warning('请输入要调试的知识问题');
      return;
    }
    setSearchLoading(true);
    try {
      const response = await api.post<KnowledgeSearchResponse>('/api/enterprise/knowledge/search', {
        tenant_id: TENANT_ID,
        agent_id: agentId || undefined,
        knowledge_base_ids:
          knowledgeBaseFilter !== '__all__'
            ? [knowledgeBaseFilter]
            : selectedDocument?.knowledge_base_id
              ? [selectedDocument.knowledge_base_id]
              : undefined,
        query,
        mode: 'debug',
        max_depth: 3,
        need_evidence_pack: true,
      });
      setSearchResult(response);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '知识检索失败');
    } finally {
      setSearchLoading(false);
    }
  }

  async function openImportKnowledgeBases(mode: 'plaza' | 'employee' = 'plaza', selectedResourceId?: string) {
    try {
      const agentRows = agents.length ? agents : await api.get<AgentProfileRead[]>(`/api/enterprise/agents?tenant_id=${TENANT_ID}`);
      setAgents(agentRows);
      setImportMode(mode);
      const candidates = agentRows.filter((item) => (
        item.id !== agentId && (mode === 'plaza' ? item.is_overall : !item.is_overall)
      ));
      const firstSource = candidates[0]?.id || '';
      setImportSourceAgentId(firstSource);
      setImportSelectedKnowledgeBaseIds([]);
      setImportOpen(true);
      if (firstSource) {
        const sourceRows = await loadImportSourceKnowledgeBases(firstSource);
        if (selectedResourceId && sourceRows.some((item) => item.id === selectedResourceId)) {
          setImportSelectedKnowledgeBaseIds([selectedResourceId]);
        }
      } else {
        setImportSourceKnowledgeBases([]);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载员工失败');
    }
  }

  async function loadImportSourceKnowledgeBases(sourceAgentId: string): Promise<KnowledgeBaseRead[]> {
    setImportSourceKnowledgeBases([]);
    setImportSelectedKnowledgeBaseIds([]);
    if (!sourceAgentId) return [];
    try {
      const rows = await api.get<KnowledgeBaseRead[]>(
        `/api/enterprise/knowledge-bases?tenant_id=${TENANT_ID}&agent_id=${encodeURIComponent(sourceAgentId)}`,
      );
      const activeRows = rows.filter((item) => item.status === 'active');
      setImportSourceKnowledgeBases(activeRows);
      return activeRows;
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载来源知识库失败');
      return [];
    }
  }

  async function submitImportKnowledgeBases() {
    if (!agentId) {
      message.warning('请先选择一个数字员工');
      return;
    }
    if (!importSourceAgentId) {
      message.warning(importMode === 'plaza' ? '请选择知识库广场' : '请选择来源员工');
      return;
    }
    if (importSelectedKnowledgeBaseIds.length === 0) {
      message.warning('请选择要复制的知识库');
      return;
    }
    setImportLoading(true);
    try {
      const result = await api.post<{ imported: Array<Record<string, unknown>>; missing: Array<Record<string, unknown>> }>(
        `/api/enterprise/agents/${agentId}/resources/import`,
        {
          tenant_id: TENANT_ID,
          source_agent_id: importSourceAgentId,
          resource_type: 'knowledge_base',
          resource_ids: importSelectedKnowledgeBaseIds,
        },
      );
      const importedCount = result.imported?.length || 0;
      const missingCount = result.missing?.length || 0;
      message.success(`已复制 ${importedCount} 个知识库${missingCount ? `，${missingCount} 个未复制` : ''}`);
      setImportOpen(false);
      await refresh();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '复制知识库失败');
    } finally {
      setImportLoading(false);
    }
  }

  function handleCreateAction(key: string) {
    if (key === 'blank') {
      navigate('/enterprise/knowledge/new');
      return;
    }
    if (key === 'okf') {
      setOkfImportOpen(true);
      return;
    }
    if (key === 'plaza') {
      void openImportKnowledgeBases('plaza');
      return;
    }
    if (key === 'employee') {
      void openImportKnowledgeBases('employee');
    }
  }

  async function importOkfFile(file: File) {
    setOkfImporting(true);
    try {
      const contentBase64 = await fileToBase64(file);
      await api.post('/api/enterprise/knowledge/okf/import', {
        tenant_id: TENANT_ID,
        agent_id: agentId || undefined,
        knowledge_base_id: selectedKnowledgeBase?.id,
        filename: file.name,
        content_base64: contentBase64,
      });
      message.success('已导入知识库备份包');
      setOkfImportOpen(false);
      await refresh();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导入知识库备份包失败');
    } finally {
      setOkfImporting(false);
    }
  }

  async function exportOkfBundle(targetKnowledgeBase = selectedKnowledgeBase) {
    if (!targetKnowledgeBase) {
      message.warning('请先选择知识库');
      return;
    }
    const suffix = agentId ? `&agent_id=${encodeURIComponent(agentId)}` : '';
    try {
      const blob = await api.blob(
        `/api/enterprise/knowledge-bases/${targetKnowledgeBase.id}/okf/export?tenant_id=${TENANT_ID}${suffix}`,
      );
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${targetKnowledgeBase.name || targetKnowledgeBase.id}-okf.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      message.success('已导出知识库备份包');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导出知识库备份包失败');
    }
  }

  async function lintOkfBundle(targetKnowledgeBase = selectedKnowledgeBase) {
    if (!targetKnowledgeBase) {
      message.warning('请先选择知识库');
      return;
    }
    if (targetKnowledgeBase.id !== selectedKnowledgeBase?.id) {
      selectKnowledgeBase(targetKnowledgeBase.id);
    }
    const suffix = agentId ? `&agent_id=${encodeURIComponent(agentId)}` : '';
    setOkfLoading(true);
    try {
      const result = await api.post<{ status: string; issue_count: number; issues: OkfLintIssue[] }>(
        `/api/enterprise/knowledge-bases/${targetKnowledgeBase.id}/okf/lint?tenant_id=${TENANT_ID}${suffix}`,
      );
      setOkfLintIssues(result.issues || []);
      setOkfLintKnowledgeBase(targetKnowledgeBase);
      setOkfLintReportOpen(true);
      message.success(result.issue_count ? `发现 ${result.issue_count} 个待处理建议` : '知识图谱检查通过');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '知识图谱检查失败');
    } finally {
      setOkfLoading(false);
    }
  }

  function openConceptEditor(row: KnowledgeConceptRead) {
    setEditingConcept(row);
    setConceptDraft(row.content_md || '');
  }

  function openConceptViewer(row: KnowledgeConceptRead) {
    setViewingConcept(row);
  }

  function editViewingConcept() {
    if (!viewingConcept) return;
    const concept = viewingConcept;
    setViewingConcept(null);
    openConceptEditor(concept);
  }

  async function saveConcept() {
    if (!editingConcept || !selectedKnowledgeBase) return;
    const suffix = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : '';
    try {
      const next = await api.put<KnowledgeConceptRead>(
        `/api/enterprise/knowledge-bases/${selectedKnowledgeBase.id}/okf/concepts/${conceptPath(editingConcept.concept_id)}${suffix}`,
        {
          tenant_id: TENANT_ID,
          document_id: editingConcept.document_id,
          content_md: conceptDraft,
          status: editingConcept.status,
        },
      );
      setOkfConcepts((current) => current.map((item) => (item.id === next.id ? next : item)));
      setEditingConcept(null);
      message.success('已保存知识图谱');
      await loadOkfConcepts(selectedKnowledgeBase.id, false);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存知识图谱失败');
    }
  }

  function openEditKnowledgeBase(row: KnowledgeBaseRead) {
    setEditingKnowledgeBase(row);
    setKnowledgeBaseDraft({
      name: row.name,
      description: row.description || '',
      status: row.status === 'archived' ? 'archived' : 'active',
    });
  }

  async function saveKnowledgeBase() {
    if (!editingKnowledgeBase) return;
    const suffix = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : '';
    try {
      const next = await api.put<KnowledgeBaseRead>(`/api/enterprise/knowledge-bases/${editingKnowledgeBase.id}${suffix}`, {
        tenant_id: TENANT_ID,
        name: knowledgeBaseDraft.name,
        description: knowledgeBaseDraft.description,
        status: knowledgeBaseDraft.status,
      });
      setKnowledgeBases((current) => current.map((item) => (item.id === next.id ? next : item)));
      setEditingKnowledgeBase(null);
      message.success('已保存知识库');
      await refresh();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存知识库失败');
    }
  }

  async function setKnowledgeBaseStatus(row: KnowledgeBaseRead, active: boolean) {
    const suffix = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : '';
    try {
      const next = await api.put<KnowledgeBaseRead>(`/api/enterprise/knowledge-bases/${row.id}${suffix}`, {
        tenant_id: TENANT_ID,
        status: active ? 'active' : 'archived',
      });
      setKnowledgeBases((current) => current.map((item) => (item.id === next.id ? next : item)));
      message.success(active ? '已上线知识库' : '已下线知识库');
      await refresh();
    } catch (error) {
      message.error(error instanceof Error ? error.message : active ? '上线失败' : '下线失败');
    }
  }

  function deleteKnowledgeBase(row: KnowledgeBaseRead) {
    const branchMode = !isOverallAgent;
    Modal.confirm({
      title: branchMode ? `移除知识库：${row.name}` : `删除知识库：${row.name}`,
      content: branchMode
        ? '这只会在当前数字员工中隐藏该知识库；开放广场和其他数字员工仍然保留。'
        : '开放广场会永久删除该知识库及其文档、内部索引、引用来源和版本记录。',
      okText: branchMode ? '移除' : '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      async onOk() {
        const suffix = agentId ? `&agent_id=${encodeURIComponent(agentId)}` : '';
        try {
          await api.delete(`/api/enterprise/knowledge-bases/${row.id}?tenant_id=${TENANT_ID}${suffix}`);
          message.success(branchMode ? '已移除知识库' : '已删除知识库');
          await refresh();
        } catch (error) {
          message.error(error instanceof Error ? error.message : '删除失败');
        }
      },
    });
  }

  async function openKnowledgeBaseVersions(row: KnowledgeBaseRead) {
    const suffix = agentId ? `&agent_id=${encodeURIComponent(agentId)}` : '';
    try {
      const versions = await api.get<KnowledgeBaseVersionRead[]>(
        `/api/enterprise/knowledge-bases/${row.id}/versions?tenant_id=${TENANT_ID}${suffix}`,
      );
      setVersionKnowledgeBase(row);
      setKnowledgeBaseVersions(versions);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载版本失败');
    }
  }

  async function syncKnowledgeBaseFromOverall(row: KnowledgeBaseRead) {
    if (!agentId) {
      message.warning('请先选择员工');
      return;
    }
    try {
      await api.post(`/api/enterprise/knowledge-bases/${row.id}/sync-from-overall?tenant_id=${TENANT_ID}&agent_id=${encodeURIComponent(agentId)}`);
      message.success('已从广场同步');
      await refresh();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '同步失败');
    }
  }

  async function promoteKnowledgeBaseToOverall(row: KnowledgeBaseRead) {
    if (!agentId) {
      message.warning('请先选择员工');
      return;
    }
    try {
      await api.post(`/api/enterprise/knowledge-bases/${row.id}/promote-to-overall?tenant_id=${TENANT_ID}&agent_id=${encodeURIComponent(agentId)}`);
      message.success('已发布到广场');
      await refresh();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '推送失败');
    }
  }

  async function rollbackKnowledgeBaseVersion(version: KnowledgeBaseVersionRead) {
    if (!versionKnowledgeBase || !agentId) return;
    try {
      await api.post(`/api/enterprise/knowledge-bases/${versionKnowledgeBase.id}/rollback`, {
        tenant_id: TENANT_ID,
        agent_id: agentId,
        version: version.version,
      });
      message.success(`已回滚到 ${version.version}`);
      await openKnowledgeBaseVersions(versionKnowledgeBase);
      await refresh();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '回滚失败');
    }
  }

  function openEditDocument(row: KnowledgeDocumentRead) {
    setEditingDocument(row);
    setDocumentDraft({
      title: row.title || row.filename,
      status: row.status,
    });
  }

  async function saveDocument() {
    if (!editingDocument) return;
    try {
      const next = await api.put<KnowledgeDocumentRead>(`/api/enterprise/knowledge/documents/${editingDocument.id}`, {
        tenant_id: TENANT_ID,
        title: documentDraft.title,
        status: documentDraft.status,
      });
      setDocuments((current) => current.map((item) => (item.id === next.id ? next : item)));
      setSelectedDocument((current) => (current?.id === next.id ? next : current));
      setEditingDocument(null);
      message.success('已保存文档');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存文档失败');
    }
  }

  async function openBucketEditor(row: KnowledgeBucketRead) {
    setEditingBucket(row);
    setBucketDraft({ title: row.title, summary: row.summary });
    try {
      const chunks = await api.get<KnowledgeChunkRead[]>(`/api/enterprise/knowledge/buckets/${row.id}/chunks?tenant_id=${TENANT_ID}`);
      setBucketChunks(chunks);
      setChunkDrafts(
        Object.fromEntries(chunks.map((chunk) => [chunk.id, { content: chunk.content, summary: chunk.summary || '' }])),
      );
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载引用来源失败');
    }
  }

  async function saveBucketAndChunks() {
    if (!editingBucket) return;
    setContentSaving(true);
    try {
      await api.put<KnowledgeBucketRead>(`/api/enterprise/knowledge/buckets/${editingBucket.id}`, {
        tenant_id: TENANT_ID,
        title: bucketDraft.title,
        summary: bucketDraft.summary,
      });
      await Promise.all(
        bucketChunks.map((chunk) =>
          api.put<KnowledgeChunkRead>(`/api/enterprise/knowledge/chunks/${chunk.id}`, {
            tenant_id: TENANT_ID,
            content: chunkDrafts[chunk.id]?.content ?? chunk.content,
            summary: chunkDrafts[chunk.id]?.summary ?? chunk.summary,
          }),
        ),
      );
      message.success('已保存知识内容');
      setEditingBucket(null);
      if (selectedDocument) await loadBuckets(selectedDocument, false);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存知识内容失败');
    } finally {
      setContentSaving(false);
    }
  }

  return (
    <div className="knowledge-page knowledge-manage-page">
      <div className="knowledge-hero">
        <div>
          <Typography.Title level={3}>{isOverallAgent ? '知识库广场' : '知识库'}</Typography.Title>
        </div>
        <Space className="page-actions">
          <Button icon={<ReloadOutlined />} onClick={() => refresh()} loading={loading}>刷新</Button>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'blank', icon: <FileAddOutlined />, label: '新建知识库' },
                { key: 'okf', icon: <FileMarkdownOutlined />, label: '导入知识库备份包' },
                ...(!isOverallAgent ? [{ key: 'plaza', icon: <DownloadOutlined />, label: '从广场复制' }] : []),
                ...(!isOverallAgent ? [{ key: 'employee', icon: <TeamOutlined />, label: '从数字员工复制' }] : []),
              ],
              onClick: ({ key }) => handleCreateAction(key),
            }}
          >
            <Button type="primary" className="create-dropdown-button">
              新增 <DownOutlined />
            </Button>
          </Dropdown>
        </Space>
      </div>

      <Row className="knowledge-structure-row" gutter={[18, 18]} align="stretch">
        <Col xs={24} xl={8}>
          <Card
            className="knowledge-card knowledge-card-solid knowledge-library-card"
            title="知识库"
            extra={<DatabaseOutlined />}
          >
            <div className="knowledge-management-toolbar">
              <Input.Search
                allowClear
                value={documentSearch}
                onChange={(event) => setDocumentSearch(event.target.value)}
                placeholder="搜索知识库、状态或版本"
              />
            </div>
            {visibleKnowledgeBases.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无知识库" />
            ) : filteredKnowledgeBases.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的知识库" />
            ) : (
              <div className="knowledge-base-grid">
                {filteredKnowledgeBases.map((item) => (
                  <div
                    className={`knowledge-base-card ${item.id === selectedKnowledgeBase?.id ? 'is-active' : ''}`}
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectKnowledgeBase(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectKnowledgeBase(item.id);
                      }
                    }}
                  >
                    <div className="knowledge-base-card-head">
                      <div>
                        <Typography.Text strong>{item.name}</Typography.Text>
                        <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }}>
                          {item.description || '未填写描述'}
                        </Typography.Paragraph>
                      </div>
                      <span
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <Dropdown
                          trigger={['click']}
                          menu={{
                            items: [
                              { key: 'edit', icon: <EditOutlined />, label: '详情' },
                              { key: 'versions', icon: <HistoryOutlined />, label: '版本管理' },
                              { key: 'okf-export', icon: <DownloadOutlined />, label: '导出知识库备份包' },
                              { key: 'okf-lint', icon: <AuditOutlined />, label: '知识图谱检查', disabled: okfLoading },
                              !isOverallAgent ? { key: 'sync', label: '从广场同步' } : null,
                              !isOverallAgent ? { key: 'promote', label: '发布到广场' } : null,
                              item.status === 'archived'
                                ? { key: 'publish', icon: <PlayCircleOutlined />, label: '上线' }
                                : { key: 'archive', icon: <PauseCircleOutlined />, label: '下线' },
                              {
                                key: 'delete',
                                icon: <DeleteOutlined />,
                                label: isOverallAgent ? '删除' : '移除',
                                danger: true,
                              },
                            ].filter(Boolean),
                            onClick: ({ key }) => {
                              if (key === 'edit') openEditKnowledgeBase(item);
                              if (key === 'versions') void openKnowledgeBaseVersions(item);
                              if (key === 'okf-export') void exportOkfBundle(item);
                              if (key === 'okf-lint') void lintOkfBundle(item);
                              if (key === 'sync') void syncKnowledgeBaseFromOverall(item);
                              if (key === 'promote') void promoteKnowledgeBaseToOverall(item);
                              if (key === 'publish') void setKnowledgeBaseStatus(item, true);
                              if (key === 'archive') void setKnowledgeBaseStatus(item, false);
                              if (key === 'delete') deleteKnowledgeBase(item);
                            },
                          }}
                        >
                          <Button type="text" size="small" icon={<MoreOutlined />} />
                        </Dropdown>
                      </span>
                    </div>
                    <Space size={6} wrap>
                      {statusTag(item.status)}
                      {item.version && <Tag>v{item.version}</Tag>}
                      {item.branch_sync_state && <Tag color={item.branch_sync_state === 'diverged' ? 'gold' : 'green'}>
              {item.branch_sync_state === 'diverged' ? '本地修改' : '已同步'}
                      </Tag>}
                      <Tag>{item.document_count} 文档</Tag>
                      <Tag>{item.bucket_count} 目录</Tag>
                      <Tag>{item.chunk_count} 引用</Tag>
                    </Space>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} xl={16}>
          <div className="knowledge-structure-card-frame">
            <Card className="knowledge-card knowledge-card-solid knowledge-structure-card" title="知识图谱">
              {!selectedDocument ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择知识库后查看文档卡片、知识索引和知识图谱" />
              ) : (
                <目录索引Overview
                  document={selectedDocument}
                  knowledgeBase={selectedKnowledgeBase}
                  buckets={buckets}
                  okfConcepts={okfConcepts}
                  onEditDocument={openEditDocument}
                  onViewConcept={openConceptViewer}
                  onEditConcept={openConceptEditor}
                />
              )}
            </Card>
          </div>
        </Col>
      </Row>

      <Card className="knowledge-card knowledge-card-solid knowledge-card-compact" title="渐进检索调试">
        <Space className="knowledge-debug-stack" direction="vertical" size={14} style={{ width: '100%' }}>
          <Input.Search
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onSearch={() => void runKnowledgeSearch()}
            loading={searchLoading}
            placeholder="输入知识问题"
            enterButton="检索"
          />
          <KnowledgeSearchDebug result={searchResult} loading={searchLoading} />
        </Space>
      </Card>

      <Modal
        open={importOpen}
        title={importMode === 'plaza' ? '从广场复制知识库' : '从数字员工复制知识库'}
        width={720}
        okText="复制"
        cancelText="取消"
        confirmLoading={importLoading}
        onOk={() => void submitImportKnowledgeBases()}
        onCancel={() => setImportOpen(false)}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Select
            value={importSourceAgentId || undefined}
            placeholder={importMode === 'plaza' ? '选择知识库广场' : '选择来源员工'}
            onChange={(value) => {
              setImportSourceAgentId(value);
              void loadImportSourceKnowledgeBases(value);
            }}
            options={agents
              .filter((item) => item.id !== agentId && (importMode === 'plaza' ? item.is_overall : !item.is_overall))
              .map((item) => ({
                value: item.id,
                label: item.is_overall ? '知识库广场' : item.name,
              }))}
            style={{ width: '100%' }}
          />
          <Select
            mode="multiple"
            value={importSelectedKnowledgeBaseIds}
            placeholder="选择一个或多个知识库"
            onChange={setImportSelectedKnowledgeBaseIds}
            options={importSourceKnowledgeBases.map((item) => ({
              value: item.id,
              label: `${item.name} · ${item.version || '1.0.0'}`,
            }))}
            optionFilterProp="label"
            notFoundContent={importSourceAgentId ? '没有可复制的知识库' : '请先选择复制来源'}
            style={{ width: '100%' }}
          />
          <Typography.Text type="secondary">
            {importMode === 'plaza'
              ? '从知识库广场复制可用知识库；不可复制内容不会出现在列表。'
              : '从数字员工复制可用知识库；不可见内容不会出现在列表。'}
          </Typography.Text>
        </Space>
      </Modal>
      <Modal
        open={okfImportOpen}
        title="导入知识库备份包"
        footer={null}
        onCancel={() => setOkfImportOpen(false)}
      >
        <Dragger
          accept=".zip,.md,.markdown"
          multiple={false}
          showUploadList={false}
          disabled={okfImporting}
          beforeUpload={(file) => {
            void importOkfFile(file);
            return false;
          }}
        >
          <p className="ant-upload-drag-icon">
            <FileMarkdownOutlined />
          </p>
          <p className="ant-upload-text">选择或拖入知识库备份包（.zip）</p>
          <p className="ant-upload-hint">导入后会生成知识图谱、知识索引和引用来源。</p>
        </Dragger>
      </Modal>
      <Modal
        open={okfLintReportOpen}
        title={okfLintKnowledgeBase ? `知识图谱检查：${okfLintKnowledgeBase.name}` : '知识图谱检查'}
        footer={<Button onClick={() => setOkfLintReportOpen(false)}>关闭</Button>}
        width={820}
        onCancel={() => setOkfLintReportOpen(false)}
      >
        <div className="knowledge-lint-report">
          <Typography.Paragraph type="secondary">
            用于检查当前知识库的知识图谱结构，发现断链、孤立页、重复主题等问题。检查结果仅作参考，不会自动修改数据。
          </Typography.Paragraph>
          {okfLintIssues.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="知识图谱检查通过" />
          ) : (
            <div className="knowledge-lint-grid">
              {okfLintIssues.map((issue, index) => (
                <div className="knowledge-lint-item" key={`${issue.issue_type || 'issue'}-${issue.concept_id || index}`}>
                  <Tag color="gold">{issue.issue_type || 'warning'}</Tag>
                  <strong>{issue.title || issue.concept_id || '知识图谱检查'}</strong>
                  <span>{issue.message || '待处理'}</span>
                  {issue.concept_id ? <small>{issue.concept_id}</small> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
      <Modal
        open={Boolean(viewingConcept)}
        title={viewingConcept ? <WikiViewerTitle concept={viewingConcept} /> : '知识图谱'}
        footer={
          <Space>
            <Button onClick={() => setViewingConcept(null)}>关闭</Button>
            <Button type="primary" icon={<EditOutlined />} onClick={editViewingConcept}>
              编辑知识图谱
            </Button>
          </Space>
        }
        width="min(1040px, calc(100vw - 48px))"
        className="okf-viewer-modal"
        onCancel={() => setViewingConcept(null)}
      >
        {viewingConcept && <WikiConceptViewer concept={viewingConcept} />}
      </Modal>
      <Modal
        open={Boolean(editingConcept)}
        title={
          editingConcept ? (
            <div className="okf-editor-modal-title">
              <span>编辑知识图谱</span>
              <strong>{conceptEditorTitle || editingConcept.concept_id}</strong>
            </div>
          ) : (
            '编辑知识图谱'
          )
        }
        width="min(1120px, calc(100vw - 48px))"
        className="okf-editor-modal"
        okText="保存"
        cancelText="取消"
        onOk={() => void saveConcept()}
        onCancel={() => setEditingConcept(null)}
      >
        {editingConcept && (
          <div className="okf-editor-shell">
            <aside className="okf-editor-meta">
              <div className="okf-editor-type-mark">
                <FileMarkdownOutlined />
                <span>{conceptTypeLabel(conceptEditorType)}</span>
              </div>
              <div className="okf-editor-meta-list">
                <span>页面路径</span>
                <strong>{editingConcept.concept_id}</strong>
                <span>链接</span>
                <strong>{editingConcept.links.length} 个</strong>
                <span>引用</span>
                <strong>{editingConcept.citations.length} 个</strong>
                <span>更新时间</span>
                <strong>{formatDateTime(editingConcept.updated_at)}</strong>
              </div>
              <div className="okf-editor-note">
                知识图谱以结构化文本保存，标题和摘要会同步写入内容。
              </div>
            </aside>
            <section className="okf-editor-main">
              <div className="okf-editor-fields">
                <label>
                  <span>页面标题</span>
                  <Input
                    value={conceptEditorTitle}
                    onChange={(event) =>
                      setConceptDraft((prev) => updateOkfFrontmatterValue(prev, 'title', event.target.value))
                    }
                    placeholder="知识图谱标题"
                  />
                </label>
                <label>
                  <span>页面类型</span>
                  <Select
                    value={conceptEditorType}
                    onChange={(value) => setConceptDraft((prev) => updateOkfFrontmatterValue(prev, 'type', value))}
                    options={Array.from(CONCEPT_TYPE_LABELS.entries()).map(([value, label]) => ({ value, label }))}
                  />
                </label>
                <label className="okf-editor-field-wide">
                  <span>页面摘要</span>
                  <Input.TextArea
                    value={conceptEditorDescription}
                    rows={3}
                    onChange={(event) =>
                      setConceptDraft((prev) => updateOkfFrontmatterValue(prev, 'description', event.target.value))
                    }
                    placeholder="说明这个知识图谱沉淀了什么知识"
                  />
                </label>
              </div>
              <label className="okf-editor-source">
                <span>知识图谱源码</span>
                <Input.TextArea
                  className="okf-markdown-editor"
                  value={conceptDraft}
                  rows={18}
                  onChange={(event) => setConceptDraft(event.target.value)}
                  spellCheck={false}
                />
              </label>
            </section>
          </div>
        )}
      </Modal>
      <Modal
        open={Boolean(editingKnowledgeBase)}
        title="知识库详情"
        okText="保存"
        cancelText="取消"
        onOk={() => void saveKnowledgeBase()}
        onCancel={() => setEditingKnowledgeBase(null)}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Input
            value={knowledgeBaseDraft.name}
            onChange={(event) => setKnowledgeBaseDraft((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="知识库名称"
          />
          <Input.TextArea
            rows={4}
            value={knowledgeBaseDraft.description}
            onChange={(event) => setKnowledgeBaseDraft((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="知识库描述"
          />
          <Select
            value={knowledgeBaseDraft.status}
            onChange={(value) => setKnowledgeBaseDraft((prev) => ({ ...prev, status: value }))}
            options={[
              { value: 'active', label: '上线' },
              { value: 'archived', label: '下线' },
            ]}
          />
        </Space>
      </Modal>
      <Modal
        open={Boolean(versionKnowledgeBase)}
        title={versionKnowledgeBase ? `版本管理：${versionKnowledgeBase.name}` : '版本管理'}
        width={840}
        footer={<Button onClick={() => setVersionKnowledgeBase(null)}>关闭</Button>}
        onCancel={() => setVersionKnowledgeBase(null)}
      >
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={knowledgeBaseVersions}
          columns={[
            { title: '版本', dataIndex: 'version' },
            { title: '名称', dataIndex: 'name' },
            { title: '状态', dataIndex: 'status', render: (value) => statusTag(String(value)) },
            { title: 'Head', dataIndex: 'is_head', render: (value) => (value ? <Tag color="green">当前</Tag> : null) },
            { title: '更新时间', dataIndex: 'updated_at', render: (value) => String(value).slice(0, 10) },
            {
              title: '操作',
              width: 96,
              render: (_value, row) =>
                !isOverallAgent && !row.is_head ? (
                  <Button size="small" onClick={() => void rollbackKnowledgeBaseVersion(row)}>
                    回滚
                  </Button>
                ) : null,
            },
          ]}
        />
      </Modal>
      <Modal
        open={Boolean(editingDocument)}
        title="编辑文档"
        okText="保存"
        cancelText="取消"
        onOk={() => void saveDocument()}
        onCancel={() => setEditingDocument(null)}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Input
            value={documentDraft.title}
            onChange={(event) => setDocumentDraft((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="文档标题"
          />
          <Select
            value={documentDraft.status}
            onChange={(value) => setDocumentDraft((prev) => ({ ...prev, status: value }))}
            options={[
              { value: 'ready', label: '可用' },
              { value: 'processing', label: '处理中' },
              { value: 'failed', label: '失败' },
              { value: 'archived', label: '下线' },
            ]}
          />
        </Space>
      </Modal>
      <Modal
        className="knowledge-editor-modal"
        open={Boolean(editingBucket)}
        title="编辑内部索引与引用来源"
        width={920}
        okText="保存"
        cancelText="取消"
        confirmLoading={contentSaving}
        onOk={() => void saveBucketAndChunks()}
        onCancel={() => setEditingBucket(null)}
      >
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <Input
            value={bucketDraft.title}
            onChange={(event) => setBucketDraft((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="内部索引标题"
          />
          <Input.TextArea
            rows={4}
            value={bucketDraft.summary}
            onChange={(event) => setBucketDraft((prev) => ({ ...prev, summary: event.target.value }))}
            placeholder="内部索引摘要"
          />
          <div className="knowledge-chunk-editor-list">
            {bucketChunks.map((chunk) => (
              <div className="knowledge-chunk-editor" key={chunk.id}>
                <div className="knowledge-chunk-editor-head">
                  <Typography.Text strong>引用来源 {chunk.chunk_index + 1}</Typography.Text>
                  <Tag>{chunk.source_ref || 'chunk'}</Tag>
                </div>
                <Input.TextArea
                  rows={2}
                  value={chunkDrafts[chunk.id]?.summary || ''}
                  onChange={(event) =>
                    setChunkDrafts((prev) => ({
                      ...prev,
                      [chunk.id]: { ...(prev[chunk.id] || { content: chunk.content, summary: '' }), summary: event.target.value },
                    }))
                  }
                  placeholder="引用来源摘要"
                />
                <Input.TextArea
                  rows={6}
                  value={chunkDrafts[chunk.id]?.content || ''}
                  onChange={(event) =>
                    setChunkDrafts((prev) => ({
                      ...prev,
                      [chunk.id]: { ...(prev[chunk.id] || { content: '', summary: chunk.summary || '' }), content: event.target.value },
                    }))
                  }
                  placeholder="引用来源内容"
                />
              </div>
            ))}
          </div>
        </Space>
      </Modal>
    </div>
  );
}

export function KnowledgeAddPage() {
  const navigate = useNavigate();
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseRead[]>([]);
  const [jobs, setJobs] = useState<Record<string, KnowledgeIngestJobRead>>({});
  const [agentId, setAgentId] = useState(() => window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '');
  const [checkedDiscoveryJobIds, setCheckedDiscoveryJobIds] = useState<string[]>([]);
  const [pendingDiscoveries, setPendingDiscoveries] = useState<KnowledgeDiscoveryRead[]>([]);
  const [discoveryModalOpen, setDiscoveryModalOpen] = useState(false);
  const activeJobs = useMemo(
    () => Object.values(jobs).filter((job) => ['queued', 'running'].includes(job.status)),
    [jobs],
  );
  const visibleKnowledgeBases = useMemo(
    () => knowledgeBases.filter((item) => !isEmptyDefaultKnowledgeBase(item)),
    [knowledgeBases],
  );

  useEffect(() => {
    void refreshKnowledgeBases();
    void loadRecentJobs();
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

  useEffect(() => {
    Object.values(jobs)
      .filter((job) => job.status === 'completed' && !checkedDiscoveryJobIds.includes(job.id))
      .forEach((job) => {
        void loadDiscoveriesForJob(job);
      });
  }, [jobs, checkedDiscoveryJobIds, agentId]);

  async function refreshKnowledgeBases() {
    try {
      const suffix = agentId ? `&agent_id=${encodeURIComponent(agentId)}` : '';
      const rows = await api.get<KnowledgeBaseRead[]>(`/api/enterprise/knowledge-bases?tenant_id=${TENANT_ID}${suffix}`);
      setKnowledgeBases(rows);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载知识库失败');
    }
  }

  async function loadRecentJobs() {
    try {
      const suffix = agentId ? `&agent_id=${encodeURIComponent(agentId)}` : '';
      const rows = await api.get<KnowledgeIngestJobRead[]>(
        `/api/enterprise/knowledge/jobs?tenant_id=${TENANT_ID}${suffix}&limit=8`,
      );
      setJobs(Object.fromEntries(rows.map((job) => [job.id, job])));
    } catch {
      setJobs({});
    }
  }

  async function uploadFile(file: File) {
    try {
      const contentBase64 = await fileToBase64(file);
      const suffix = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : '';
      const job = await api.post<KnowledgeIngestJobRead>(`/api/enterprise/knowledge/documents${suffix}`, {
        tenant_id: TENANT_ID,
        filename: file.name,
        title: file.name.replace(/\.[^.]+$/, ''),
        content_base64: contentBase64,
      });
      setJobs((prev) => ({ ...prev, [job.id]: job }));
      await refreshKnowledgeBases();
      message.success('已创建知识库和入库任务');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '上传失败');
    }
  }

  async function loadDiscoveriesForJob(job: KnowledgeIngestJobRead) {
    setCheckedDiscoveryJobIds((prev) => (prev.includes(job.id) ? prev : [...prev, job.id]));
    try {
      const suffix = agentId ? `&agent_id=${encodeURIComponent(agentId)}` : '';
      const rows = await api.get<KnowledgeDiscoveryRead[]>(`/api/enterprise/knowledge/discoveries?tenant_id=${TENANT_ID}${suffix}`);
      const next = rows.filter(
        (item) =>
          item.status === 'pending' &&
          item.suggestion_type !== 'warning' &&
          item.knowledge_base_id === job.knowledge_base_id &&
          (!job.document_id || item.document_id === job.document_id),
      );
      if (next.length === 0) return;
      setPendingDiscoveries((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...next.filter((item) => !seen.has(item.id))];
      });
      setDiscoveryModalOpen(true);
    } catch (error) {
      message.warning(error instanceof Error ? error.message : '加载知识发现建议失败');
    }
  }

  async function confirmDiscovery(item: KnowledgeDiscoveryRead) {
    try {
      await api.post(`/api/enterprise/knowledge/discoveries/${item.id}/confirm?tenant_id=${TENANT_ID}`);
      message.success('已确认建议');
      setPendingDiscoveries((current) => current.filter((entry) => entry.id !== item.id));
      await refreshKnowledgeBases();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '确认失败');
    }
  }

  async function rejectDiscovery(item: KnowledgeDiscoveryRead) {
    try {
      await api.post(`/api/enterprise/knowledge/discoveries/${item.id}/reject?tenant_id=${TENANT_ID}`);
      message.success('已拒绝建议');
      setPendingDiscoveries((current) => current.filter((entry) => entry.id !== item.id));
    } catch (error) {
      message.error(error instanceof Error ? error.message : '拒绝失败');
    }
  }

  return (
    <div className="knowledge-page knowledge-add-page knowledge-floating-subpage">
      <div className="knowledge-floating-shell">
        <div className="knowledge-floating-head">
          <div>
            <Typography.Text className="section-kicker">知识库 / 新建</Typography.Text>
            <Typography.Title level={3}>新建知识库</Typography.Title>
            <Typography.Text type="secondary">上传业务文档后，系统会先生成知识图谱，再刷新目录索引、引用来源与自发现建议。</Typography.Text>
          </div>
            <Button icon={<RightOutlined />} onClick={() => navigate('/enterprise/knowledge')}>返回</Button>
        </div>

        <Card className="knowledge-card knowledge-upload-card">
          <div className="knowledge-upload-controls">
            <div>
              <Typography.Text strong>上传文档即创建知识库</Typography.Text>
              <Typography.Text type="secondary">一个文件对应一份独立知识库；回到知识库后可查看文档卡片、知识索引和知识图谱。</Typography.Text>
            </div>
            <Button onClick={() => navigate('/enterprise/knowledge')}>管理已有知识库</Button>
          </div>
        {visibleKnowledgeBases.length > 0 && (
          <div className="knowledge-base-target-strip">
            {visibleKnowledgeBases.map((item) => (
              <div
                key={item.id}
                className="knowledge-base-target"
              >
                <span>{item.name}</span>
                <small>
                  {item.document_count} 文档 / {item.bucket_count} 目录 / {item.chunk_count} 引用
                </small>
              </div>
            ))}
          </div>
        )}
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
              <strong>拖拽文档到这里，或点击上传</strong>
              <span>支持 doc/docx/txt/md/html/pdf；旧版 doc 会提示转换为 docx。</span>
            </div>
          </div>
        </Dragger>
        </Card>

        <Card className="knowledge-card knowledge-card-solid" title="入库任务">
          {Object.values(jobs).length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="上传后这里会显示原始资料、知识图谱和引用来源入库进度" />
          ) : (
            <div className="knowledge-jobs">
              {Object.values(jobs).map((job) => (
                <KnowledgeJobCard job={job} key={job.id} />
              ))}
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={discoveryModalOpen && pendingDiscoveries.length > 0}
        title="发现可新增资源"
        footer={null}
        width={820}
        className="knowledge-discovery-modal"
        onCancel={() => setDiscoveryModalOpen(false)}
      >
        <DiscoveryColumn
          title="可确认建议"
          description="模型从本次上传的知识中发现了技能或工具草案，确认后才会写入系统。"
          items={pendingDiscoveries}
          onConfirm={confirmDiscovery}
          onReject={rejectDiscovery}
        />
      </Modal>
    </div>
  );
}

function KnowledgeJobCard({ job }: { job: KnowledgeIngestJobRead }) {
  const steps = ingestSteps(job);
  const stageLabel = stringFromMetadata(job.metadata.stage_label) || stageLabelFallback(job.stage);
  const stageDetail = stringFromMetadata(job.metadata.stage_detail);
  return (
    <div className="knowledge-job">
      <div className="knowledge-job-head">
        <div>
          <Typography.Text strong>{job.filename}</Typography.Text>
          <Typography.Text type="secondary"> · {stageLabel}</Typography.Text>
        </div>
        {statusTag(job.status)}
      </div>
      <SmoothProgress job={job} />
      <div className="knowledge-stage-track">
        {steps.map((step) => (
          <div className={`knowledge-stage-step is-${step.status}`} key={step.key}>
            <span />
            <small>{step.label}</small>
          </div>
        ))}
      </div>
      {stageDetail && <Typography.Text className="knowledge-job-detail">{stageDetail}</Typography.Text>}
      {job.error && <Typography.Text type="danger">{job.error}</Typography.Text>}
    </div>
  );
}

function SmoothProgress({ job }: { job: KnowledgeIngestJobRead }) {
  const target = Math.max(0, Math.min(100, Math.round((job.progress || 0) * 100)));
  const [displayProgress, setDisplayProgress] = useState(target);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDisplayProgress((current) => {
        if (current === target) return current;
        const diff = target - current;
        const step = Math.max(1, Math.ceil(Math.abs(diff) / 14));
        return current + Math.sign(diff) * Math.min(Math.abs(diff), step);
      });
    }, 80);
    return () => window.clearInterval(timer);
  }, [target]);

  return (
    <Progress
      percent={displayProgress}
      status={job.status === 'failed' ? 'exception' : undefined}
      strokeColor={job.status === 'failed' ? undefined : { '0%': '#0f7f74', '100%': '#16a34a' }}
    />
  );
}

function ingestSteps(job: KnowledgeIngestJobRead): IngestStepView[] {
  const raw = job.metadata.ingest_steps;
  if (Array.isArray(raw)) {
    return raw.map((item, index) => {
      const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      const status = record.status === 'running' || record.status === 'done' ? record.status : 'pending';
      return {
        key: String(record.key || `step_${index}`),
        label: String(record.label || DEFAULT_INGEST_STEPS[index]?.label || `阶段 ${index + 1}`),
        progress: Number(record.progress || 0),
        status,
      };
    });
  }
  const currentProgress = job.progress || 0;
  return DEFAULT_INGEST_STEPS.map((step) => ({
    ...step,
    status:
      job.stage === step.key
        ? 'running'
        : step.progress < currentProgress || job.stage === 'done'
        ? 'done'
        : 'pending',
  }));
}

function stageLabelFallback(stage: string): string {
  return DEFAULT_INGEST_STEPS.find((item) => item.key === stage)?.label || stage || '处理中';
}

function stringFromMetadata(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

type KnowledgeDetailView = 'document' | 'sections' | 'wiki';
type KnowledgeContentView = 'sections' | 'wiki';
const STRUCTURE_PREVIEW_LIMIT = 8;
const OKF_PREVIEW_LIMIT = 8;

type WikiIndexGroup = {
  key: string;
  title: string;
  description: string;
  concepts: KnowledgeConceptRead[];
};

function 目录索引Overview({
  document,
  knowledgeBase,
  okfConcepts,
  onEditDocument,
  onViewConcept,
  onEditConcept,
}: {
  document: KnowledgeDocumentRead;
  knowledgeBase: KnowledgeBaseRead | null;
  buckets: KnowledgeBucketRead[];
  okfConcepts: KnowledgeConceptRead[];
  onEditDocument: (document: KnowledgeDocumentRead) => void;
  onViewConcept: (concept: KnowledgeConceptRead) => void;
  onEditConcept: (concept: KnowledgeConceptRead) => void;
}) {
  const [detailView, setDetailView] = useState<KnowledgeDetailView | null>(null);
  const [detailFocusKey, setDetailFocusKey] = useState<string | null>(null);
  const [activeContentView, setActiveContentView] = useState<KnowledgeContentView>('sections');
  const metadata = document.metadata || {};
  const documentCard = isRecord(metadata.document_card) ? metadata.document_card : {};
  const wikiStructureConcepts = useMemo(() => sortWikiConcepts(okfConcepts), [okfConcepts]);
  const wikiIndexGroups = useMemo(() => buildWikiIndexGroups(wikiStructureConcepts), [wikiStructureConcepts]);
  const previewWikiStructure = wikiIndexGroups.slice(0, STRUCTURE_PREVIEW_LIMIT);
  const previewConcepts = okfConcepts.slice(0, OKF_PREVIEW_LIMIT);
  const documentTitle = String(documentCard.title || document.title || knowledgeBase?.name || document.filename);
  const documentSummary = String(documentCard.summary || '暂无文档摘要');
  const openDetail = (view: KnowledgeDetailView, focusKey?: string) => {
    setDetailFocusKey(focusKey || null);
    setDetailView(view);
  };
  const openContentDetail = (view: KnowledgeContentView, focusKey?: string) => {
    if (view === 'sections') {
      openDetail('sections', focusKey);
      return;
    }
    openDetail(view, focusKey);
  };

  useEffect(() => {
    if (!detailView || !detailFocusKey) return;
    const timer = window.setTimeout(() => {
      const targets = Array.from(window.document.querySelectorAll<HTMLElement>('.knowledge-detail-modal .knowledge-detail-target'));
      const target = targets.find((item) => item.dataset.detailKey === detailFocusKey);
      if (!target) return;
      target.scrollIntoView({ block: 'start', behavior: 'auto' });
      target.classList.add('is-focused');
      window.setTimeout(() => target.classList.remove('is-focused'), 1500);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [detailView, detailFocusKey]);

  const overviewContent: Record<
    KnowledgeContentView,
    {
      title: string;
      description: string;
      count: number;
      emptyText: string;
      items: Array<{ key: string; title: string; summary: string; concept?: KnowledgeConceptRead; indexGroup?: WikiIndexGroup }>;
    }
  > = {
    sections: {
      title: '目录索引',
      description: '按目录结构组织知识范围，先看主题，再进入知识图谱。',
      count: wikiIndexGroups.length,
      emptyText: '暂无目录索引',
      items: previewWikiStructure.map((group) => ({
        key: group.key,
        title: group.title,
        summary: group.description,
        indexGroup: group,
      })),
    },
    wiki: {
      title: '知识图谱',
      description: '可读知识页，用于长期沉淀、跨文档综合和数字员工复制。',
      count: okfConcepts.length,
      emptyText: '暂无知识图谱',
      items: previewConcepts.map((concept) => ({
        key: concept.id,
        title: concept.title || concept.concept_id,
        summary: `${conceptTypeLabel(concept.concept_type)} · ${concept.description || concept.concept_id}`,
        concept,
      })),
    },
  };
  const activeContent = overviewContent[activeContentView];

  return (
    <div className="knowledge-pageindex">
      <div className="knowledge-pageindex-card">
        <div className="knowledge-document-card-body">
          <Typography.Text type="secondary">文档卡片</Typography.Text>
          <Typography.Title level={5}>{documentTitle}</Typography.Title>
          <Typography.Paragraph ellipsis={{ rows: 3 }}>{documentSummary}</Typography.Paragraph>
        </div>
        <div className="knowledge-pageindex-actions">
          <Button size="small" icon={<EditOutlined />} onClick={() => openDetail('document')}>
            详情
          </Button>
        </div>
        <div className="knowledge-document-meta">
          <button type="button" className="knowledge-stat-pill" onClick={() => openDetail('document')}>
            <span>格式</span>
            <strong>{document.file_type || 'unknown'}</strong>
          </button>
          <button
            type="button"
            className={`knowledge-stat-pill ${activeContentView === 'sections' ? 'is-active' : ''}`}
            aria-pressed={activeContentView === 'sections'}
            onClick={() => setActiveContentView('sections')}
          >
            <span>目录索引</span>
            <strong>{wikiIndexGroups.length}</strong>
          </button>
          <button
            type="button"
            className={`knowledge-stat-pill ${activeContentView === 'wiki' ? 'is-active' : ''}`}
            aria-pressed={activeContentView === 'wiki'}
            onClick={() => setActiveContentView('wiki')}
          >
            <span>知识图谱</span>
            <strong>{okfConcepts.length}</strong>
          </button>
        </div>
      </div>

      <div className="knowledge-overview-panel">
        <div className="knowledge-overview-panel-head">
          <span>
            <strong>{activeContent.title}</strong>
            <small>{activeContent.description}</small>
          </span>
          <Space size={8}>
            <Tag>{activeContent.count}</Tag>
            <Button size="small" type="link" onClick={() => openContentDetail(activeContentView)}>
              查看全部
            </Button>
          </Space>
        </div>
        {activeContentView === 'sections' && (
          <div className="knowledge-layer-explain" aria-label="知识层级说明">
            <span>
              <strong>目录索引</strong>
              <small>目录索引，用于按资料、章节、主题逐级展开</small>
            </span>
            <span>
              <strong>知识图谱</strong>
              <small>最底层可读知识页，回答时基于页面内容并追溯引用来源</small>
            </span>
          </div>
        )}
        <div className="knowledge-mini-list">
          {activeContent.items.length === 0 ? (
            <span className="knowledge-empty-note">{activeContent.emptyText}</span>
          ) : (
            activeContent.items.map((entry) => (
              <button
                type="button"
                className="knowledge-mini-item"
                key={`${activeContentView}-${entry.key}`}
                onClick={() => {
                  if (activeContentView === 'sections' && entry.indexGroup) {
                    openContentDetail('sections', entry.indexGroup.key);
                    return;
                  }
                  if ((activeContentView === 'sections' || activeContentView === 'wiki') && entry.concept) {
                    onViewConcept(entry.concept);
                    return;
                  }
                  openContentDetail(activeContentView, entry.key);
                }}
                title={
                  activeContentView === 'sections' && entry.indexGroup
                    ? '查看目录下的知识图谱'
                    : (activeContentView === 'sections' || activeContentView === 'wiki') && entry.concept
                      ? '查看知识图谱'
                      : '查看详情'
                }
              >
                <strong>{entry.title}</strong>
                <small>{entry.summary}</small>
              </button>
            ))
          )}
        </div>
      </div>

      <Modal
        open={Boolean(detailView)}
        title={knowledgeDetailTitle(detailView)}
        footer={null}
        width={detailView === 'sections' ? 'min(1240px, calc(100vw - 56px))' : 920}
        className={`knowledge-detail-modal${detailView === 'sections' ? ' knowledge-detail-modal-sections' : ''}`}
        onCancel={() => setDetailView(null)}
      >
        {detailView === 'document' && (
          <div className="knowledge-detail-stack">
            <div className="knowledge-detail-header">
              <div>
                <Typography.Text type="secondary">文档卡片</Typography.Text>
                <Typography.Title level={4}>{documentTitle}</Typography.Title>
                <Typography.Paragraph>{documentSummary}</Typography.Paragraph>
              </div>
              <Button icon={<EditOutlined />} onClick={() => onEditDocument(document)}>
                修改
              </Button>
            </div>
            <div className="knowledge-evidence-stat is-inline">
              <strong>{document.file_type || 'unknown'}</strong>
              <span>文件格式</span>
            </div>
            <div className="knowledge-document-meta">
              <button type="button" className="knowledge-stat-pill" onClick={() => openDetail('sections')}>
                <span>目录索引</span>
                <strong>{wikiIndexGroups.length}</strong>
              </button>
              <button type="button" className="knowledge-stat-pill" onClick={() => openDetail('wiki')}>
                <span>知识图谱</span>
                <strong>{okfConcepts.length}</strong>
              </button>
            </div>
          </div>
        )}

        {detailView === 'sections' && (
          <div className="knowledge-wiki-map">
            {wikiIndexGroups.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 目录索引 目录" />
            ) : (
              wikiIndexGroups.map((group) => (
                <section
                  className="knowledge-wiki-map-card knowledge-index-group knowledge-detail-target"
                  key={group.key}
                  data-detail-key={group.key}
                >
                  <div className="knowledge-index-group-head">
                    <div>
                      <Tag color="green">目录索引</Tag>
                      <strong>{group.title}</strong>
                      <small>{group.description}</small>
                    </div>
                    <Tag>{group.concepts.length} 页</Tag>
                  </div>
                  <div className="knowledge-index-page-list">
                    {group.concepts.slice(0, 8).map((concept) => (
                      <button type="button" key={concept.id} onClick={() => onViewConcept(concept)}>
                        <span>{concept.title || concept.concept_id}</span>
                        <small>{conceptTypeLabel(concept.concept_type)} · {concept.description || concept.concept_id}</small>
                      </button>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        )}

        {detailView === 'wiki' && (
          <div className="knowledge-concept-list">
            {okfConcepts.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无知识图谱" />
            ) : (
              okfConcepts.map((concept) => (
                <div
                  className="knowledge-concept-card knowledge-detail-target"
                  key={concept.id}
                  data-detail-key={concept.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onViewConcept(concept)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onViewConcept(concept);
                    }
                  }}
                >
                  <div className="knowledge-concept-card-head">
                    <div>
                      <Space size={8} wrap>
                        <Tag color={conceptTypeColor(concept.concept_type)}>{conceptTypeLabel(concept.concept_type)}</Tag>
                        {statusTag(concept.status)}
                      </Space>
                      <Typography.Title level={5}>{concept.title || concept.concept_id}</Typography.Title>
                    </div>
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={(event) => {
                        event.stopPropagation();
                        onEditConcept(concept);
                      }}
                    >
                      编辑
                    </Button>
                  </div>
                  <Typography.Paragraph type="secondary">{concept.description || conceptSummary(concept)}</Typography.Paragraph>
                  <Space size={6} wrap>
                    <Tag>{concept.concept_id}</Tag>
                    <Tag>{concept.links.length} 个链接</Tag>
                    <Tag>{concept.citations.length} 个引用</Tag>
                    {concept.document_id ? <Tag>来源文档 {concept.document_id}</Tag> : null}
                  </Space>
                </div>
              ))
            )}
          </div>
        )}

      </Modal>
    </div>
  );
}

function WikiViewerTitle({ concept }: { concept: KnowledgeConceptRead }) {
  return (
    <div className="okf-viewer-title">
      <span>{conceptTypeLabel(concept.concept_type)}</span>
      <strong>{concept.title || concept.concept_id}</strong>
      <small>{concept.concept_id}</small>
    </div>
  );
}

function WikiConceptViewer({ concept }: { concept: KnowledgeConceptRead }) {
  const body = stripOkfFrontmatter(concept.content_md || '');
  const tags = Array.isArray(concept.frontmatter?.tags) ? concept.frontmatter.tags : [];
  const citations = Array.isArray(concept.citations) ? concept.citations : [];
  const links = Array.isArray(concept.links) ? concept.links : [];
  const sourceRefs = Array.isArray(concept.source_refs) ? concept.source_refs : [];
  return (
    <div className="okf-wiki-page">
      <section className="okf-wiki-hero">
        <Space size={8} wrap>
          <Tag color={conceptTypeColor(concept.concept_type)}>{conceptTypeLabel(concept.concept_type)}</Tag>
          {statusTag(concept.status)}
          {tags.slice(0, 5).map((tag) => (
            <Tag key={String(tag)}>{String(tag)}</Tag>
          ))}
        </Space>
        <Typography.Title level={3}>{concept.title || concept.concept_id}</Typography.Title>
        <Typography.Paragraph>{concept.description || conceptSummary(concept)}</Typography.Paragraph>
      </section>

      <section className="okf-wiki-meta-grid" aria-label="知识图谱元信息">
        <div className="okf-wiki-meta-item">
          <span>页面路径</span>
          <strong>{concept.concept_id}</strong>
        </div>
        <div className="okf-wiki-meta-item">
          <span>链接</span>
          <strong>{links.length} 个</strong>
        </div>
        <div className="okf-wiki-meta-item">
          <span>引用</span>
          <strong>{citations.length} 个</strong>
        </div>
        <div className="okf-wiki-meta-item">
          <span>更新时间</span>
          <strong>{formatDateTime(concept.updated_at)}</strong>
        </div>
      </section>

      <section className="okf-wiki-body">
        <MarkdownPreview markdown={body || '暂无正文'} />
      </section>

      {(links.length > 0 || citations.length > 0 || sourceRefs.length > 0) && (
        <section className="okf-wiki-reference-grid" aria-label="知识链接与引用">
          {links.length > 0 && (
            <div>
              <strong>关联页面</strong>
              <div className="okf-wiki-token-list">
                {links.slice(0, 12).map((item, index) => (
                  <Tag key={`link-${index}`}>{recordLabel(item, ['target', 'concept_id', 'id'])}</Tag>
                ))}
              </div>
            </div>
          )}
          {citations.length > 0 && (
            <div>
              <strong>引用</strong>
              <div className="okf-wiki-token-list">
                {citations.slice(0, 12).map((item, index) => (
                  <Tag key={`citation-${index}`}>{recordLabel(item, ['label', 'source', 'uri', 'id'])}</Tag>
                ))}
              </div>
            </div>
          )}
          {sourceRefs.length > 0 && (
            <div>
              <strong>来源</strong>
              <div className="okf-wiki-token-list">
                {sourceRefs.slice(0, 12).map((item, index) => (
                  <Tag key={`source-${index}`}>{recordLabel(item, ['document_id', 'section_id', 'source', 'id'])}</Tag>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function MarkdownPreview({ markdown }: { markdown: string }) {
  const blocks = splitMarkdownBlocks(markdown);
  return (
    <div className="okf-markdown-preview">
      {blocks.map((block, index) => {
        const heading = block.match(/^(#{1,6})\s+(.+)$/);
        if (heading) {
          const level = Math.min(4, Math.max(3, heading[1].length + 2)) as 3 | 4;
          return (
            <Typography.Title level={level} key={`heading-${index}`}>
              {heading[2]}
            </Typography.Title>
          );
        }
        if (block.startsWith('```')) {
          return <pre key={`code-${index}`}>{block.replace(/^```[^\n]*\n?|\n?```$/g, '')}</pre>;
        }
        if (block.startsWith('>')) {
          return <blockquote key={`quote-${index}`}>{block.replace(/^>\s?/gm, '')}</blockquote>;
        }
        if (/^[-*]\s+/m.test(block)) {
          return (
            <ul key={`list-${index}`}>
              {block
                .split('\n')
                .map((item) => item.replace(/^[-*]\s+/, '').trim())
                .filter(Boolean)
                .map((item, itemIndex) => (
                  <li key={`list-${index}-${itemIndex}`}>{item}</li>
                ))}
            </ul>
          );
        }
        if (/^\d+\.\s+/m.test(block)) {
          return (
            <ol key={`ordered-${index}`}>
              {block
                .split('\n')
                .map((item) => item.replace(/^\d+\.\s+/, '').trim())
                .filter(Boolean)
                .map((item, itemIndex) => (
                  <li key={`ordered-${index}-${itemIndex}`}>{item}</li>
                ))}
            </ol>
          );
        }
        return (
          <Typography.Paragraph key={`paragraph-${index}`}>
            {block}
          </Typography.Paragraph>
        );
      })}
    </div>
  );
}

function splitMarkdownBlocks(markdown: string) {
  return markdown
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function stripOkfFrontmatter(markdown: string) {
  return markdown.replace(/^---\s*\n[\s\S]*?\n---\s*/, '').trim();
}

function recordLabel(item: unknown, keys: string[]) {
  if (!isRecord(item)) return String(item || 'unknown');
  for (const key of keys) {
    const value = item[key];
    if (value) return String(value);
  }
  return JSON.stringify(item);
}

function KnowledgeBucketLinks({ bucket, evidenceOnly = false }: { bucket: KnowledgeBucketRead; evidenceOnly?: boolean }) {
  const sourceSections = bucketSourceSections(bucket);
  const representativeChunks = bucketRepresentativeChunks(bucket);
  return (
    <div className="knowledge-bucket-link-grid">
      {!evidenceOnly && (
        <>
          <Typography.Text type="secondary">覆盖来源</Typography.Text>
          <div>
            {sourceSections.length === 0 ? (
              <Tag>暂无来源路径</Tag>
            ) : (
              sourceSections.map((section) => <Tag key={String(section)}>{String(section)}</Tag>)
            )}
          </div>
        </>
      )}
      <Typography.Text type="secondary">{evidenceOnly ? '引用来源' : '代表引用'}</Typography.Text>
      <div className="knowledge-evidence-token-list">
        {representativeChunks.length === 0 ? (
          bucket.chunk_count > 0 ? <Tag>{bucket.chunk_count} 个引用来源</Tag> : <Tag>暂无可读代表来源</Tag>
        ) : (
          representativeChunks.map((chunkId) => <Tag key={String(chunkId)}>{String(chunkId)}</Tag>)
        )}
      </div>
    </div>
  );
}

function knowledgeDetailTitle(view: KnowledgeDetailView | null) {
  if (view === 'document') return '文档详情';
  if (view === 'sections') return '目录索引 目录';
  if (view === 'wiki') return '知识图谱';
  return '知识详情';
}

function bucketSourceSections(bucket: KnowledgeBucketRead) {
  const bucketMeta = bucket.metadata || {};
  if (Array.isArray(bucketMeta.section_paths)) return bucketMeta.section_paths;
  if (Array.isArray(bucketMeta.section_ids)) return bucketMeta.section_ids;
  return [];
}

function bucketRepresentativeChunks(bucket: KnowledgeBucketRead) {
  const representativeChunks = Array.isArray(bucket.metadata?.representative_chunk_ids)
    ? bucket.metadata.representative_chunk_ids
    : [];
  return representativeChunks
    .map((chunkId) => String(chunkId || '').trim())
    .filter((chunkId) => chunkId.length > 0 && !/^k?chunk_[a-f0-9]{8,}$/i.test(chunkId))
    .slice(0, 12);
}

function previewRepresentativeChunkIds(buckets: KnowledgeBucketRead[]) {
  const ids: string[] = [];
  buckets.forEach((bucket) => {
    ids.push(...bucketRepresentativeChunks(bucket));
  });
  return Array.from(new Set(ids)).slice(0, 3);
}

function previewEvidenceItems(buckets: KnowledgeBucketRead[], chunkCount: number, limit: number) {
  const bucketItems = buckets
    .filter((bucket) => bucket.chunk_count > 0)
    .slice(0, limit)
    .map((bucket) => {
      const sourceSections = bucketSourceSections(bucket)
        .map((section) => String(section))
        .filter(Boolean)
        .slice(0, 2);
      return {
        key: bucket.id,
        title: bucket.title || bucket.bucket_key || '引用来源',
        summary: sourceSections.length
          ? `${bucket.chunk_count} 个引用来源，覆盖 ${sourceSections.join(' / ')}`
          : `${bucket.chunk_count} 个引用来源，已完成桶级映射。`,
      };
    });
  if (bucketItems.length > 0) return bucketItems;

  const representativeChunkIds = previewRepresentativeChunkIds(buckets);
  if (representativeChunkIds.length > 0) {
    return representativeChunkIds.map((chunkId) => ({
      key: chunkId,
      title: chunkId,
      summary: '代表引用来源，可在详情中查看来源映射。',
    }));
  }

  if (chunkCount > 0) {
    return [
      {
        key: 'chunk-total',
        title: '已入库引用来源',
        summary: `共 ${chunkCount} 个引用来源，当前暂无可展示的桶级代表来源。`,
      },
    ];
  }

  return [];
}

function KnowledgeSearchDebug({
  result,
  loading,
  compact = false,
}: {
  result: KnowledgeSearchResponse | null;
  loading: boolean;
  compact?: boolean;
}) {
  if (loading) {
    return <Typography.Text type="secondary">正在按目录索引和知识图谱检索，并整理引用来源...</Typography.Text>;
  }
  if (!result) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未运行检索" />;
  }
  const selectedConcepts = result.selected_concepts || [];
  const okfCitations = result.okf_citations || [];
  return (
    <div className={`knowledge-search-debug${compact ? ' is-compact' : ''}`}>
      <div className="knowledge-route-trace">
        {(result.route_trace || result.trace || []).map((item, index) => (
          <div className="knowledge-route-step" key={`${String(item.phase || 'phase')}-${index}`}>
            <span>{index + 1}</span>
            <div>
              <strong>{routePhaseLabel(String(item.phase || ''))}</strong>
              <small>{String(item.message || '')}</small>
            </div>
          </div>
        ))}
      </div>
      <Collapse
        size="small"
        items={[
          {
            key: 'concepts',
            label: `知识图谱 ${selectedConcepts.length}`,
            children: <pre className="knowledge-json">{JSON.stringify(selectedConcepts, null, 2)}</pre>,
          },
          {
            key: 'okf-citations',
            label: `知识图谱引用 ${okfCitations.length}`,
            children: <pre className="knowledge-json">{JSON.stringify(okfCitations, null, 2)}</pre>,
          },
          {
            key: 'documents',
            label: `文档 ${result.selected_documents.length}`,
            children: <pre className="knowledge-json">{JSON.stringify(result.selected_documents, null, 2)}</pre>,
          },
          {
            key: 'sections',
            label: `展开来源 ${result.expanded_sections.length}`,
            children: <pre className="knowledge-json">{JSON.stringify(result.expanded_sections, null, 2)}</pre>,
          },
          {
            key: 'evidence',
            label: `引用来源包 ${result.evidence_pack.length}`,
            children: (
              <div className="knowledge-evidence-list">
                {result.evidence_pack.map((item) => (
                  <div className="knowledge-evidence-item" key={item.chunk_id}>
                    <Typography.Text strong>{item.section_path || item.source_path || item.chunk_id}</Typography.Text>
                    <Typography.Paragraph>{item.excerpt}</Typography.Paragraph>
                    <Typography.Text type="secondary">{item.confidence_reason}</Typography.Text>
                  </div>
                ))}
              </div>
            ),
          },
        ]}
      />
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

function routePhaseLabel(phase: string) {
  const map: Record<string, string> = {
    document_route: '选择知识库文档',
    document_route_fallback: '文档路由兜底',
    okf_concept_route: '选择知识图谱',
    okf_only: '仅命中知识图谱',
    bucket_route: '展开内部索引',
    bucket_route_fallback: '内部索引路由兜底',
    section_expand: '读取来源',
    read_chunks: '读取引用来源',
    evidence_pack: '整理引用来源包',
    no_documents: '没有文档',
    no_buckets: '没有内部索引',
  };
  return map[phase] || phase || '检索阶段';
}

function isEmptyDefaultKnowledgeBase(item: KnowledgeBaseRead) {
  const hasRuntimeKnowledge = item.document_count > 0 || item.bucket_count > 0 || item.chunk_count > 0;
  if (!hasRuntimeKnowledge && item.metadata?.created_from_document_upload && !item.metadata?.source_document_id) {
    return true;
  }
  return (
    item.name === '默认知识库' &&
    item.document_count === 0 &&
    item.bucket_count === 0 &&
    item.chunk_count === 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function statusTag(status: string) {
  const map: Record<string, { color: string; label: string }> = {
    active: { color: 'green', label: '已上线' },
    published: { color: 'green', label: '已发布' },
    archived: { color: 'default', label: '已下线' },
    draft: { color: 'default', label: '草稿' },
    succeeded: { color: 'green', label: '已完成' },
    ready: { color: 'green', label: '达标' },
    confirmed: { color: 'green', label: '已确认' },
    failed: { color: 'red', label: '失败' },
    pending: { color: 'gold', label: '待处理' },
    running: { color: 'processing', label: '处理中' },
    queued: { color: 'gold', label: '排队中' },
  };
  const item = map[status] || { color: 'gold', label: status };
  return <Tag color={item.color}>{item.label}</Tag>;
}

function bucketStatusTag(bucket: KnowledgeBucketRead) {
  if (bucket.status === 'ready') return <Tag color="green">达标</Tag>;
  return <Tag color="gold">待补足</Tag>;
}

function conceptPath(conceptId: string) {
  return conceptId
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
}

const CONCEPT_TYPE_LABELS = new Map<string, string>([
  ['Source Document', '原始资料'],
  ['Source Section', '资料页'],
  ['Topic', '主题'],
  ['Playbook', '流程知识'],
  ['Business Rule', '业务规则'],
  ['Query Analysis', '查询分析'],
]);

function conceptTypeLabel(type: string) {
  return CONCEPT_TYPE_LABELS.get(type) || type || '概念';
}

function conceptTypeColor(type: string) {
  const map: Record<string, string> = {
    'Source Document': 'blue',
    'Source Section': 'cyan',
    Topic: 'green',
    Playbook: 'purple',
    'Business Rule': 'gold',
    'Query Analysis': 'magenta',
  };
  return map[type] || 'default';
}

function sortWikiConcepts(concepts: KnowledgeConceptRead[]) {
  const rank: Record<string, number> = {
    'Source Document': 0,
    'Source Section': 1,
    Topic: 2,
    Playbook: 3,
    'Business Rule': 4,
    'Query Analysis': 5,
  };
  return [...concepts].sort((left, right) => {
    const leftRank = rank[left.concept_type] ?? 99;
    const rightRank = rank[right.concept_type] ?? 99;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return (left.title || left.concept_id).localeCompare(right.title || right.concept_id, 'zh-CN');
  });
}

function buildWikiIndexGroups(concepts: KnowledgeConceptRead[]): WikiIndexGroup[] {
  const groupMap = new Map<string, WikiIndexGroup>();
  concepts.forEach((concept) => {
    const key = wikiIndexGroupKey(concept);
    const existing = groupMap.get(key);
    if (existing) {
      existing.concepts.push(concept);
      existing.description = wikiIndexGroupDescription(existing.concepts);
      return;
    }
    groupMap.set(key, {
      key,
      title: wikiIndexGroupTitle(concept),
      description: wikiIndexGroupDescription([concept]),
      concepts: [concept],
    });
  });
  return Array.from(groupMap.values()).map((group) => ({
    ...group,
    concepts: sortWikiConcepts(group.concepts),
  }));
}

function wikiIndexGroupKey(concept: KnowledgeConceptRead) {
  const sourceDocument = stringFromMetadata(concept.frontmatter?.source_document);
  if (sourceDocument) return `source:${sourceDocument}`;
  const firstSource = concept.source_refs.find((item) => isRecord(item) && (item.source_document || item.document_id));
  if (isRecord(firstSource)) {
    const label = String(firstSource.source_document || firstSource.document_id || '').trim();
    if (label) return `source:${label}`;
  }
  return `type:${concept.concept_type || '知识图谱'}`;
}

function wikiIndexGroupTitle(concept: KnowledgeConceptRead) {
  const sourceDocument = stringFromMetadata(concept.frontmatter?.source_document);
  if (sourceDocument) return sourceDocument.replace(/^sources\//, '');
  const firstSource = concept.source_refs.find((item) => isRecord(item) && (item.source_document || item.document_id));
  if (isRecord(firstSource)) {
    const label = String(firstSource.source_document || firstSource.document_id || '').trim();
    if (label) return label.replace(/^sources\//, '');
  }
  return conceptTypeLabel(concept.concept_type);
}

function wikiIndexGroupDescription(concepts: KnowledgeConceptRead[]) {
  const types = Array.from(new Set(concepts.map((concept) => conceptTypeLabel(concept.concept_type)).filter(Boolean))).slice(0, 4);
  const samples = concepts
    .map((concept) => concept.title || concept.concept_id)
    .filter(Boolean)
    .slice(0, 3);
  const typeText = types.length ? types.join('、') : '知识图谱';
  const sampleText = samples.length ? `，包含 ${samples.join(' / ')}` : '';
  return `${concepts.length} 个知识图谱，覆盖 ${typeText}${sampleText}`;
}

function conceptSummary(concept: KnowledgeConceptRead) {
  const body = concept.content_md.replace(/^---[\s\S]*?---\s*/m, '').replace(/[#>*_\-[\]()`]/g, ' ').trim();
  return body.length > 160 ? `${body.slice(0, 160)}...` : body || '暂无摘要';
}

function okfFrontmatterValue(markdown: string, key: string, fallback = '') {
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) return fallback;
  const line = frontmatter[1].split('\n').find((item) => item.trim().startsWith(`${key}:`));
  if (!line) return fallback;
  const raw = line.slice(line.indexOf(':') + 1).trim();
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'string' ? parsed : String(parsed);
  } catch {
    return raw.replace(/^['"]|['"]$/g, '');
  }
}

function updateOkfFrontmatterValue(markdown: string, key: string, value: string) {
  const normalizedValue = JSON.stringify(value);
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) {
    return `---\n${key}: ${normalizedValue}\n---\n\n${markdown}`;
  }
  const lines = frontmatter[1].split('\n');
  const index = lines.findIndex((line) => line.trim().startsWith(`${key}:`));
  if (index >= 0) {
    lines[index] = `${key}: ${normalizedValue}`;
  } else {
    lines.push(`${key}: ${normalizedValue}`);
  }
  return markdown.replace(/^---\n[\s\S]*?\n---/, `---\n${lines.join('\n')}\n---`);
}

function formatDateTime(value: string) {
  if (!value) return '未知时间';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
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
