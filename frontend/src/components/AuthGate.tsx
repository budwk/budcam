import { useEffect, useState } from 'react';
import { Button, Card, Form, Input, Typography, message } from 'antd';
import { api } from '../api/client';

export function AuthGate({ onAuthed }: { onAuthed: () => void }) {
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/auth/bootstrap').then((res) => setInitialized(res.data.initialized));
  }, []);

  const submit = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const endpoint = initialized ? '/auth/login' : '/auth/init';
      const res = await api.post(endpoint, values);
      localStorage.setItem('budcam_token', res.data.access_token);
      onAuthed();
    } catch (err: any) {
      message.error(err.response?.data?.detail || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <Card className="auth-card">
        <img src="/logo.png" alt="BudCam" className="auth-logo" />
        <Typography.Title level={2}>{initialized ? '登录 BudCam' : '初始化管理员'}</Typography.Title>
        <Typography.Paragraph type="secondary">
          {initialized ? '请输入账号密码进入监控平台。' : '首次访问需要创建管理员账号。'}
        </Typography.Paragraph>
        <Form layout="vertical" onFinish={submit}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, min: 3 }]}>
            <Input autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, min: 6 }]}>
            <Input.Password autoComplete={initialized ? 'current-password' : 'new-password'} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            {initialized ? '登录' : '创建并进入'}
          </Button>
        </Form>
      </Card>
    </main>
  );
}

