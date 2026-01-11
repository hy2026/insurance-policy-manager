import { useState, useRef, useEffect } from 'react'
import { Select, Input, Space, Typography, Tooltip, Card } from 'antd'
import { EditOutlined, InfoCircleOutlined } from '@ant-design/icons'
import './FormulaEditor.css'

const { Text } = Typography

// ==================== 类型定义 ====================

/** 公式类型 */
type FormulaType = 
  | 'basic_percentage'        // 基本保额 × N%
  | 'effective_percentage'    // 有效保额 × N%
  | 'max_function'            // Max(基本保额, 已交保费, 现金价值)
  | 'min_function'            // Min(约定金额, 基本保额 × N%)
  | 'fixed_amount'            // 固定金额
  | 'premium_only'            // 已交保费
  | 'cash_value_only'         // 现金价值

/** 变量配置 */
interface FormulaVariable {
  name: string                // 变量名称（如"基本保额"）
  key: string                 // 变量键（如"basicAmount"）
  value: number               // 变量值
  unit: string                // 单位（如"元"，"%"）
  editable: boolean           // 是否可编辑
  placeholder?: string        // 占位符
}

/** 公式模板 */
interface FormulaTemplate {
  type: FormulaType
  label: string               // 显示名称
  template: string            // 公式模板（如"基本保额 × {percentage}%"）
  variables: FormulaVariable[]  // 变量列表
  description?: string        // 描述说明
}

// ==================== 公式模板定义 ====================

const FORMULA_TEMPLATES: FormulaTemplate[] = [
  {
    type: 'basic_percentage',
    label: '基本保额 × N%',
    template: '基本保额 {basicAmount} × {percentage}%',
    description: '最常见的赔付公式，按基本保额的一定比例赔付',
    variables: [
      {
        name: '基本保额',
        key: 'basicAmount',
        value: 500000,
        unit: '元',
        editable: true,
        placeholder: '请输入基本保额'
      },
      {
        name: '赔付比例',
        key: 'percentage',
        value: 100,
        unit: '%',
        editable: true,
        placeholder: '请输入赔付比例'
      }
    ]
  },
  {
    type: 'effective_percentage',
    label: '有效保额 × N%',
    template: '有效保额 {effectiveAmount} × {percentage}%',
    description: '根据有效保额（带增长率）的一定比例赔付',
    variables: [
      {
        name: '有效保额',
        key: 'effectiveAmount',
        value: 500000,
        unit: '元',
        editable: true,
        placeholder: '请输入有效保额'
      },
      {
        name: '赔付比例',
        key: 'percentage',
        value: 100,
        unit: '%',
        editable: true,
        placeholder: '请输入赔付比例'
      }
    ]
  },
  {
    type: 'max_function',
    label: 'Max(基本保额, 已交保费, 现金价值)',
    template: 'Max({basicAmount}, {premiumPaid}, {cashValue})',
    description: '取三者中的最大值作为赔付金额',
    variables: [
      {
        name: '基本保额',
        key: 'basicAmount',
        value: 500000,
        unit: '元',
        editable: true,
        placeholder: '请输入基本保额'
      },
      {
        name: '已交保费',
        key: 'premiumPaid',
        value: 100000,
        unit: '元',
        editable: true,
        placeholder: '请输入已交保费'
      },
      {
        name: '现金价值',
        key: 'cashValue',
        value: 80000,
        unit: '元',
        editable: true,
        placeholder: '请输入现金价值'
      }
    ]
  },
  {
    type: 'min_function',
    label: 'Min(约定金额, 基本保额 × N%)',
    template: 'Min({agreedAmount}, {basicAmount} × {percentage}%)',
    description: '取约定金额和基本保额比例中的最小值（上限约束）',
    variables: [
      {
        name: '约定金额',
        key: 'agreedAmount',
        value: 100000,
        unit: '元',
        editable: true,
        placeholder: '请输入约定金额'
      },
      {
        name: '基本保额',
        key: 'basicAmount',
        value: 500000,
        unit: '元',
        editable: true,
        placeholder: '请输入基本保额'
      },
      {
        name: '比例上限',
        key: 'percentage',
        value: 30,
        unit: '%',
        editable: true,
        placeholder: '请输入比例上限'
      }
    ]
  },
  {
    type: 'fixed_amount',
    label: '固定金额',
    template: '{fixedAmount}',
    description: '固定的赔付金额',
    variables: [
      {
        name: '固定金额',
        key: 'fixedAmount',
        value: 100000,
        unit: '元',
        editable: true,
        placeholder: '请输入固定金额'
      }
    ]
  },
  {
    type: 'premium_only',
    label: '已交保费',
    template: '{premiumPaid}',
    description: '赔付已交保费',
    variables: [
      {
        name: '已交保费',
        key: 'premiumPaid',
        value: 100000,
        unit: '元',
        editable: true,
        placeholder: '请输入已交保费'
      }
    ]
  },
  {
    type: 'cash_value_only',
    label: '现金价值',
    template: '{cashValue}',
    description: '赔付现金价值',
    variables: [
      {
        name: '现金价值',
        key: 'cashValue',
        value: 80000,
        unit: '元',
        editable: true,
        placeholder: '请输入现金价值'
      }
    ]
  }
]

// ==================== 工具函数 ====================

/** 格式化数字（添加千分位） */
const formatNumber = (num: number): string => {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** 计算公式结果 */
const calculateResult = (type: FormulaType, variables: Record<string, number>): number => {
  switch (type) {
    case 'basic_percentage':
    case 'effective_percentage':
      return (variables.basicAmount || variables.effectiveAmount || 0) * (variables.percentage || 0) / 100
    
    case 'max_function':
      return Math.max(
        variables.basicAmount || 0,
        variables.premiumPaid || 0,
        variables.cashValue || 0
      )
    
    case 'min_function':
      return Math.min(
        variables.agreedAmount || 0,
        (variables.basicAmount || 0) * (variables.percentage || 0) / 100
      )
    
    case 'fixed_amount':
      return variables.fixedAmount || 0
    
    case 'premium_only':
      return variables.premiumPaid || 0
    
    case 'cash_value_only':
      return variables.cashValue || 0
    
    default:
      return 0
  }
}

/** 渲染公式字符串 */
const renderFormula = (template: string, variables: Record<string, number>): string => {
  let result = template
  Object.entries(variables).forEach(([key, value]) => {
    result = result.replace(`{${key}}`, formatNumber(value))
  })
  return result
}

// ==================== 主组件 ====================

interface FormulaEditorProps {
  /** 初始公式类型 */
  initialType?: FormulaType
  /** 初始变量值 */
  initialVariables?: Record<string, number>
  /** 值变化回调 */
  onChange?: (type: FormulaType, variables: Record<string, number>, result: number) => void
  /** 是否显示计算结果 */
  showResult?: boolean
}

export default function FormulaEditor({ 
  initialType = 'basic_percentage',
  initialVariables,
  onChange,
  showResult = true
}: FormulaEditorProps) {
  
  // ==================== 状态管理 ====================
  
  const [formulaType, setFormulaType] = useState<FormulaType>(initialType)
  const [currentTemplate, setCurrentTemplate] = useState<FormulaTemplate>(
    FORMULA_TEMPLATES.find(t => t.type === initialType) || FORMULA_TEMPLATES[0]
  )
  const [variables, setVariables] = useState<Record<string, number>>(() => {
    const template = FORMULA_TEMPLATES.find(t => t.type === initialType) || FORMULA_TEMPLATES[0]
    const defaultVars: Record<string, number> = {}
    template.variables.forEach(v => {
      defaultVars[v.key] = initialVariables?.[v.key] ?? v.value
    })
    return defaultVars
  })
  const [result, setResult] = useState<number>(0)
  
  // ==================== 副作用 ====================
  
  useEffect(() => {
    const newResult = calculateResult(formulaType, variables)
    setResult(newResult)
    onChange?.(formulaType, variables, newResult)
  }, [formulaType, variables, onChange])
  
  // ==================== 事件处理 ====================
  
  /** 切换公式类型 */
  const handleTypeChange = (newType: FormulaType) => {
    const newTemplate = FORMULA_TEMPLATES.find(t => t.type === newType)
    if (!newTemplate) return
    
    setFormulaType(newType)
    setCurrentTemplate(newTemplate)
    
    // 初始化新模板的变量值
    const newVariables: Record<string, number> = {}
    newTemplate.variables.forEach(v => {
      newVariables[v.key] = v.value
    })
    setVariables(newVariables)
  }
  
  /** 更新变量值 */
  const handleVariableChange = (key: string, value: number) => {
    setVariables(prev => ({
      ...prev,
      [key]: value
    }))
  }
  
  // ==================== 渲染 ====================
  
  return (
    <Card className="formula-editor-card" bordered={false}>
      {/* 第一层：公式类型选择 */}
      <div className="formula-type-selector">
        <Space align="center">
          <Text strong>计算公式：</Text>
          <Select
            value={formulaType}
            onChange={handleTypeChange}
            style={{ minWidth: 280 }}
            size="large"
          >
            {FORMULA_TEMPLATES.map(template => (
              <Select.Option key={template.type} value={template.type}>
                {template.label}
              </Select.Option>
            ))}
          </Select>
          {currentTemplate.description && (
            <Tooltip title={currentTemplate.description}>
              <InfoCircleOutlined style={{ color: '#8c8c8c', cursor: 'help' }} />
            </Tooltip>
          )}
        </Space>
      </div>
      
      {/* 第二层：变量值编辑 */}
      <div className="formula-variables-editor">
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          请设置各参数的具体数值：
        </Text>
        
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {currentTemplate.variables.map(variable => (
            <VariableInput
              key={variable.key}
              variable={variable}
              value={variables[variable.key]}
              onChange={(value) => handleVariableChange(variable.key, value)}
            />
          ))}
        </Space>
      </div>
      
      {/* 公式预览和结果 */}
      <div className="formula-preview">
        <div className="formula-display">
          <Text type="secondary">公式预览：</Text>
          <Text strong style={{ fontSize: 16, color: '#1890ff', marginLeft: 8 }}>
            {renderFormula(currentTemplate.template, variables)}
          </Text>
        </div>
        
        {showResult && (
          <div className="formula-result">
            <Text type="secondary">计算结果：</Text>
            <Text 
              strong 
              style={{ 
                fontSize: 20, 
                color: '#52c41a', 
                marginLeft: 8,
                fontWeight: 600
              }}
            >
              {formatNumber(result)} 元
            </Text>
          </div>
        )}
      </div>
    </Card>
  )
}

// ==================== 子组件：变量输入 ====================

interface VariableInputProps {
  variable: FormulaVariable
  value: number
  onChange: (value: number) => void
}

function VariableInput({ variable, value, onChange }: VariableInputProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [inputValue, setInputValue] = useState(value.toString())
  const inputRef = useRef<any>(null)
  
  useEffect(() => {
    setInputValue(value.toString())
  }, [value])
  
  const handleClick = () => {
    if (!variable.editable) return
    setIsEditing(true)
    setTimeout(() => {
      inputRef.current?.select()
    }, 0)
  }
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value.replace(/,/g, '')
    if (/^\d*\.?\d*$/.test(newValue)) {
      setInputValue(newValue)
    }
  }
  
  const handleBlur = () => {
    setIsEditing(false)
    const numValue = parseFloat(inputValue) || 0
    onChange(numValue)
  }
  
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur()
    }
  }
  
  return (
    <div className="variable-input-row">
      <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
        <Text className="variable-label">{variable.name}：</Text>
        
        <Space align="center">
          {isEditing ? (
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={handleChange}
              onBlur={handleBlur}
              onKeyPress={handleKeyPress}
              placeholder={variable.placeholder}
              style={{ width: 200 }}
              suffix={variable.unit}
            />
          ) : (
            <Tooltip title={variable.editable ? '点击修改' : ''}>
              <div 
                className={`variable-display ${variable.editable ? 'editable' : ''}`}
                onClick={handleClick}
              >
                <Text strong style={{ color: '#1890ff', fontSize: 16 }}>
                  {formatNumber(value)}
                </Text>
                <Text type="secondary" style={{ marginLeft: 4 }}>
                  {variable.unit}
                </Text>
                {variable.editable && (
                  <EditOutlined className="edit-icon" />
                )}
              </div>
            </Tooltip>
          )}
        </Space>
      </Space>
    </div>
  )
}

