import { useState } from 'react'
import { Card, Typography, Space, Divider, Alert, Tag } from 'antd'
import FormulaEditor from '@/components/FormulaEditor'

const { Title, Paragraph, Text } = Typography

export default function FormulaEditorDemoPage() {
  const [formula1, setFormula1] = useState({
    type: 'basic_percentage' as any,
    variables: {},
    result: 0
  })

  const [formula2, setFormula2] = useState({
    type: 'max_function' as any,
    variables: {},
    result: 0
  })

  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
      {/* 页面标题 */}
      <Card>
        <Title level={2}>💰 公式编辑器演示</Title>
        <Paragraph>
          这是一个保险赔付金额计算的公式编辑器，支持多种常见的赔付公式类型。
          采用<strong>两层交互设计</strong>：
        </Paragraph>
        <Space direction="vertical" size={0}>
          <Text>1️⃣ <strong>第一层</strong>：选择公式类型（如"基本保额 × N%"、"Max函数"等）</Text>
          <Text>2️⃣ <strong>第二层</strong>：编辑公式中的具体变量值（如基本保额 = 500,000 元）</Text>
        </Space>
      </Card>

      <Divider />

      {/* 示例1：基本保额公式 */}
      <Card title="示例 1：基本保额 × 赔付比例" style={{ marginBottom: 24 }}>
        <Alert
          message="使用场景"
          description="重大疾病保险责任：等待期后确诊，按基本保额的 150% 赔付。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        
        <FormulaEditor
          initialType="basic_percentage"
          initialVariables={{
            basicAmount: 500000,
            percentage: 150
          }}
          onChange={(type, variables, result) => {
            setFormula1({ type, variables, result })
            console.log('公式1变化:', { type, variables, result })
          }}
        />

        <Card size="small" style={{ marginTop: 16, background: '#f0f9ff' }}>
          <Space direction="vertical" size={4}>
            <Text type="secondary">当前配置（JSON格式）：</Text>
            <pre style={{ 
              margin: 0, 
              padding: 12, 
              background: '#fff', 
              borderRadius: 4,
              fontSize: 13,
              fontFamily: 'Monaco, Consolas, monospace'
            }}>
{JSON.stringify(formula1, null, 2)}
            </pre>
          </Space>
        </Card>
      </Card>

      {/* 示例2：Max函数 */}
      <Card title="示例 2：Max 函数（取最大值）" style={{ marginBottom: 24 }}>
        <Alert
          message="使用场景"
          description="重大疾病保险责任：等待期内确诊，按基本保额、已交保费、现金价值中的较大者赔付。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        
        <FormulaEditor
          initialType="max_function"
          initialVariables={{
            basicAmount: 500000,
            premiumPaid: 120000,
            cashValue: 80000
          }}
          onChange={(type, variables, result) => {
            setFormula2({ type, variables, result })
            console.log('公式2变化:', { type, variables, result })
          }}
        />

        <Card size="small" style={{ marginTop: 16, background: '#f0f9ff' }}>
          <Space direction="vertical" size={4}>
            <Text type="secondary">当前配置（JSON格式）：</Text>
            <pre style={{ 
              margin: 0, 
              padding: 12, 
              background: '#fff', 
              borderRadius: 4,
              fontSize: 13,
              fontFamily: 'Monaco, Consolas, monospace'
            }}>
{JSON.stringify(formula2, null, 2)}
            </pre>
          </Space>
        </Card>
      </Card>

      {/* 示例3：Min函数 */}
      <Card title="示例 3：Min 函数（上限约束）" style={{ marginBottom: 24 }}>
        <Alert
          message="使用场景"
          description="轻症疾病保险责任：按约定金额赔付，但最高不超过基本保额的 30%。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        
        <FormulaEditor
          initialType="min_function"
          initialVariables={{
            agreedAmount: 200000,
            basicAmount: 500000,
            percentage: 30
          }}
        />
      </Card>

      {/* 使用说明 */}
      <Card title="📖 使用说明">
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div>
            <Tag color="blue">第一步</Tag>
            <Text>在下拉菜单中选择合适的公式类型</Text>
          </div>
          
          <div>
            <Tag color="green">第二步</Tag>
            <Text>点击数值（带下划线和铅笔图标）进行编辑</Text>
          </div>
          
          <div>
            <Tag color="orange">第三步</Tag>
            <Text>输入完成后按回车键或点击其他区域确认</Text>
          </div>

          <Divider />

          <div>
            <Text strong>💡 设计亮点：</Text>
            <ul style={{ marginTop: 8, paddingLeft: 20 }}>
              <li>
                <strong>视觉提示</strong>：鼠标悬停时显示铅笔图标，边框高亮，明确告知可编辑
              </li>
              <li>
                <strong>实时计算</strong>：修改任何变量后，公式预览和计算结果立即更新
              </li>
              <li>
                <strong>千分位格式化</strong>：数字自动添加逗号分隔，提升可读性
              </li>
              <li>
                <strong>类型安全</strong>：只允许输入数字，避免非法输入
              </li>
              <li>
                <strong>两层交互</strong>：先选类型再编辑值，逻辑清晰，符合用户心智模型
              </li>
            </ul>
          </div>
        </Space>
      </Card>

      {/* 技术说明 */}
      <Card title="🔧 技术说明" style={{ marginTop: 24 }}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text>
            <strong>组件路径</strong>：<code>src/components/FormulaEditor.tsx</code>
          </Text>
          <Text>
            <strong>样式文件</strong>：<code>src/components/FormulaEditor.css</code>
          </Text>
          <Text>
            <strong>依赖</strong>：React 18, Ant Design 5, TypeScript
          </Text>
          <Text>
            <strong>Props</strong>：
          </Text>
          <pre style={{ 
            padding: 12, 
            background: '#f5f5f5', 
            borderRadius: 4,
            fontSize: 13,
            fontFamily: 'Monaco, Consolas, monospace'
          }}>
{`interface FormulaEditorProps {
  initialType?: FormulaType          // 初始公式类型
  initialVariables?: Record<...>     // 初始变量值
  onChange?: (type, variables, result) => void  // 变化回调
  showResult?: boolean               // 是否显示计算结果（默认true）
}`}
          </pre>
        </Space>
      </Card>
    </div>
  )
}

