import { useEffect, useState } from 'react';
import { Button, Form, Grid, Input, Modal, Select, Switch, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { api, type Camera, type User } from '../api/client';

export function Users() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [users, setUsers] = useState<User[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [open, setOpen] = useState(false);
  const [passwordUser, setPasswordUser] = useState<User | null>(null);
  const [form] = Form.useForm();
  const [pwdForm] = Form.useForm();

  const load = () => {
    api.get('/users').then((res) => setUsers(res.data));
    api.get('/cameras').then((res) => setCameras(res.data));
  };

  useEffect(() => {
    load();
  }, []);

  const add = async (values: { username: string; password: string; is_admin?: boolean; camera_ids?: number[] }) => {
    await api.post('/users', { ...values, is_admin: !!values.is_admin, camera_ids: values.camera_ids || [] });
    message.success('用户已添加');
    setOpen(false);
    form.resetFields();
    load();
  };

  const cameraOptions = cameras.map((camera) => ({ label: camera.name, value: camera.id }));

  const renderPermissionSelect = (user: User) => (
    <Select
      mode="multiple"
      value={user.camera_ids}
      className="permission-select"
      disabled={user.is_admin}
      options={cameraOptions}
      onChange={(camera_ids) => api.put(`/users/${user.id}/cameras`, { camera_ids }).then(load)}
    />
  );

  const columns: ColumnsType<User> = [
    { title: '用户名', dataIndex: 'username' },
    { title: '管理员', dataIndex: 'is_admin', render: (v) => (v ? '是' : '否') },
    {
      title: '摄像头权限',
      dataIndex: 'camera_ids',
      render: (_, user) => renderPermissionSelect(user),
    },
    {
      title: '操作',
      render: (_, user) => (
        <Button size="small" onClick={() => setPasswordUser(user)}>
          修改密码
        </Button>
      ),
    },
  ];

  return (
    <section>
      <div className="section-head">
        <h2>用户管理</h2>
        <div className="section-actions">
          <Button type="primary" onClick={() => setOpen(true)}>
            添加用户
          </Button>
        </div>
      </div>
      {isMobile ? (
        <div className="responsive-card-list">
          {users.map((user) => (
            <article key={user.id} className="entity-card">
              <div className="entity-card-head">
                <div>
                  <h3>{user.username}</h3>
                  <div className="entity-card-subtitle">
                    {user.is_admin ? '管理员账号' : '普通账号'}
                  </div>
                </div>
                {user.is_admin ? <Tag color="gold">管理员</Tag> : <Tag>普通用户</Tag>}
              </div>
              <div className="entity-field">
                <span className="entity-label">摄像头权限</span>
                {user.is_admin ? (
                  <span className="entity-value">管理员默认拥有全部摄像头权限</span>
                ) : (
                  renderPermissionSelect(user)
                )}
              </div>
              <div className="entity-actions">
                <Button onClick={() => setPasswordUser(user)}>修改密码</Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Table rowKey="id" dataSource={users} columns={columns} scroll={{ x: 760 }} />
      )}
      <Modal
        title="添加用户"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        destroyOnClose
        width={isMobile ? 'calc(100vw - 24px)' : 520}
      >
        <Form form={form} layout="vertical" onFinish={add}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, min: 3 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, min: 6 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="is_admin" label="管理员" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="camera_ids" label="摄像头权限">
            <Select mode="multiple" options={cameraOptions} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={`修改密码：${passwordUser?.username || ''}`}
        open={!!passwordUser}
        onCancel={() => setPasswordUser(null)}
        onOk={() => pwdForm.submit()}
        destroyOnClose
        width={isMobile ? 'calc(100vw - 24px)' : 520}
      >
        <Form
          form={pwdForm}
          layout="vertical"
          onFinish={async ({ password }) => {
            await api.put(`/users/${passwordUser!.id}/password`, { password });
            message.success('密码已修改');
            setPasswordUser(null);
          }}
        >
          <Form.Item name="password" label="新密码" rules={[{ required: true, min: 6 }]}>
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </section>
  );
}
