import {
  DatabaseOutlined,
  DeleteOutlined,
  ProfileOutlined,
  ReloadOutlined,
  RobotOutlined,
  SaveOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Button, Card, Col, Empty, Form, Input, Modal, Row, Segmented, Space, Switch, Tag, Typography, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { api, TENANT_ID } from '../api/client';
import type {
  AgentProfileRead,
  AgentResourceBindingRead,
  AgentResourceType,
  GeneralSkillRead,
  KnowledgeBaseRead,
  SkillRead,
} from '../types';

type ResourceItem = {
  type: AgentResourceType;
  id: string;
  title: string;
  subtitle: string;
  status: string;
};

const RESOURCE_LABEL: Record<AgentResourceType, string> = {
  skill: '场景技能',
  general_skill: '通用技能',
  knowledge_base: '知识库',
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentProfileRead[]>([]);
  const [skills, setSkills] = useState<SkillRead[]>([]);
  const [generalSkills, setGeneralSkills] = useState<GeneralSkillRead[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseRead[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [draftResources, setDraftResources] = useState<AgentResourceBindingRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) || agents[0] || null;

  const catalog = useMemo<ResourceItem[]>(() => [
    ...skills.map((item) => ({
      type: 'skill' as const,
      id: item.id,
      title: item.name,
      subtitle: `${item.skill_id} · ${item.version}`,
      status: item.status,
    })),
    ...generalSkills.map((item) => ({
      type: 'general_skill' as const,
      id: item.id,
      title: item.name,
      subtitle: item.slug,
      status: item.status,
    })),
    ...knowledgeBases.map((item) => ({
      type: 'knowledge_base' as const,
      id: item.id,
      title: item.name,
      subtitle: `${item.document_count} 文档 · ${item.bucket_count} 桶`,
      status: item.status,
    })),
  ], [generalSkills, knowledgeBases, skills]);

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!selectedAgent) {
      setDraftResources([]);
      form.resetFields();
      return;
    }
    setDraftResources(selectedAgent.resources || []);
    form.setFieldsValue({
      name: selectedAgent.name,
      description: selectedAgent.description || '',
      persona_prompt: selectedAgent.persona_prompt || '',
    });
  }, [form, selectedAgent]);

  async function refresh() {
    setLoading(true);
    try {
      const [agentRows, skillRows, generalSkillRows, knowledgeBaseRows] = await Promise.all([
        api.get<AgentProfileRead[]>(`/api/enterprise/agents?tenant_id=${TENANT_ID}`),
        api.get<SkillRead[]>(`/api/enterprise/skills?tenant_id=${TENANT_ID}`),
        api.get<GeneralSkillRead[]>(`/api/enterprise/general-skills?tenant_id=${TENANT_ID}`),
        api.get<KnowledgeBaseRead[]>(`/api/enterprise/knowledge-bases?tenant_id=${TENANT_ID}`),
      ]);
      setAgents(agentRows);
      setSkills(skillRows);
      setGeneralSkills(generalSkillRows);
      setKnowledgeBases(knowledgeBaseRows);
      setSelectedAgentId((current) => current && agentRows.some((item) => item.id === current) ? current : agentRows[0]?.id || '');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载智能体失败');
    } finally {
      setLoading(false);
    }
  }

  async function createAgent() {
    try {
      const row = await api.post<AgentProfileRead>('/api/enterprise/agents', {
        tenant_id: TENANT_ID,
        name: `业务智能体 ${agents.filter((item) => !item.is_overall).length + 1}`,
        description: '仅暴露所选技能、通用技能和知识库。',
        persona_prompt: '',
      });
      setAgents((prev) => [row, ...prev]);
      setSelectedAgentId(row.id);
      message.success('已创建智能体');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '创建智能体失败');
    }
  }

  async function saveAgent() {
    if (!selectedAgent) return;
    const values = await form.validateFields();
    try {
      const updated = await api.put<AgentProfileRead>(`/api/enterprise/agents/${selectedAgent.id}`, {
        tenant_id: TENANT_ID,
        name: values.name,
        description: values.description,
        persona_prompt: values.persona_prompt,
        status: selectedAgent.status,
      });
      setAgents((prev) => prev.map((item) => (item.id === updated.id ? { ...updated, resources: item.resources } : item)));
      message.success('已保存智能体');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存智能体失败');
    }
  }

  async function saveResources() {
    if (!selectedAgent || selectedAgent.is_overall) return;
    try {
      const rows = await api.put<AgentResourceBindingRead[]>(`/api/enterprise/agents/${selectedAgent.id}/resources`, {
        tenant_id: TENANT_ID,
        resources: draftResources.map((item) => ({
          resource_type: item.resource_type,
          resource_id: item.resource_id,
          status: item.status === 'inactive' ? 'inactive' : 'active',
          metadata: item.metadata || {},
        })),
      });
      setAgents((prev) => prev.map((item) => (item.id === selectedAgent.id ? { ...item, resources: rows } : item)));
      setDraftResources(rows);
      message.success('已更新可视域');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新可视域失败');
    }
  }

  function removeAgent(agent: AgentProfileRead) {
    if (agent.is_overall) return;
    Modal.confirm({
      title: `删除智能体「${agent.name}」？`,
      content: '只删除这个智能体配置，不删除全局资源池中的技能、通用技能或知识库。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await api.delete(`/api/enterprise/agents/${agent.id}?tenant_id=${TENANT_ID}`);
        message.success('已删除智能体');
        await refresh();
      },
    });
  }

  function bindingFor(resource: ResourceItem) {
    return draftResources.find((item) => item.resource_type === resource.type && item.resource_id === resource.id);
  }

  function toggleResource(resource: ResourceItem, checked: boolean) {
    if (!selectedAgent || selectedAgent.is_overall) return;
    setDraftResources((prev) => {
      const existing = prev.find((item) => item.resource_type === resource.type && item.resource_id === resource.id);
      if (existing) {
        return prev.map((item) =>
          item.id === existing.id ? { ...item, status: checked ? 'active' : 'inactive' } : item,
        );
      }
      return [
        ...prev,
        {
          id: `${resource.type}:${resource.id}`,
          tenant_id: TENANT_ID,
          agent_id: selectedAgent.id,
          resource_type: resource.type,
          resource_id: resource.id,
          status: checked ? 'active' : 'inactive',
          metadata: {},
          created_at: '',
          updated_at: '',
        },
      ];
    });
  }

  return (
    <div className="agents-page">
      <div className="page-hero agents-hero">
        <div>
          <Typography.Title level={3}>智能体</Typography.Title>
          <Typography.Text type="secondary">
            每个智能体定义模型可见域：场景技能、通用技能、知识库和专属人设。
          </Typography.Text>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void refresh()}>刷新</Button>
          <Button type="primary" icon={<RobotOutlined />} onClick={() => void createAgent()}>新增智能体</Button>
        </Space>
      </div>

      <Row gutter={[18, 18]} align="stretch">
        <Col xs={24} lg={7}>
          <Card className="agent-card agent-list-card">
            {agents.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无智能体" />
            ) : (
              <Space direction="vertical" size={10} className="agent-list">
                {agents.map((agent) => (
                  <button
                    type="button"
                    key={agent.id}
                    className={`agent-list-item ${agent.id === selectedAgent?.id ? 'active' : ''}`}
                    onClick={() => setSelectedAgentId(agent.id)}
                  >
                    <span className="agent-list-icon"><RobotOutlined /></span>
                    <span className="agent-list-main">
                      <strong>{agent.name}</strong>
                      <small>{agent.is_overall ? '整体资源池' : agent.description || '普通智能体'}</small>
                    </span>
                    <Tag color={agent.is_overall ? 'gold' : agent.status === 'active' ? 'green' : 'default'}>
                      {agent.is_overall ? '整体' : agent.status === 'active' ? '在线' : '下线'}
                    </Tag>
                  </button>
                ))}
              </Space>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={17}>
          {!selectedAgent ? (
            <Card className="agent-card"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择智能体" /></Card>
          ) : (
            <Space direction="vertical" size={18} className="agent-detail-stack">
              <Card
                className="agent-card"
                title={selectedAgent.is_overall ? '整体智能体' : '智能体配置'}
                extra={!selectedAgent.is_overall && (
                  <Space>
                    <Button icon={<SaveOutlined />} onClick={() => void saveAgent()}>保存</Button>
                    <Button danger icon={<DeleteOutlined />} onClick={() => removeAgent(selectedAgent)}>删除</Button>
                  </Space>
                )}
              >
                {selectedAgent.is_overall ? (
                  <Typography.Paragraph type="secondary">
                    整体智能体代表全局资源池。Chat 端不会展示它；全局删除资源仍在对应的技能、通用技能或知识管理页面完成。
                  </Typography.Paragraph>
                ) : (
                  <Form layout="vertical" form={form}>
                    <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
                      <Input />
                    </Form.Item>
                    <Form.Item name="description" label="描述">
                      <Input />
                    </Form.Item>
                    <Form.Item name="persona_prompt" label="专属人设">
                      <Input.TextArea rows={4} placeholder="仅这个智能体可见的人设补充" />
                    </Form.Item>
                  </Form>
                )}
              </Card>

              <Card
                className="agent-card"
                title="可视域"
                extra={!selectedAgent.is_overall && <Button icon={<SaveOutlined />} onClick={() => void saveResources()}>保存可视域</Button>}
              >
                <ResourceSummary resources={selectedAgent.is_overall ? catalog : draftResources} catalog={catalog} />
                <div className="agent-resource-grid">
                  {catalog.map((resource) => {
                    const binding = bindingFor(resource);
                    const checked = selectedAgent.is_overall || binding?.status === 'active';
                    return (
                      <div className="agent-resource-card" key={`${resource.type}:${resource.id}`}>
                        <div className="agent-resource-icon">{resourceIcon(resource.type)}</div>
                        <div className="agent-resource-body">
                          <Space size={8} wrap>
                            <Typography.Text strong>{resource.title}</Typography.Text>
                            <Tag>{RESOURCE_LABEL[resource.type]}</Tag>
                            <Tag color={resource.status === 'published' || resource.status === 'active' ? 'green' : 'default'}>
                              {resource.status}
                            </Tag>
                          </Space>
                          <Typography.Text type="secondary" ellipsis>{resource.subtitle}</Typography.Text>
                        </div>
                        <Switch
                          checked={checked}
                          disabled={selectedAgent.is_overall}
                          checkedChildren="上线"
                          unCheckedChildren="下线"
                          onChange={(value) => toggleResource(resource, value)}
                        />
                      </div>
                    );
                  })}
                </div>
              </Card>
            </Space>
          )}
        </Col>
      </Row>
    </div>
  );
}

function ResourceSummary({
  resources,
  catalog,
}: {
  resources: Array<AgentResourceBindingRead | ResourceItem>;
  catalog: ResourceItem[];
}) {
  const activeResources = resources.filter((item) => 'resource_id' in item ? item.status === 'active' : true);
  const counts: Record<AgentResourceType, number> = { skill: 0, general_skill: 0, knowledge_base: 0 };
  activeResources.forEach((item) => {
    const type = ('resource_type' in item ? item.resource_type : item.type) as AgentResourceType;
    counts[type] += 1;
  });
  return (
    <Segmented
      className="agent-resource-summary"
      value="summary"
      options={[
        { label: `场景技能 ${counts.skill}/${catalog.filter((item) => item.type === 'skill').length}`, value: 'summary' },
        { label: `通用技能 ${counts.general_skill}/${catalog.filter((item) => item.type === 'general_skill').length}`, value: 'general' },
        { label: `知识库 ${counts.knowledge_base}/${catalog.filter((item) => item.type === 'knowledge_base').length}`, value: 'knowledge' },
      ]}
    />
  );
}

function resourceIcon(type: AgentResourceType) {
  if (type === 'skill') return <ProfileOutlined />;
  if (type === 'general_skill') return <ThunderboltOutlined />;
  return <DatabaseOutlined />;
}
