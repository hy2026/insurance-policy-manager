import { Card, Typography } from 'antd'

const { Title, Text } = Typography

export default function ProductLibraryPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <Title level={3} style={{ margin: 0, color: '#5FC8D4' }}>
            📚 产品库管理
          </Title>
          <Text type="secondary">管理保险产品信息</Text>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <Card>
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#999' }}>
            功能开发中，敬请期待...
          </div>
        </Card>
      </div>
    </div>
  )
}
































