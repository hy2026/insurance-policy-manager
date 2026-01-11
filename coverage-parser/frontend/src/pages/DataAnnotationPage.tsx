import { Card, Typography } from 'antd'

const { Title, Text } = Typography

export default function DataAnnotationPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <Title level={3} style={{ margin: 0, color: '#5FC8D4' }}>
            ✏️ 数据标注审核
          </Title>
          <Text type="secondary">审核和标注训练数据</Text>
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
































