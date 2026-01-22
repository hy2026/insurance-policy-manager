import { Drawer } from 'antd'
import PolicyDetailContent from './PolicyDetailContent'
import type { Policy } from '@/types'

interface PolicyDetailCardProps {
  // 展示模式
  mode: 'accordion' | 'drawer'
  
  // 保单数据
  policy: Policy
  
  // 控制展开/关闭（accordion模式）
  expanded?: boolean
  onExpandChange?: (expanded: boolean) => void
  
  // 控制显示/隐藏（drawer模式）
  visible?: boolean
  onClose?: () => void
}

export default function PolicyDetailCard({
  mode,
  policy,
  expanded = false,
  onExpandChange,
  visible = false,
  onClose
}: PolicyDetailCardProps) {
  
  if (mode === 'drawer') {
    const policyTypeMap: Record<string, string> = {
      'critical_illness': '重疾险',
      'life': '人寿险',
      'accident': '意外险',
      'annuity': '年金险'
    }
    
    return (
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '18px', fontWeight: 600, color: '#333' }}>
              📋 {policy.productName} - {policyTypeMap[policy.policyType || ''] || policy.policyType}
            </span>
          </div>
        }
        placement="right"
        width={760}
        open={visible}
        onClose={onClose}
        styles={{
          body: {
            padding: '16px',
            background: '#f8fafc'
          },
          header: {
            borderBottom: '1px solid #e5e7eb',
            padding: '16px 24px'
          }
        }}
      >
        <PolicyDetailContent policy={policy} />
      </Drawer>
    )
  }
  
  // Accordion 模式 - 独立显示区域
  if (!expanded) return null
  
  return (
    <div style={{ background: '#f8fafc' }}>
      <PolicyDetailContent policy={policy} compact={false} />
    </div>
  )
}

export { PolicyDetailContent }

