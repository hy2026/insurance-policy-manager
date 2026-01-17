import { Card, List, Tag, Button, Space, Popconfirm, Typography, Empty } from 'antd'
import { EditOutlined, DeleteOutlined } from '@ant-design/icons'
import type { Coverage } from '@/types'

const { Text } = Typography

interface Props {
  coverages: Coverage[]
  onEdit?: (coverage: Coverage, index: number) => void
  onDelete?: (index: number) => void
}

export default function CoverageList({ coverages, onEdit, onDelete }: Props) {
  if (coverages.length === 0) {
    return (
      <Empty
        description="暂无责任数据"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    )
  }

  return (
    <List
      dataSource={coverages}
      renderItem={(coverage, index) => (
        <Card
          key={coverage.id || index}
          style={{ 
            marginBottom: 16, 
            border: '1px solid #e8e8e8',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
          }}
          bodyStyle={{ padding: 16 }}
          extra={
            <Space>
              {onEdit && (
              <Button
                  type="primary"
                size="small"
                icon={<EditOutlined />}
                onClick={() => onEdit(coverage, index)}
              >
                编辑
              </Button>
              )}
              {onDelete && (
              <Popconfirm
                title="确定删除该责任吗？"
                onConfirm={() => onDelete(index)}
                okText="确定"
                cancelText="取消"
              >
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                >
                  删除
                </Button>
              </Popconfirm>
              )}
            </Space>
          }
        >
          {/* 标题行 */}
          <div style={{ marginBottom: 12 }}>
              <Space>
              <Text strong style={{ fontSize: 16 }}>{coverage.name}</Text>
                <Tag color="blue">{getCoverageTypeText(coverage.type)}</Tag>
                {coverage.policyType && (
                  <Tag color="green">{getPolicyTypeText(coverage.policyType)}</Tag>
                )}
              </Space>
          </div>

          {/* 解析信息 */}
          <Space style={{ marginBottom: 12 }}>
            <Tag color={(coverage.result.overallConfidence ?? 0) >= 0.8 ? 'success' : 'warning'}>
                    置信度: {((coverage.result.overallConfidence ?? 0) * 100).toFixed(0)}%
            </Tag>
            <Tag color="blue">
              {coverage.result.parseMethod === 'llm' ? 'AI解析' : '规则解析'}
            </Tag>
                  {coverage.createdAt && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      创建时间: {new Date(coverage.createdAt).toLocaleString()}
                    </Text>
                  )}
                </Space>

          {/* 条款文本 */}
          <div style={{ 
            padding: 12, 
            background: '#f5f5f5', 
            borderRadius: 4,
            borderLeft: '3px solid #1890ff',
            marginBottom: 12
          }}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {coverage.clause.length > 150 
                ? `${coverage.clause.substring(0, 150)}...` 
                : coverage.clause}
            </Text>
          </div>

          {/* 关键字段预览 */}
          <Space wrap>
            {coverage.result.payoutCount && (
              <Tag icon={<Text>🔢</Text>}>
                {coverage.result.payoutCount.type === 'single' ? '单次赔付' : 
                 coverage.result.payoutCount.maxCount ? `最多${coverage.result.payoutCount.maxCount}次` : 
                 '不限次数'}
              </Tag>
            )}
            {coverage.result.intervalPeriod?.hasInterval && (
              <Tag icon={<Text>⏱️</Text>}>
                间隔期{coverage.result.intervalPeriod.days}天
              </Tag>
            )}
            {coverage.result.grouping?.isGrouped && (
              <Tag icon={<Text>📊</Text>}>
                {coverage.result.grouping.groupCount}组
              </Tag>
            )}
            {coverage.result.repeatablePayout?.isRepeatable && (
              <Tag icon={<Text>🔄</Text>} color="green">可重复赔付</Tag>
            )}
            {coverage.result.premiumWaiver?.isWaived && (
              <Tag icon={<Text>✋</Text>} color="orange">保费豁免</Tag>
            )}
              </Space>
        </Card>
      )}
    />
  )
}

function getCoverageTypeText(type: string): string {
  const map: Record<string, string> = {
    disease: '疾病责任',
    death: '身故责任',
    accident: '意外责任',
    annuity: '年金责任',
  }
  return map[type] || type
}

function getPolicyTypeText(type: string): string {
  const map: Record<string, string> = {
    critical_illness: '重疾险',
    life: '人寿险',
    accident: '意外险',
    annuity: '年金险',
  }
  return map[type] || type
}



