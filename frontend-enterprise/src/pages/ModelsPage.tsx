import { ApiOutlined, CheckCircleFilled, CheckOutlined, ExperimentOutlined, PlusOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, InputNumber, Space, Switch, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';
import { api, TENANT_ID } from '../api/client';
import type { ModelConfigRead } from '../types';

export default function ModelsPage() {
  const [rows, setRows] = useState<ModelConfigRead[]>([]);
  const [selected, setSelected] = useState<ModelConfigRead | null>(null);
  const [form] = Form.useForm();

  const load = () =>
    api
      .get<ModelConfigRead[]>(`/api/enterprise/model-configs?tenant_id=${TENANT_ID}`)
      .then(setRows)
      .catch((error) => message.error(error.message));

  useEffect(() => {
    load();
  }, []);

  function edit(row: ModelConfigRead) {
    setSelected(row);
    form.setFieldsValue({ ...row, api_key: '' });
  }

  function createBlank() {
    setSelected(null);
    form.resetFields();
    form.setFieldsValue({ provider: 'openai_compatible', temperature: 0.2, max_output_tokens: 2048, enabled: true });
  }

  async function save() {
    const values = await form.validateFields();
    const payload = { ...values, tenant_id: TENANT_ID, api_key: values.api_key || undefined };
    if (selected) {
      await api.put(`/api/enterprise/model-configs/${selected.id}`, payload);
    } else {
      await api.post('/api/enterprise/model-configs', payload);
    }
    message.success('已保存');
    setSelected(null);
    form.resetFields();
    load();
  }

  async function setDefault(row: ModelConfigRead) {
    await api.post(`/api/enterprise/model-configs/${row.id}/set-default?tenant_id=${TENANT_ID}`);
    message.success('已设为默认');
    load();
  }

  async function test(row: ModelConfigRead) {
    const result = await api.post<{ success: boolean; message: string; output?: string }>(
      `/api/enterprise/model-configs/${row.id}/test?tenant_id=${TENANT_ID}`,
    );
    result.success ? message.success(result.output || result.message) : message.error(result.message);
  }

  const columns: ColumnsType<ModelConfigRead> = [
    {
      title: '名称',
      dataIndex: 'name',
      width: 260,
      render: (_, row) => (
        <div className={`model-name-cell ${row.is_default ? 'is-default' : ''}`}>
          <span className="model-default-indicator" aria-hidden={!row.is_default}>
            {row.is_default ? (
              <>
                <CheckCircleFilled />
                默认
              </>
            ) : null}
          </span>
          <div className="model-name-main">
            <strong>{row.name}</strong>
            <span>{row.enabled ? '已启用' : '已停用'} · {row.provider}</span>
          </div>
        </div>
      ),
    },
    { title: '模型', dataIndex: 'model', width: 180, ellipsis: true },
    { title: 'Base URL', dataIndex: 'base_url', width: 240, ellipsis: true },
    {
      title: 'API Key',
      dataIndex: 'api_key_masked',
      width: 180,
      render: (value) => <span className="code-cell">{value || '-'}</span>,
    },
    {
      title: '操作',
      width: 230,
      render: (_, row) => (
        <span className="table-actions">
          <Button size="small" onClick={() => edit(row)}>编辑</Button>
          <Button size="small" icon={<CheckOutlined />} disabled={row.is_default} onClick={() => setDefault(row)}>
            {row.is_default ? '已默认' : '设为默认'}
          </Button>
          <Button size="small" icon={<ExperimentOutlined />} onClick={() => test(row)}>测试</Button>
        </span>
      ),
    },
  ];

  const enabledCount = rows.filter((item) => item.enabled).length;
  const defaultRow = rows.find((item) => item.is_default);
  const providerCount = new Set(rows.map((item) => item.provider).filter(Boolean)).size;

  return (
    <div className="page model-config-page">
      <div className="page-title">
        <div>
          <Typography.Title level={3}>模型</Typography.Title>
          <Typography.Text type="secondary">配置平台使用的 AI 模型，支持接入任何 OpenAI 兼容接口。</Typography.Text>
        </div>
        <Space className="page-actions">
          <Button icon={<ReloadOutlined />} onClick={() => load()}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={createBlank}>新建模型</Button>
        </Space>
      </div>

      <div className="compact-metric-strip model-config-stats">
        <MetricItem label="模型" value={rows.length} />
        <MetricItem label="已启用" value={enabledCount} />
        <MetricItem label="默认模型" value={defaultRow?.name || '-'} />
        <MetricItem label="Provider" value={providerCount} />
      </div>

      <Card className="data-card model-list-card" title="模型列表">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={rows}
          pagination={{ pageSize: 8 }}
          rowClassName={(row) => (row.is_default ? 'model-default-row' : '')}
          scroll={{ x: 940 }}
          size="middle"
        />
      </Card>

      <Card className="editor-card model-editor-card" title={selected ? `编辑模型：${selected.name}` : '新建模型'}>
        <Form form={form} layout="vertical" initialValues={{ provider: 'openai_compatible', temperature: 0.2, max_output_tokens: 2048, enabled: true }}>
          <div className="model-form-grid">
            <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input prefix={<ApiOutlined />} /></Form.Item>
            <Form.Item name="provider" label="Provider" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="base_url" label="Base URL"><Input /></Form.Item>
            <Form.Item name="model" label="Model" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="api_key" label="API Key"><Input.Password placeholder={selected ? '不修改请留空' : undefined} /></Form.Item>
            <div className="form-number-row model-number-row">
              <Form.Item name="temperature" label="Temperature"><InputNumber min={0} max={2} step={0.1} /></Form.Item>
              <Form.Item name="max_output_tokens" label="Max Tokens"><InputNumber min={128} max={32000} /></Form.Item>
            </div>
          </div>
          <div className="model-switch-row">
            <Form.Item name="is_default" label="设为默认" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
          </div>
          <div className="form-actions">
            <Button type="primary" icon={<SaveOutlined />} onClick={save}>保存</Button>
            <Button onClick={createBlank}>清空</Button>
          </div>
        </Form>
      </Card>
    </div>
  );
}

function MetricItem({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="compact-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
