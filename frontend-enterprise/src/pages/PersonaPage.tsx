import { SaveOutlined, UserOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, InputNumber, Switch, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { api, TENANT_ID } from '../api/client';
import type { PersonaRead, UIConfigRead } from '../types';

function formatDateOnly(value: string): string {
  const normalized = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

export default function PersonaPage() {
  const [form] = Form.useForm();
  const [uiForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [uiLoading, setUiLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState('');
  const [uiUpdatedAt, setUiUpdatedAt] = useState('');

  useEffect(() => {
    api
      .get<PersonaRead>(`/api/enterprise/persona?tenant_id=${TENANT_ID}`)
      .then((row) => {
        form.setFieldsValue({ system_prompt: row.system_prompt });
        setUpdatedAt(row.updated_at);
      })
      .catch((error) => message.error(error.message));
    api
      .get<UIConfigRead>(`/api/enterprise/ui-config?tenant_id=${TENANT_ID}`)
      .then((row) => {
        uiForm.setFieldsValue(row);
        setUiUpdatedAt(row.updated_at);
      })
      .catch((error) => message.error(error.message));
  }, [form, uiForm]);

  async function save() {
    setLoading(true);
    try {
      const values = await form.validateFields();
      const row = await api.put<PersonaRead>('/api/enterprise/persona', {
        tenant_id: TENANT_ID,
        system_prompt: values.system_prompt,
      });
      setUpdatedAt(row.updated_at);
      message.success('人设已保存');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setLoading(false);
    }
  }

  async function saveUiConfig() {
    setUiLoading(true);
    try {
      const values = await uiForm.validateFields();
      const row = await api.put<UIConfigRead>('/api/enterprise/ui-config', {
        tenant_id: TENANT_ID,
        show_thinking_trace: values.show_thinking_trace,
        show_skill_trace: values.show_skill_trace,
        show_tool_trace: values.show_tool_trace,
        reflection_max_rounds: values.reflection_max_rounds,
        agent_loop_max_actions: values.agent_loop_max_actions,
      });
      setUiUpdatedAt(row.updated_at);
      message.success('展示设置已保存');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setUiLoading(false);
    }
  }

  return (
    <>
      <div className="page-title">
        <Typography.Title level={3}>人设</Typography.Title>
        <Button type="primary" icon={<SaveOutlined />} loading={loading} onClick={save}>保存</Button>
      </div>
      <Card className="editor-card" title={<><UserOutlined /> System Prompt</>}>
        <Form form={form} layout="vertical">
          <Form.Item name="system_prompt" label="人设 Prompt" rules={[{ required: true }]}>
            <Input.TextArea className="persona-editor" rows={12} />
          </Form.Item>
        </Form>
        {updatedAt && <Typography.Text type="secondary">最后更新：{formatDateOnly(updatedAt)}</Typography.Text>}
      </Card>
      <Card className="editor-card settings-card" title="Agent 与展示设置">
        <Form
          form={uiForm}
          layout="vertical"
          initialValues={{
            show_thinking_trace: true,
            show_skill_trace: true,
            show_tool_trace: true,
            reflection_max_rounds: 1,
            agent_loop_max_actions: 6,
          }}
        >
          <Form.Item
            name="show_thinking_trace"
            label="展示思考状态"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="show_skill_trace"
            label="展示执行技能"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="show_tool_trace"
            label="展示工具调用"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="reflection_max_rounds"
            label="反思轮数"
            tooltip="设为 0 时关闭反思；每轮允许模型检查当前技能和工具结果，并决定是否重试其他技能或工具。"
            rules={[{ required: true, type: 'number', min: 0, max: 5 }]}
          >
            <InputNumber min={0} max={5} step={1} precision={0} />
          </Form.Item>
          <Form.Item
            name="agent_loop_max_actions"
            label="单轮 Agent 最大动作数"
            tooltip="控制一次用户输入内模型可连续决策和调用工具的最大次数，用于避免无限循环。"
            rules={[{ required: true, type: 'number', min: 1, max: 20 }]}
          >
            <InputNumber min={1} max={20} step={1} precision={0} />
          </Form.Item>
          <Button type="primary" icon={<SaveOutlined />} loading={uiLoading} onClick={saveUiConfig}>
            保存设置
          </Button>
        </Form>
        {uiUpdatedAt && <Typography.Text type="secondary">最后更新：{formatDateOnly(uiUpdatedAt)}</Typography.Text>}
      </Card>
    </>
  );
}
