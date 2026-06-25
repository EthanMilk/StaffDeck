import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { Button, Form, Input, Typography, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TENANT_ID, api, getAuthSession, setAuthSession } from '../api/client';
import type { AuthSession } from '../api/client';

type LoginValues = {
  tenant_id: string;
  username: string;
  password: string;
  display_name?: string;
};

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = useMemo(() => {
    const state = location.state as { from?: unknown } | null;
    return typeof state?.from === 'string' && state.from && state.from !== '/login' ? state.from : '/';
  }, [location.state]);

  useEffect(() => {
    if (getAuthSession()) {
      navigate(redirectTo, { replace: true });
    }
  }, [navigate, redirectTo]);

  async function login(values: LoginValues) {
    setLoading(true);
    try {
      const result = await api.post<AuthSession>('/api/auth/login', values);
      setAuthSession(result);
      message.success('登录成功');
      navigate(redirectTo, { replace: true });
    } catch (error) {
      message.error(error instanceof Error ? error.message : '登录失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-shell">
        <div className="login-brand">
          <span className="brand-mark">SA</span>
          <div>
            <Typography.Title level={3}>UltraRAG4</Typography.Title>
          </div>
        </div>
        <Form<LoginValues>
          layout="vertical"
          initialValues={{ tenant_id: TENANT_ID }}
          onFinish={login}
        >
          <Form.Item name="tenant_id" label="租户" rules={[{ required: true, message: '请输入租户' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
          </Form.Item>
          <Form.Item name="display_name" label="显示名">
            <Input placeholder="可选" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            登录
          </Button>
        </Form>
      </div>
    </div>
  );
}
