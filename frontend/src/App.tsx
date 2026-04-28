import { useEffect, useState } from 'react';
import { DashboardOutlined, LogoutOutlined, MenuOutlined, UserOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { Button, Drawer, Layout, Menu, Typography, message } from 'antd';
import type { MenuProps } from 'antd';
import { api, type User } from './api/client';
import { AuthGate } from './components/AuthGate';
import { Dashboard } from './pages/Dashboard';
import { Cameras } from './pages/Cameras';
import { Users } from './pages/Users';

type Page = 'dashboard' | 'cameras' | 'users';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('budcam_token'));
  const [me, setMe] = useState<User | null>(null);
  const [page, setPage] = useState<Page>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dashboardFullscreen, setDashboardFullscreen] = useState(true);

  const logout = () => {
    localStorage.removeItem('budcam_token');
    setToken(null);
    setMe(null);
  };

  useEffect(() => {
    const listener = () => logout();
    window.addEventListener('budcam:logout', listener);
    return () => window.removeEventListener('budcam:logout', listener);
  }, []);

  useEffect(() => {
    if (!token) return;
    api
      .get('/auth/me')
      .then((res) => setMe(res.data))
      .catch(() => {
        message.warning('会话已过期，请重新登录');
        logout();
      });
  }, [token]);

  if (!token) return <AuthGate onAuthed={() => setToken(localStorage.getItem('budcam_token'))} />;

  const items: MenuProps['items'] = [
    { key: 'dashboard', icon: <DashboardOutlined />, label: '监控大屏' },
    ...(me?.is_admin ? [{ key: 'cameras', icon: <VideoCameraOutlined />, label: '摄像头管理' }] : []),
    ...(me?.is_admin ? [{ key: 'users', icon: <UserOutlined />, label: '用户管理' }] : []),
  ];

  const selectPage = (key: string) => {
    const nextPage = key as Page;
    setPage(nextPage);
    setDashboardFullscreen(nextPage === 'dashboard');
    setMobileMenuOpen(false);
  };

  const isDashboardFullscreen = page === 'dashboard' && dashboardFullscreen;

  return (
    <Layout className={`app-shell ${isDashboardFullscreen ? 'dashboard-fullscreen' : ''}`}>
      {!isDashboardFullscreen && <Layout.Sider width={236} className="side">
        <div className="brand">
          <img src="/logo.png" alt="BudCam" />
          <span>BudCam</span>
        </div>
        <Menu theme="dark" mode="inline" selectedKeys={[page]} items={items} onClick={(e) => selectPage(e.key)} />
      </Layout.Sider>}
      <Layout>
        {!isDashboardFullscreen && <Layout.Header className="topbar">
          <Button className="mobile-menu-btn" icon={<MenuOutlined />} onClick={() => setMobileMenuOpen(true)} />
          <div className="mobile-brand">
            <img src="/logo.png" alt="BudCam" />
            <span>BudCam</span>
          </div>
          <Typography.Text strong>{me?.username}</Typography.Text>
          <Button icon={<LogoutOutlined />} onClick={logout}>
            退出
          </Button>
        </Layout.Header>}
        <Layout.Content className="content">
          {page === 'dashboard' && <Dashboard fullscreen={dashboardFullscreen} onFullscreenChange={setDashboardFullscreen} />}
          {page === 'cameras' && <Cameras isAdmin={!!me?.is_admin} />}
          {page === 'users' && me?.is_admin && <Users />}
        </Layout.Content>
      </Layout>
      <Drawer title="BudCam" placement="left" open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} className="mobile-drawer">
        <Menu mode="inline" selectedKeys={[page]} items={items} onClick={(e) => selectPage(e.key)} />
      </Drawer>
    </Layout>
  );
}
