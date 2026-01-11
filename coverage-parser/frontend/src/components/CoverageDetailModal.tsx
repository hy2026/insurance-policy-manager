import { Modal, Descriptions, Card, Tag, Collapse, Typography, Space, Switch } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { useState } from 'react'

const { Panel } = Collapse
const { Text, Paragraph } = Typography

interface CoverageDetailModalProps {
  visible: boolean
  item: any | null
  onClose: () => void
}

export default function CoverageDetailModal({ visible, item, onClose }: CoverageDetailModalProps) {
  const [showFullJson, setShowFullJson] = useState(false)
  
  if (!item) return null

  const parsedResult = item.parsedResult || {}
  const payoutAmount = item.payoutAmount || parsedResult.payoutAmount || []
  const naturalLanguageDesc = item.naturalLanguageDesc || []
  
  // 简化JSON：移除在表格中已显示的重复字段
  const getSimplifiedJson = () => {
    const simplified = { ...parsedResult }
    // 移除重复字段
    delete simplified.序号
    delete simplified.保单ID号
    delete simplified.责任原文
    delete simplified.责任名称
    delete simplified.责任类型
    return simplified
  }
  
  const displayJson = showFullJson ? parsedResult : getSimplifiedJson()

  return (
    <Modal
      title="责任详情"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={1200}
      style={{ top: 20 }}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* 责任原文 */}
        <Card title="责任原文" size="small">
          <Paragraph
            style={{
              maxHeight: '400px',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              padding: '12px',
              background: '#fafafa',
              borderRadius: '4px'
            }}
          >
            {item.责任原文 || item.clauseText || '-'}
          </Paragraph>
        </Card>

        {/* 完整JSON */}
        <Card 
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>解析结果（JSON）</span>
              <Space>
                <Text type="secondary" style={{ fontSize: '12px' }}>显示完整JSON</Text>
                <Switch 
                  checked={showFullJson} 
                  onChange={setShowFullJson}
                  size="small"
                />
              </Space>
            </div>
          }
          size="small"
        >
          <pre
            style={{
              padding: '16px',
              borderRadius: '4px',
              backgroundColor: '#f5f5f5',
              border: '1px solid #d9d9d9',
              maxHeight: '500px',
              overflow: 'auto',
              fontSize: '12px',
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}
          >
            {JSON.stringify(displayJson, null, 2)}
          </pre>
          {!showFullJson && (
            <div style={{ marginTop: '8px', padding: '8px', background: '#e6f7ff', borderRadius: '4px', fontSize: '12px', color: '#1890ff' }}>
              💡 已隐藏重复字段（序号、保单ID号、责任原文、责任名称、责任类型），这些字段在表格中已显示。开启"显示完整JSON"可查看所有字段。
            </div>
          )}
        </Card>
      </Space>
    </Modal>
  )
}

