import { Modal, Card, Typography, Space, Switch, Select, Input, Button, message } from 'antd'
import { useState, useEffect } from 'react'

const { Text, Paragraph } = Typography
const { TextArea } = Input

interface CoverageDetailModalProps {
  visible: boolean
  item: any | null
  onClose: () => void
  onUpdate?: () => void  // 更新后的回调
}

export default function CoverageDetailModal({ visible, item, onClose, onUpdate }: CoverageDetailModalProps) {
  const [showFullJson, setShowFullJson] = useState(false)
  const [reviewStatus, setReviewStatus] = useState<string>('pending')
  const [reviewNotes, setReviewNotes] = useState<string>('')
  const [saving, setSaving] = useState(false)
  
  // 当item变化时更新本地状态
  useEffect(() => {
    if (item) {
      setReviewStatus(item.reviewStatus || 'pending')
      setReviewNotes(item.reviewNotes || '')
    }
  }, [item])
  
  // 保存审批信息
  const handleSave = async () => {
    if (!item?.id) return
    
    setSaving(true)
    try {
      const response = await fetch(`/api/coverage-library/${item.id}/review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewStatus,
          reviewNotes: reviewNotes.trim() || null
        })
      })
      
      if (!response.ok) throw new Error('保存失败')
      
      message.success('审批信息已保存')
      onUpdate?.()  // 刷新列表
      onClose()
    } catch (error: any) {
      message.error(error.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }
  
  if (!item) return null

  const parsedResult = item.parsedResult || {}
  
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
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" onClick={handleSave} loading={saving}>
            保存审批信息
          </Button>
        </Space>
      }
      width={1200}
      style={{ top: 20 }}
    >
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        {/* 审批信息编辑区 - 放到最上面 */}
        <Card title="审批信息" size="small" style={{ marginBottom: 8 }}>
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <div>
              <Text strong style={{ fontSize: '13px' }}>审批结果：</Text>
              <Select
                value={reviewStatus}
                onChange={setReviewStatus}
                style={{ width: 180, marginLeft: 8 }}
                size="small"
                options={[
                  { value: 'pending', label: '待审核' },
                  { value: 'approved', label: '已通过' },
                  { value: 'rejected', label: '未通过' }
                ]}
              />
            </div>
            <div>
              <Text strong style={{ fontSize: '13px' }}>审批备注：</Text>
              <TextArea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="请输入审批备注（可选）"
                rows={2}
                style={{ marginTop: 4, fontSize: '12px' }}
              />
            </div>
          </Space>
        </Card>

        {/* 责任原文 */}
        <Card title="责任原文" size="small" style={{ marginBottom: 8 }}>
          <Paragraph
            style={{
              maxHeight: '250px',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              padding: '8px',
              background: '#fafafa',
              borderRadius: '4px',
              fontSize: '11px',
              lineHeight: '1.4',
              margin: 0
            }}
          >
            {item.责任原文 || item.clauseText || '-'}
          </Paragraph>
        </Card>

        {/* 完整JSON */}
        <Card 
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px' }}>解析结果（JSON）</span>
              <Space size="small">
                <Text type="secondary" style={{ fontSize: '11px' }}>显示完整JSON</Text>
                <Switch 
                  checked={showFullJson} 
                  onChange={setShowFullJson}
                  size="small"
                />
              </Space>
            </div>
          }
          size="small"
          bodyStyle={{ padding: '8px' }}
        >
          <pre
            style={{
              padding: '10px',
              borderRadius: '4px',
              backgroundColor: '#f5f5f5',
              border: '1px solid #d9d9d9',
              maxHeight: '350px',
              overflow: 'auto',
              fontSize: '11px',
              lineHeight: '1.4',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0
            }}
          >
            {JSON.stringify(displayJson, null, 2)}
          </pre>
          {!showFullJson && (
            <div style={{ marginTop: '6px', padding: '6px', background: '#e6f7ff', borderRadius: '4px', fontSize: '11px', color: '#1890ff', lineHeight: '1.4' }}>
              💡 已隐藏重复字段（序号、保单ID号、责任原文、责任名称、责任类型）。开启"显示完整JSON"可查看所有字段。
            </div>
          )}
        </Card>
      </Space>
    </Modal>
  )
}

