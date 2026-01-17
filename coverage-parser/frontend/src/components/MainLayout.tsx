import { Layout, Menu } from 'antd';
import { 
  HomeOutlined, 
  EditOutlined, 
  DatabaseOutlined, 
  BookOutlined,
  FileTextOutlined,
  SafetyOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import './MainLayout.css';

const { Sider, Content } = Layout;

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems: any[] = [
    {
      key: '/',
      icon: <HomeOutlined />,
      label: '首页',
    },
    {
      key: '/my-policies',
      icon: <FileTextOutlined />,
      label: '我家的保单',
    },
    {
      key: '/smart-input',
      icon: <EditOutlined />,
      label: '保单智能录入',
    },
    {
      key: '/diagnosis',
      icon: <SafetyOutlined />,
      label: '家庭保障诊断',
    },
    {
      type: 'divider' as const,
    },
    {
      key: '/products',
      icon: <DatabaseOutlined />,
      label: '保险产品库',
    },
    {
      key: '/coverage-library',
      icon: <BookOutlined />,
      label: '责任库管理',
    },
  ];

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={200}
        style={{
          background: 'hsl(0 0% 100%)', /* sidebar-background */
          borderRight: '1px solid hsl(210 20% 94%)', /* sidebar-border */
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          overflow: 'auto',
        }}
      >
        <div className="logo-container">
          <div className="logo-icon">
            <span style={{ fontSize: '28px' }}>🏠</span>
          </div>
          <div className="logo-text">家庭保单管家</div>
        </div>
        
        {/* 蓝色横线分隔 */}
        <div style={{
          height: '3px',
          background: '#01BCD6',
          margin: '0'
        }} />
        
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          onClick={handleMenuClick}
          items={menuItems}
          style={{
            background: 'transparent',
            border: 'none',
          }}
          className="sidebar-menu"
        />
      </Sider>
      
      <Layout style={{ marginLeft: 200 }}>
        <Content
          style={{
            padding: 0,
            background: '#f0f8fc',
            minHeight: '100vh',
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;

