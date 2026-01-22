import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { message, Modal, Form, Select, InputNumber } from 'antd'
import { parseCoverage, addPolicy, editPolicy, getPolicyById, getProducts, getCoverageLibrary, getOrCreateInsuredPerson, getFamilyMembers, createFamilyMember, getPolicies } from '@/services/api'
import type { Coverage, PolicyInfo, Policy } from '@/types'
import type { FamilyMember } from '@/services/api'
import InsuranceCompanySelector from '@/components/InsuranceCompanySelector'
import ProductIdSelector from '@/components/ProductIdSelector'
import PolicyDetailCard from '@/components/PolicyDetailCard'

const POLICY_TYPES = [
  { value: 'annuity', label: '年金险' },
  { value: 'critical_illness', label: '重疾险' },
  { value: 'accident', label: '意外险' },
  { value: 'life', label: '人寿险' },
]

const COVERAGE_TYPES = [
  { value: 'disease', label: '疾病责任' },
  { value: 'death', label: '身故责任' },
  { value: 'accident', label: '意外责任' },
  { value: 'annuity', label: '年金责任' },
]

// 称谓选项（用于新增家庭成员）
const ENTITY_OPTIONS = ['本人', '配偶', '孩子', '父亲', '母亲']
const PAYMENT_PERIODS = ['1', '3', '5', '10', '15', '20', '30', 'lifetime']

// 责任类型识别映射
function detectCoverageCategory(name: string): '重疾责任' | '中症责任' | '轻症责任' | '特定疾病责任' | '其他' {
  const nameLower = name.toLowerCase().replace(/\s+/g, '')
  
  // 其他关键词（优先级最高）
  const otherKeywords = [
    '关爱金', '津贴', '慰问金', '补助', '补贴', '护理金', '陪护金'
  ]
  
  // 特定疾病关键词（优先级第二）
  const specificKeywords = [
    '恶性肿瘤', '癌症', '白血病', '脑中风', '心肌梗', '肾衰竭', 
    '器官移植', '冠状动脉', '瘫痪', '失明', '失聪', '阿尔茨海默'
  ]
  
  // 重疾关键词
  const severeKeywords = [
    '重症', '重疾', '重大', '重大疾病', '严重疾病', 'critical', 'severe', 
    '重度', '危重', '重型'
  ]
  
  // 中症关键词
  const moderateKeywords = [
    '中症', '中度疾病', '中等疾病', 'moderate', '中度', '较重', '中型'
  ]
  
  // 轻症关键词
  const mildKeywords = [
    '轻症', '轻度疾病', '较轻疾病', 'mild', 'minor', '轻度', '早期', '轻型'
  ]
  
  // 检查其他（优先级最高）
  if (otherKeywords.some(keyword => nameLower.includes(keyword))) {
    return '其他'
  }
  
  // 检查特定疾病（优先级第二）
  if (specificKeywords.some(keyword => nameLower.includes(keyword))) {
    return '特定疾病责任'
  }
  
  // 检查重疾
  if (severeKeywords.some(keyword => nameLower.includes(keyword))) {
    return '重疾责任'
  }
  
  // 检查中症
  if (moderateKeywords.some(keyword => nameLower.includes(keyword))) {
    return '中症责任'
  }
  
  // 检查轻症
  if (mildKeywords.some(keyword => nameLower.includes(keyword))) {
    return '轻症责任'
  }
  
  // 默认为特定疾病责任
  return '特定疾病责任'
}

// 辅助函数：创建原文片段显示（直接显示完整内容）
function ExtractedTextDisplay({ extractedText }: { extractedText?: string | string[] }) {
  // 如果extractedText为null/undefined，或者是空字符串/空数组，显示"未识别到"
  const texts = extractedText ? (Array.isArray(extractedText) ? extractedText : [extractedText]) : []
  const hasText = texts.some(t => t && t.trim() !== '')
  
  if (!hasText) {
    return (
      <div style={{
        marginTop: '12px',
        padding: '10px',
        background: '#f5f5f5',
        borderLeft: '3px solid #ccc',
        borderRadius: '4px',
        fontSize: '13px',
        color: '#999',
        lineHeight: '1.6'
      }}>
        <span style={{ fontWeight: '600', color: '#999' }}>📄 原文片段：</span>
        <span style={{ fontStyle: 'italic', marginLeft: '6px' }}>原文未识别到相关内容</span>
      </div>
    )
  }
  
  // 合并所有文本，直接显示完整内容
  const fullText = texts.join(' ')
  
  return (
    <div style={{
      marginTop: '12px',
      padding: '10px',
      background: '#f0f8fc',
      borderLeft: '3px solid #CAF4F7',
      borderRadius: '4px',
      fontSize: '13px',
      color: '#555',
      lineHeight: '1.6'
    }}>
      <span style={{ fontWeight: '600', color: '#01BCD6' }}>📄 原文片段：</span>
      <span style={{ wordBreak: 'break-word', marginLeft: '6px' }}>{fullText}</span>
    </div>
  )
}

// 其他字段展示组件
function OtherFieldDisplay({ 
  title, 
  data, 
  payoutCountData,
  note,
  renderContent 
}: { 
  title: string
  data: any
  payoutCountData?: any
  note?: string
  renderContent: (data: any, payoutCountData?: any) => React.ReactNode
}) {
  // 从note中提取与当前字段相关的内容
  const extractFromNote = (noteText: string | undefined, fieldTitle: string): string | undefined => {
    if (!noteText) return undefined
    
    // 按分号分割note
    const parts = noteText.split(/[；;]/)
    
    // 根据字段类型匹配关键词
    const keywordMap: { [key: string]: string[] } = {
      '是否分组': ['分组', '组别', '同组', '不同组'],
      '是否可以重复赔付': ['重复', '再次', '多次', '限赔', '限给付', '累计', '最多赔'],
      '间隔期': ['间隔', '相隔', '之后', '日后', '天后', '年后'],
      '赔付次数': ['次为限', '限赔', '限给付', '最多赔', '累计'],
      '疾病发生是否豁免保费': ['豁免', '免交']
    }
    
    const keywords = keywordMap[fieldTitle] || []
    const matchedParts = parts.filter(part => 
      keywords.some(kw => part.includes(kw))
    )
    
    if (matchedParts.length > 0) {
      return matchedParts.join('；')
    }
    return undefined
  }
  
  // 计算置信度逻辑：
  // 1. 如果有confidence，使用该值
  // 2. 如果是从赔付次数=1推导出的默认值，置信度为"中"（0.6）
  // 3. 如果有extractedText但没有confidence，置信度为"低"（0.3）
  // 4. 完全默认值，置信度为"低"（0.2）
  const hasExtractedText = typeof data === 'object' && data?.extractedText
  const isSinglePayout = payoutCountData?.type === 'single'
  
  // 尝试从note中提取内容
  const noteExtractedText = extractFromNote(note, title)
  const hasNoteText = !!noteExtractedText
  
  let confidence = 0.2 // 默认低置信度
  if (typeof data === 'object' && data?.confidence) {
    confidence = data.confidence
  } else if (isSinglePayout && (title === '是否分组' || title === '是否可以重复赔付' || title === '间隔期')) {
    // 从赔付次数=1推导出来的，置信度为中
    confidence = 0.6
  } else if (hasExtractedText) {
    confidence = 0.3
  } else if (hasNoteText) {
    confidence = 0.5  // 从note中提取的，置信度为中
  }
  
  const confidenceText = confidence >= 0.8 ? '高' : 
                        confidence >= 0.5 ? '中' : '低'
  
  // 优先使用extractedText，其次使用从note提取的内容
  // 确保空字符串也会 fallback 到 noteExtractedText
  const dataExtractedText = typeof data === 'object' ? data?.extractedText : undefined
  const extractedText = (dataExtractedText && dataExtractedText.trim() !== '') ? dataExtractedText : noteExtractedText

  // 统一的图标映射
  const iconMap: { [key: string]: string } = {
    '赔付次数': '🔢',
    '是否分组': '📂',
    '是否可以重复赔付': '🔄',
    '间隔期': '⏱️',
    '疾病发生是否豁免保费': '🎁'
  }
  const icon = iconMap[title] || '📋'

  return (
    <div style={{
      marginTop: '16px',
      padding: '20px',
      background: '#f8fdfe',
      borderRadius: '8px',
      border: '2px solid #CAF4F7'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px'
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#333', margin: 0 }}>
          {icon} {title}
        </h3>
        <span style={{
          padding: '4px 12px',
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: '600',
          background: confidence >= 0.8 ? '#e8f5e9' : 
                     confidence >= 0.5 ? '#fff3e0' : '#ffebee',
          color: confidence >= 0.8 ? '#2e7d32' : 
                confidence >= 0.5 ? '#f57c00' : '#c62828'
        }}>
          置信度: {confidenceText} ({Math.round(confidence * 100)}%)
        </span>
      </div>
      {renderContent(data, payoutCountData)}
      <ExtractedTextDisplay extractedText={extractedText} />
    </div>
  )
}

// 阶段详情展示组件（完全按照HTML版本）
function TierDisplay({ 
  tier, 
  index, 
  policyInfo, 
  totalTiers,
  onUpdate,
  onDelete 
}: { 
  tier: any
  index: number
  policyInfo: any
  totalTiers?: number
  onUpdate?: (index: number, updatedTier: any) => void
  onDelete?: (index: number) => void
}) {
  const [showAllYears, setShowAllYears] = useState(false)
  const [showFormulaEditor, setShowFormulaEditor] = useState(false)
  const [needsRecalculation, setNeedsRecalculation] = useState(false)
  
  // 判断是否是公式类型（有keyAmounts就是公式类型）
  const isFormula = !!(tier.keyAmounts && tier.keyAmounts.length > 0)
  
  // 获取保障年龄：优先使用tier.startAge/endAge，如果没有则从keyAmounts中获取
  const startAge = tier.startAge ?? tier.keyAmounts?.[0]?.age
  const endAge = tier.endAge ?? tier.keyAmounts?.[tier.keyAmounts?.length - 1]?.age
  
  // 更新阶段信息的辅助函数
  const updateTier = (updates: any) => {
    console.log(`[updateTier] 阶段${index + 1}:`, {
      updates,
      tierBefore: {
        startAge: tier.startAge,
        endAge: tier.endAge,
        formula: tier.formula
      },
      tierAfter: {
        startAge: { ...tier, ...updates }.startAge,
        endAge: { ...tier, ...updates }.endAge,
        formula: { ...tier, ...updates }.formula
      }
    })
    
    // 如果修改了公式、年龄或利率，标记需要重新计算
    if (updates.formula !== undefined || updates.startAge !== undefined || 
        updates.endAge !== undefined || updates.interestRate !== undefined ||
        updates.formulaType !== undefined) {
      setNeedsRecalculation(true)
    }
    
    if (onUpdate) {
      onUpdate(index, { ...tier, ...updates })
    }
  }
  
  // 重新计算金额
  const handleRecalculate = () => {
    // 在前端本地重新计算每年的金额
    const newKeyAmounts: any[] = []
    
    // 获取当前的开始和结束年龄（从 tier 对象中读取，而不是使用默认值）
    const currentStartAge = tier.startAge != null ? parseInt(tier.startAge.toString()) : startAge
    const currentEndAge = tier.endAge != null ? parseInt(tier.endAge.toString()) : endAge
    
    // 验证年龄有效性
    if (!currentStartAge || !currentEndAge || currentStartAge > currentEndAge) {
      message.error('年龄范围无效，请检查保障开始年龄和结束年龄')
      return
    }
    
    const formula = tier.formula || ''
    const formulaType = tier.formulaType || 'fixed'
    const interestRate = parseFloat(tier.interestRate?.toString() || '0') / 100
    const basicSumInsured = policyInfo.basicSumInsured
    const basicSumInsuredWan = basicSumInsured / 10000
    
    // 根据公式类型计算
    const policyStartAge = policyInfo.policyStartYear - policyInfo.birthYear
    
    for (let age = currentStartAge; age <= currentEndAge; age++) {
      const year = policyInfo.birthYear + age
      const n = age - policyStartAge // 从起保年龄开始计算
      
      let amount = 0
      
      if (formulaType === 'compound' || formulaType === 'simple') {
        // 复利或单利：基本保额 * (1 + 利率)^n
        if (formulaType === 'compound') {
          amount = basicSumInsuredWan * Math.pow(1 + interestRate, n)
        } else {
          // 单利：基本保额 * (1 + 利率 * n)
          amount = basicSumInsuredWan * (1 + interestRate * n)
        }
      } else if (formulaType === 'fixed') {
        // 固定金额：从公式中提取倍数
        // 例如："基本保额×150%"、"基本保额*150%" 或 "基本保额×1.5"
        const percentMatch = formula.match(/(\d+(?:\.\d+)?)%/)
        const ratioMatch = formula.match(/[×*]\s*(\d+(?:\.\d+)?)(?!%)/)
        
        if (percentMatch) {
          const percent = parseFloat(percentMatch[1])
          amount = basicSumInsuredWan * (percent / 100)
        } else if (ratioMatch) {
          const ratio = parseFloat(ratioMatch[1])
          amount = basicSumInsuredWan * ratio
        } else {
          // 默认 100%
          amount = basicSumInsuredWan
        }
      } else if (formulaType === 'max' || formulaType === 'min') {
        // Max/Min 比较：暂时使用固定值
        amount = basicSumInsuredWan
      }
      
      newKeyAmounts.push({
        year,
        age,
        amount: parseFloat(amount.toFixed(1))
      })
    }
    
    // 只更新 keyAmounts，不修改 startAge 和 endAge（这些由输入框控制）
    const updatedTier = {
      ...tier,
      keyAmounts: newKeyAmounts
    }
    
    setNeedsRecalculation(false)
    
    if (onUpdate) {
      onUpdate(index, updatedTier)
    }
    
    message.success('重新计算完成！')
  }
  
  // 获取公式显示文本
  const basicSumInsuredWan = policyInfo.basicSumInsured / 10000
  const formulaDisplay = tier.formula || (tier.interestRate ? `${basicSumInsuredWan.toFixed(1)}*(1+${tier.interestRate}%)^n` : '')
  
  // 判断是否涉及n变量
  const hasNVariable = formulaDisplay.includes('n') || formulaDisplay.includes('^') || formulaDisplay.includes('(1+')
  
  // 获取年份金额列表（过滤当前年龄及以后的）
  const currentYear = new Date().getFullYear()
  const currentAge = currentYear - policyInfo.birthYear
  const allKeyAmounts = tier.keyAmounts || []
  const filteredKeyAmounts = allKeyAmounts.filter((item: any) => item.age >= currentAge)
  const displayAmounts = showAllYears ? filteredKeyAmounts : filteredKeyAmounts.slice(0, 5)
  
  // 判断是否是固定金额（所有金额相同）
  const isFixed = filteredKeyAmounts.length > 0 && 
    filteredKeyAmounts.every((item: any) => item.amount === filteredKeyAmounts[0].amount)
  
  return (
    <div style={{
      marginBottom: index < (totalTiers || 1) - 1 ? '20px' : '0',
      padding: '18px',
      background: '#f0f8fc',
      borderRadius: '8px',
      border: '1px solid #b3d9e6',
      boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
      position: 'relative'
    }}>
      {/* 删除按钮 - 固定在右上角（橙色） */}
      {onDelete && totalTiers && totalTiers > 1 && (
        <button
          onClick={() => {
            if (confirm('确定要删除此阶段吗？')) {
              onDelete(index)
            }
          }}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: '#FF7A5C',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '6px 16px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '500',
            zIndex: 10
          }}
        >
          🗑️ 删除阶段
        </button>
      )}
      
      {/* 阶段标题 */}
      <div style={{
        marginBottom: '16px',
        paddingBottom: '12px',
        paddingRight: '80px',
        borderBottom: '2px solid #b3d9e6'
      }}>
        <div style={{ fontWeight: '600', color: '#1a5a7d', fontSize: '15px' }}>
          📍 第{index + 1}阶段{tier.period ? ` (${tier.period})` : ''}
        </div>
      </div>

      {!isFormula || filteredKeyAmounts.length === 0 ? (
        // 固定金额类型或没有keyAmounts
        <div>
          <div style={{ fontWeight: '600', marginBottom: '8px', color: '#1a5a7d' }}>
            💵 阶段{index + 1}: {startAge ?? '?'}岁～{endAge ?? '?'}岁
            {tier.period && (
              <span style={{ color: '#666', fontSize: '12px', marginLeft: '8px' }}>
                ({tier.period})
              </span>
            )}
          </div>
          <div style={{
            color: '#2e7d32',
            fontSize: '18px',
            fontWeight: '600'
          }}>
            {tier.amount ? `${parseFloat(tier.amount).toFixed(1)}万元` : '金额待计算'}
          </div>
        </div>
      ) : (
        // 公式类型：显示公式和金额表格
        <>
          {/* 计算公式 */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '6px'
            }}>
              <span style={{ fontSize: '13px', color: '#586069', fontWeight: '600' }}>📊 计算公式：</span>
              <div style={{
                flex: 1,
                fontSize: '17px',
                fontWeight: '700',
                color: '#0366d6',
                fontFamily: 'monospace',
                padding: '6px 0',
                lineHeight: '1.5'
              }}>
                {tier.formula || '未设置公式'}
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={() => setShowFormulaEditor(!showFormulaEditor)}
                  style={{
                    fontSize: '13px',
                    padding: '5px 14px',
                    fontWeight: '500',
                    background: '#01BCD6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.3s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#00A8C0'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#01BCD6'
                  }}
                >
                  {showFormulaEditor ? '完成' : '编辑'}
                </button>
              </div>
            </div>
            
            {/* 公式编辑器（可展开/收起） */}
            {showFormulaEditor && (
              <div style={{
                marginTop: '12px',
                padding: '12px',
                background: '#f8f9fa',
                borderRadius: '4px',
                border: '1px dashed #e0e0e0'
              }}>
                {/* 公式类型选择 */}
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '4px' }}>
                    公式类型
                  </label>
                  <select
                    value={tier.formulaType || 'fixed'}
                    onChange={(e) => {
                      const type = e.target.value
                      updateTier({ formulaType: type })
                      // 根据类型自动生成默认公式
                      if (type === 'fixed') {
                        updateTier({ formula: '基本保额×100%', formulaType: type })
                      } else if (type === 'simple' || type === 'compound') {
                        updateTier({ formula: '基本保额×(1+3.5%)^n', formulaType: type, interestRate: 3.5 })
                      } else if (type === 'max') {
                        updateTier({ formula: 'Max(已交保费, 现金价值)', formulaType: type })
                      } else if (type === 'min') {
                        updateTier({ formula: 'Min(已交保费, 现金价值)', formulaType: type })
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '2px solid #e0e0e0',
                      borderRadius: '4px',
                      fontSize: '13px',
                      background: '#fff',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="fixed">固定金额</option>
                    <option value="simple">单利计算</option>
                    <option value="compound">复利计算</option>
                    <option value="max">Max比较</option>
                    <option value="min">Min比较</option>
                  </select>
                </div>

                {/* 公式文本输入 */}
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '4px' }}>
                    公式文本
                  </label>
                  <input
                    type="text"
                    value={tier.formula || ''}
                    onChange={(e) => updateTier({ formula: e.target.value })}
                    placeholder="如：基本保额×150%、Max(已交保费,现金价值)"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '2px solid #e0e0e0',
                      borderRadius: '4px',
                      fontSize: '13px',
                      fontFamily: 'monospace'
                    }}
                  />
                </div>

                {/* 利率输入（仅单利/复利时显示） */}
                {(tier.formulaType === 'simple' || tier.formulaType === 'compound') && (
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '4px' }}>
                      年利率 (%)
                    </label>
                    <input
                      type="number"
                      value={tier.interestRate || 3.5}
                      onChange={(e) => updateTier({ interestRate: parseFloat(e.target.value) || 0 })}
                      step="0.1"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '2px solid #e0e0e0',
                        borderRadius: '4px',
                        fontSize: '13px'
                      }}
                    />
                  </div>
                )}

                {/* 应用按钮 */}
                <button
                  onClick={() => {
                    setShowFormulaEditor(false)
                    // 不自动重新计算，让用户点击"重新计算"按钮
                  }}
                  style={{
                    width: '100%',
                    marginTop: '10px',
                    padding: '8px',
                    background: '#4caf50',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '600',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#45a049'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#4caf50'
                  }}
                >
                  ✓ 确认修改
                </button>
              </div>
            )}
            {hasNVariable && (
              <div style={{
                fontSize: '11px',
                color: '#6a737d',
                marginLeft: '90px',
                fontStyle: 'italic'
              }}>
                💡 n表示从起始年龄开始的年数，n=0表示起始年龄当年
              </div>
            )}
          </div>

          {/* 保障年龄 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            marginBottom: '12px'
          }}>
            <div>
              <label style={{
                fontSize: '12px',
                color: '#666',
                display: 'block',
                marginBottom: '5px'
              }}>
                保障开始年龄（岁）
              </label>
              <input
                type="number"
                value={startAge ?? ''}
                onChange={(e) => updateTier({ startAge: parseInt(e.target.value) || undefined })}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '2px solid #CAF4F7',
                  borderRadius: '4px',
                  fontSize: '14px',
                  background: '#ffffff',
                  textAlign: 'center'
                }}
              />
            </div>
            <div>
              <label style={{
                fontSize: '12px',
                color: '#666',
                display: 'block',
                marginBottom: '5px'
              }}>
                保障结束年龄
              </label>
              <input
                type="text"
                value={endAge === 'lifetime' ? '终身' : (endAge ?? '')}
                onChange={(e) => {
                  const value = e.target.value
                  if (value === '终身' || value.toLowerCase() === 'lifetime') {
                    updateTier({ endAge: 'lifetime' })
                  } else {
                    updateTier({ endAge: parseInt(value) || undefined })
                  }
                }}
                placeholder="输入年龄或'终身'"
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '2px solid #CAF4F7',
                  borderRadius: '4px',
                  fontSize: '14px',
                  background: '#ffffff',
                  textAlign: 'center'
                }}
              />
            </div>
          </div>

          {/* 每年理赔金额表格 */}
          {isFixed ? (
            // 固定金额：显示赔付期间和金额
            <div style={{
              padding: '14px',
              background: '#ffffff',
              borderRadius: '6px',
              marginTop: '12px'
            }}>
              {filteredKeyAmounts[0]?.selectedOption && (
                <div style={{
                  fontSize: '12px',
                  color: '#5a7d8f',
                  marginBottom: '10px'
                }}>
                  <strong>✅ Max比较结果：</strong>{filteredKeyAmounts[0].selectedOption}
                </div>
              )}
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '13px',
                overflow: 'hidden',
                borderRadius: '4px'
              }}>
                <thead>
                  <tr style={{ background: '#e6f3f9' }}>
                    <th style={{
                      padding: '10px 12px',
                      textAlign: 'left',
                      color: '#5a7d8f',
                      fontWeight: '600',
                      borderBottom: '2px solid #d0e8f2',
                      whiteSpace: 'nowrap'
                    }}>
                      赔付期间
                    </th>
                    <th style={{
                      padding: '10px 12px',
                      textAlign: 'right',
                      color: '#5a7d8f',
                      fontWeight: '600',
                      borderBottom: '2px solid #d0e8f2',
                      whiteSpace: 'nowrap'
                    }}>
                      理赔金额
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '10px 12px', color: '#3a5a6a', whiteSpace: 'nowrap' }}>
                      {filteredKeyAmounts[0].year}年（{filteredKeyAmounts[0].age}岁）～ {
                        filteredKeyAmounts[0].endYear === 'lifetime' ? '终身' :
                        filteredKeyAmounts[0].endYear ? `${filteredKeyAmounts[0].endYear}年（${filteredKeyAmounts[0].endAge}岁）` :
                        `${filteredKeyAmounts[filteredKeyAmounts.length - 1].year}年（${filteredKeyAmounts[filteredKeyAmounts.length - 1].age}岁）`
                      }
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <span style={{
                        fontSize: '18px',
                        fontWeight: '700',
                        color: '#01BCD6',
                        padding: '8px 16px',
                        background: '#e6f7fa',
                        borderRadius: '6px',
                        display: 'inline-block'
                      }}>
                        {filteredKeyAmounts[0].amount.toFixed(1)}
                      </span>
                      <span style={{
                        color: '#3a7d94',
                        fontWeight: '600',
                        marginLeft: '4px'
                      }}>
                        万
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            // 每年金额不同：显示表格（可展开）
            <div style={{
              padding: '14px',
              background: '#ffffff',
              borderRadius: '6px',
              marginTop: '12px'
            }}>
              <div>
                <div>
                  <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '13px',
                    overflow: 'hidden',
                    borderRadius: '4px'
                  }}>
                    <thead>
                      <tr style={{ background: '#e6f3f9' }}>
                        <th style={{
                          padding: '10px 12px',
                          textAlign: 'left',
                          color: '#5a7d8f',
                          fontWeight: '600',
                          borderBottom: '2px solid #d0e8f2',
                          whiteSpace: 'nowrap'
                        }}>
                          赔付年份
                        </th>
                        <th style={{
                          padding: '10px 12px',
                          textAlign: 'right',
                          color: '#5a7d8f',
                          fontWeight: '600',
                          borderBottom: '2px solid #d0e8f2',
                          whiteSpace: 'nowrap'
                        }}>
                          理赔金额
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayAmounts.map((item: any, itemIndex: number) => (
                        <tr key={itemIndex} style={{
                          borderBottom: itemIndex < displayAmounts.length - 1 ? '1px solid #f5f8fa' : 'none'
                        }}>
                          <td style={{ padding: '10px 12px', color: '#5a7d8f', whiteSpace: 'nowrap' }}>
                            {item.year}年（{item.age}岁）
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <span style={{
                              fontSize: '14px',
                              fontWeight: '600',
                              color: '#01BCD6'
                            }}>
                              {typeof item.amount === 'number' ? item.amount.toFixed(1) : item.amount}
                            </span>
                            <span style={{
                              color: '#5a7d8f',
                              fontSize: '12px',
                              marginLeft: '2px'
                            }}>
                              万
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filteredKeyAmounts.length > 5 && (
                  <>
                    {showAllYears && (
                      <div style={{ marginTop: '8px' }}>
                        <table style={{
                          width: '100%',
                          borderCollapse: 'collapse',
                          fontSize: '13px',
                          overflow: 'hidden',
                          borderRadius: '4px'
                        }}>
                          <tbody>
                            {filteredKeyAmounts.slice(5).map((item: any, itemIndex: number) => (
                              <tr key={itemIndex} style={{
                                borderBottom: itemIndex < filteredKeyAmounts.slice(5).length - 1 ? '1px solid #f5f8fa' : 'none'
                              }}>
                                <td style={{ padding: '10px 12px', color: '#5a7d8f' }}>
                                  {item.year}年（{item.age}岁）
                                </td>
                                <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                  <span style={{
                                    fontSize: '14px',
                                    fontWeight: '600',
                                    color: '#01BCD6'
                                  }}>
                                    {typeof item.amount === 'number' ? item.amount.toFixed(1) : item.amount}
                                  </span>
                                  <span style={{
                                    color: '#5a7d8f',
                                    fontSize: '12px',
                                    marginLeft: '2px'
                                  }}>
                                    万
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      marginTop: '12px'
                    }}>
                      <button
                        type="button"
                        onClick={() => setShowAllYears(!showAllYears)}
                        style={{
                          width: '100%',
                          padding: '8px 16px',
                          background: '#ffffff',
                          border: '2px solid #7ab8d0',
                          borderRadius: '4px',
                          color: '#3a7d94',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '600',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#e6f3f9'
                          e.currentTarget.style.borderColor = '#5a9ab5'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#ffffff'
                          e.currentTarget.style.borderColor = '#7ab8d0'
                        }}
                      >
                        {showAllYears ? `▲ 收起` : `▼ 查看全部${filteredKeyAmounts.length}年`}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
      
      {/* 重新计算按钮 - 显示在底部 */}
      {needsRecalculation && (
        <button
          onClick={handleRecalculate}
          style={{
            width: '100%',
            marginTop: '16px',
            padding: '12px 20px',
            background: 'rgba(76, 175, 80, 0.85)',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            transition: 'all 0.2s',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(76, 175, 80, 1)'
            e.currentTarget.style.boxShadow = '0 4px 8px rgba(76, 175, 80, 0.3)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(76, 175, 80, 0.85)'
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)'
          }}
        >
          🔄 修改后，请重新计算
        </button>
      )}
    </div>
  )
}

export default function SmartInputPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('editId')

  // 表单数据 - 设置默认值（与HTML一致）
  const currentYear = new Date().getFullYear()
  const maxStartYear = 2026 // 投保开始年份最大为2026年
  const defaultBirthYear = 2000
  
  const [productIdNumber, setProductIdNumber] = useState('') // 保险产品ID号
  const [policyIdOptions, setPolicyIdOptions] = useState<string[]>([]) // 保险产品ID下拉选项
  const [existingPolicies, setExistingPolicies] = useState<any[]>([]) // 用户已录入的保单列表
  const [insuranceCompany, setInsuranceCompany] = useState('')
  const [policyType, setPolicyType] = useState('critical_illness')
  const [productName, setProductName] = useState('')
  
  // 家庭成员相关
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([])
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null) // 选中的家庭成员ID
  const [addMemberModalVisible, setAddMemberModalVisible] = useState(false)
  const [memberForm] = Form.useForm()
  
  // 从选中的家庭成员获取 insuredPerson 和 birthYear
  const selectedMember = familyMembers.find(m => m.id === selectedMemberId)
  const insuredPerson = selectedMember?.entity || ''
  const birthYear = selectedMember?.birthYear?.toString() || ''
  
  const [policyStartYear, setPolicyStartYear] = useState(Math.min(currentYear, maxStartYear).toString()) // 默认当前年份，但不超过2026年
  const [coverageEndYear, setCoverageEndYear] = useState('lifetime') // 默认"终身"
  const [totalPaymentPeriod, setTotalPaymentPeriod] = useState('')
  const [annualPremium, setAnnualPremium] = useState('')
  const [basicSumInsured, setBasicSumInsured] = useState('')
  
  // 责任相关
  const [selectedCoverageType, setSelectedCoverageType] = useState('')
  const [clauseText, setClauseText] = useState('')
  const [coverages, setCoverages] = useState<Coverage[]>([])
  const [coverageName, setCoverageName] = useState('') // 可编辑的责任名称
  const [editingIndex, setEditingIndex] = useState<number | null>(null) // 正在编辑的责任索引
  
  // 状态
  const [loading, setLoading] = useState(false)
  const [previewDrawerVisible, setPreviewDrawerVisible] = useState(false)
  const [parseResult, setParseResult] = useState<any>(null)
  const [policyInfoChanged, setPolicyInfoChanged] = useState(false) // 跟踪基础信息是否已修改
  const [showCoverageInput, setShowCoverageInput] = useState(false) // 控制责任分析区域的显示

  // 加载保险产品ID下拉选项
  const loadPolicyIdOptions = async () => {
    try {
      console.log('🔄 开始加载保险产品ID号列表...')
      const response = await getProducts({ page: 1, pageSize: 10000 })
      if (response.data && response.data.length > 0) {
        const ids = Array.from(new Set(
          response.data
            .map((item: any) => item.policyId || item.保险产品ID号)
            .filter((id: string) => id && id.trim())
        )) as string[]
        setPolicyIdOptions(ids.sort())
        console.log('✅ 加载保险产品ID号列表成功:', ids.length, '个')
      }
    } catch (error) {
      console.error('❌ 加载保险产品ID号失败:', error)
    }
  }

  // 加载家庭成员列表
  const loadFamilyMembers = async () => {
    try {
      const members = await getFamilyMembers(1) // TODO: 从登录状态获取 userId
      setFamilyMembers(members)
      // 如果有成员且未选择，默认选择第一个
      if (members.length > 0 && !selectedMemberId && !editId) {
        setSelectedMemberId(members[0].id)
      }
    } catch (error) {
      console.error('加载家庭成员失败:', error)
    }
  }

  // 加载用户已录入的保单列表
  const loadExistingPolicies = async () => {
    try {
      const policies = await getPolicies(1) // TODO: 从登录状态获取 userId
      setExistingPolicies(policies)
    } catch (error) {
      console.error('加载已录入保单失败:', error)
    }
  }

  // 新增家庭成员
  const handleAddMember = async () => {
    try {
      const values = await memberForm.validateFields()
      const newMember = await createFamilyMember({ userId: 1, ...values })
      message.success('添加成功')
      setAddMemberModalVisible(false)
      memberForm.resetFields()
      // 重新加载并选中新成员
      await loadFamilyMembers()
      setSelectedMemberId(newMember.id)
    } catch (error: any) {
      if (error.response?.data?.error) {
        message.error(error.response.data.error)
      } else if (!error.errorFields) {
        message.error('添加失败')
      }
    }
  }

  // 页面加载时获取产品ID列表、家庭成员和已录入保单
  useEffect(() => {
    loadPolicyIdOptions()
    loadFamilyMembers()
    loadExistingPolicies()
  }, [])

  // 如果是编辑模式，加载数据
  useEffect(() => {
    if (editId) {
      const id = typeof editId === 'string' ? parseInt(editId) : editId
      if (!isNaN(id)) {
        console.log('[useEffect] 编辑模式，加载保单数据，id:', id)
        // 重置首次渲染标志，避免加载数据时误判为修改
        isFirstRenderRef.current = true
        setPolicyInfoChanged(false)
        loadPolicyData(id)
      } else {
        console.error('[useEffect] 无效的保单ID:', editId)
        message.error('无效的保单ID')
      }
    }
  }, [editId])

  // 当出生年份改变时，更新保障结束年份的默认值
  useEffect(() => {
    if (birthYear && !editId) {
      // 如果不是编辑模式，且出生年份有值，则设置保障结束年份为"终身"
      if (!coverageEndYear || coverageEndYear === '') {
        setCoverageEndYear('lifetime')
      }
    }
  }, [birthYear, editId, coverageEndYear])
  
  // 当条款文本改变时，清空解析结果和责任名称
  // 用于跟踪上一次的 clauseText，避免编辑模式下误清空
  const prevClauseTextRef = useRef<string>('')
  
  useEffect(() => {
    // 只有当条款文本真正改变（不是从编辑加载）且不在编辑模式时，才清空
    if (clauseText && clauseText !== prevClauseTextRef.current && parseResult && editingIndex === null) {
      // 条款改变了，清空之前的解析结果
      setParseResult(null)
      setCoverageName('')
    }
    prevClauseTextRef.current = clauseText
  }, [clauseText, editingIndex])
  
  // 使用 useRef 跟踪上一次的基础信息值
  const prevPolicyInfoRef = useRef({
    birthYear: '',
    policyStartYear: '',
    coverageEndYear: '',
    totalPaymentPeriod: '',
    annualPremium: '',
    basicSumInsured: ''
  })
  
  const isFirstRenderRef = useRef(true)
  
  // 监听基础信息变化（只有真正修改时才标记）
  useEffect(() => {
    // 跳过首次渲染
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
      prevPolicyInfoRef.current = {
        birthYear,
        policyStartYear,
        coverageEndYear,
        totalPaymentPeriod,
        annualPremium,
        basicSumInsured
      }
      return
    }
    
    // 检查是否有真正的变化
    const prev = prevPolicyInfoRef.current
    const hasChanged = 
      birthYear !== prev.birthYear ||
      policyStartYear !== prev.policyStartYear ||
      coverageEndYear !== prev.coverageEndYear ||
      totalPaymentPeriod !== prev.totalPaymentPeriod ||
      annualPremium !== prev.annualPremium ||
      basicSumInsured !== prev.basicSumInsured
    
    if (hasChanged && coverages.length > 0) {
      console.log('[基础信息变化] 检测到保单信息修改，已有', coverages.length, '个责任需要重新计算')
      console.log('[基础信息变化] 变化详情:', {
        出生年份: prev.birthYear !== birthYear ? `${prev.birthYear} → ${birthYear}` : '未变',
        投保年份: prev.policyStartYear !== policyStartYear ? `${prev.policyStartYear} → ${policyStartYear}` : '未变',
        保障年份: prev.coverageEndYear !== coverageEndYear ? `${prev.coverageEndYear} → ${coverageEndYear}` : '未变',
        缴费年份: prev.totalPaymentPeriod !== totalPaymentPeriod ? `${prev.totalPaymentPeriod} → ${totalPaymentPeriod}` : '未变',
        年缴金额: prev.annualPremium !== annualPremium ? `${prev.annualPremium} → ${annualPremium}` : '未变',
        投保金额: prev.basicSumInsured !== basicSumInsured ? `${prev.basicSumInsured} → ${basicSumInsured}` : '未变'
      })
      setPolicyInfoChanged(true)
    }
    
    // 更新上一次的值
    prevPolicyInfoRef.current = {
      birthYear,
      policyStartYear,
      coverageEndYear,
      totalPaymentPeriod,
      annualPremium,
      basicSumInsured
    }
  }, [birthYear, policyStartYear, coverageEndYear, totalPaymentPeriod, annualPremium, basicSumInsured, coverages.length])

  const loadPolicyData = async (id: number) => {
    try {
      console.log('[loadPolicyData] 开始加载保单数据，id:', id)
      // 使用 getPolicyById 直接获取单个保单
      const policy = await getPolicyById(id)
      console.log('[loadPolicyData] 获取到的保单数据:', policy)
      
      if (policy) {
        // 设置基础信息
        setInsuranceCompany(policy.insuranceCompany || '')
        setPolicyType(policy.policyType || 'critical_illness')
        setProductName(policy.productName || '')
        
        // 根据保单的 insuredPerson 和 birthYear 找到对应的家庭成员
        const policyBirthYear = policy.birthYear || policy.policyInfo?.birthYear
        const policyInsuredPerson = policy.insuredPerson || '本人'
        
        // 先加载家庭成员列表，然后匹配
        const members = await getFamilyMembers(1)
        setFamilyMembers(members)
        
        const matchedMember = members.find(
          m => m.entity === policyInsuredPerson && m.birthYear === policyBirthYear
        )
        if (matchedMember) {
          setSelectedMemberId(matchedMember.id)
        } else if (members.length > 0) {
          // 如果没有匹配的成员，尝试仅按 entity 匹配
          const entityMatch = members.find(m => m.entity === policyInsuredPerson)
          if (entityMatch) {
            setSelectedMemberId(entityMatch.id)
          }
        }
        
        const policyStartYear = policy.policyStartYear || policy.policyInfo?.policyStartYear
        if (policyStartYear) {
          setPolicyStartYear(policyStartYear.toString())
        }
        
        const coverageEndYear = policy.coverageEndYear ?? policy.policyInfo?.coverageEndYear ?? 'lifetime'
        setCoverageEndYear(coverageEndYear === 'lifetime' ? 'lifetime' : coverageEndYear.toString())
        
        const paymentPeriod = policy.totalPaymentPeriod ?? policy.paymentPeriod ?? policy.policyInfo?.totalPaymentPeriod
        if (paymentPeriod) {
          // 如果是字符串如 "10年"，提取数字；如果是数字，直接使用
          if (typeof paymentPeriod === 'string') {
            const match = paymentPeriod.match(/\d+/)
            setTotalPaymentPeriod(match ? match[0] : '')
          } else {
            setTotalPaymentPeriod(paymentPeriod.toString())
          }
        } else {
          setTotalPaymentPeriod('')
        }
        
        const loadedAnnualPremiumValue = (policy.annualPremium || policy.policyInfo?.annualPremium || 0)
        const loadedBasicSumInsuredValue = (policy.basicSumInsured || policy.policyInfo?.basicSumInsured || 0) / 10000
        
        console.log('[loadPolicyData] 从数据库加载:')
        console.log(`  policy.annualPremium = ${policy.annualPremium}`)
        console.log(`  policy.basicSumInsured = ${policy.basicSumInsured}`)
        console.log(`  将要设置 annualPremium = ${loadedAnnualPremiumValue}`)
        console.log(`  将要设置 basicSumInsured = ${loadedBasicSumInsuredValue}万`)
        
        setAnnualPremium(loadedAnnualPremiumValue.toString())
        setBasicSumInsured(loadedBasicSumInsuredValue.toString())
        
        // 设置责任列表
        const coverages = policy.coverages || []
        console.log('[loadPolicyData] 责任数量:', coverages.length)
        console.log('[loadPolicyData] 责任详情:', coverages.map((c: any, i: number) => ({
          index: i,
          name: c.name,
          type: c.type,
          hasResult: !!c.result,
          hasClause: !!c.clause
        })))
        setCoverages(coverages)
        
        // 不自动加载责任到编辑区，只有在点击编辑时才加载
        // 这样可以避免刷新页面时右侧自动显示责任内容
        
        // 重要：更新 prevPolicyInfoRef，避免将加载数据误判为"修改"
        // 使用从 policy 获取的实际值，而不是 state（因为 state 可能还没更新）
        const loadedBirthYear = policyBirthYear ? policyBirthYear.toString() : ''
        const loadedPolicyStartYear = policyStartYear ? policyStartYear.toString() : ''
        const loadedCoverageEndYear = coverageEndYear === 'lifetime' ? 'lifetime' : (coverageEndYear ? coverageEndYear.toString() : '')
        const loadedPaymentPeriod = paymentPeriod ? (typeof paymentPeriod === 'string' ? paymentPeriod.match(/\d+/)?.[0] || '' : paymentPeriod.toString()) : ''
        const loadedAnnualPremium = (policy.annualPremium || policy.policyInfo?.annualPremium || 0).toString()
        const loadedBasicSumInsured = ((policy.basicSumInsured || policy.policyInfo?.basicSumInsured || 0) / 10000).toString()
        
        // 使用 setTimeout 确保状态更新完成后再更新 ref
        setTimeout(() => {
          prevPolicyInfoRef.current = {
            birthYear: loadedBirthYear,
            policyStartYear: loadedPolicyStartYear,
            coverageEndYear: loadedCoverageEndYear,
            totalPaymentPeriod: loadedPaymentPeriod,
            annualPremium: loadedAnnualPremium,
            basicSumInsured: loadedBasicSumInsured
          }
          // 重置变化标志和首次渲染标志
          setPolicyInfoChanged(false)
          isFirstRenderRef.current = true
          console.log('[loadPolicyData] 已更新 prevPolicyInfoRef，避免误判为修改', prevPolicyInfoRef.current)
        }, 200)
        
        message.success(`保单数据加载成功，共${coverages.length}项责任`)
      } else {
        message.error('未找到该保单')
      }
    } catch (error) {
      console.error('[loadPolicyData] 加载保单数据失败:', error)
      message.error('加载保单数据失败: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  // 生成年份选项
  const generateYears = (start: number, end: number) => {
    const years = []
    for (let i = start; i <= end; i++) {
      years.push(i)
    }
    return years
  }

  const birthYears = generateYears(1950, new Date().getFullYear())
  const startYears = generateYears(2000, 2026) // 最大年份限制为2026年
  const endYears = generateYears(new Date().getFullYear(), new Date().getFullYear() + 100)

  // 分析责任
  // 删除责任
  const handleDeleteCoverage = (index: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这个责任吗？',
      onOk: () => {
        setCoverages(coverages.filter((_, i) => i !== index))
        message.success('删除成功')
      }
    })
  }
  
  // 🔑 统一的理赔金额计算函数（提取自保存责任逻辑）
  const calculateKeyAmounts = (
    parseResult: any,
    policyInfo: {
      birthYear: number
      policyStartYear: number
      coverageEndYear: number | 'lifetime'
      basicSumInsured: number  // 单位：元
      annualPremium?: number
      totalPaymentPeriod?: string | number
    }
  ) => {
    // 🔑 兼容两种数据格式：
    // 格式1（新格式）: payoutAmount.details.tiers
    // 格式2（责任库格式）: payoutAmount 是数组
    let tiers: any[] = []
    
    if (parseResult?.payoutAmount?.details?.tiers) {
      // 格式1：新格式
      tiers = parseResult.payoutAmount.details.tiers
    } else if (Array.isArray(parseResult?.payoutAmount)) {
      // 格式2：责任库格式，payoutAmount 直接是数组
      tiers = parseResult.payoutAmount
      console.log('[calculateKeyAmounts] 检测到责任库格式，tiers:', tiers)
    } else {
      console.log('[calculateKeyAmounts] 无法识别的数据格式，返回原数据')
      return parseResult
    }
    
    if (tiers.length === 0) {
      console.log('[calculateKeyAmounts] tiers 为空，返回原数据')
      return parseResult
    }
    
    const policyStartAge = policyInfo.policyStartYear - policyInfo.birthYear
    const basicSumInsuredWan = policyInfo.basicSumInsured / 10000
    
    console.log(`[calculateKeyAmounts] policyInfo.basicSumInsured (元) = ${policyInfo.basicSumInsured}`)
    console.log(`[calculateKeyAmounts] basicSumInsuredWan (万) = ${basicSumInsuredWan}`)
    
    // 遍历所有阶段，重新计算 keyAmounts
    const recalculatedTiers = tiers.map((tier: any, tierIndex: number) => {
      // 🔑 对于责任库格式，需要推算年龄范围
      let actualStartAge = tier.startAge ?? tier.keyAmounts?.[0]?.age
      let actualEndAge = tier.endAge ?? tier.keyAmounts?.[tier.keyAmounts?.length - 1]?.age
      
      // 如果没有年龄信息，使用投保年龄到保障结束年龄
      if (!actualStartAge) {
        actualStartAge = policyStartAge
      }
      if (!actualEndAge) {
        actualEndAge = policyInfo.coverageEndYear === 'lifetime' ? 100 : policyInfo.coverageEndYear - policyInfo.birthYear
      }
      
      // 如果没有公式，跳过
      if (!tier.formula) {
        console.log(`[计算金额] 阶段${tierIndex + 1}: 跳过（缺少公式）`)
        return tier
      }
      
      const currentStartAge = parseInt(actualStartAge.toString())
      const currentEndAge = parseInt(actualEndAge.toString())
      const formula = tier.formula || ''
      const formulaType = tier.formulaType || 'fixed'
      const interestRate = parseFloat(tier.interestRate?.toString() || '0') / 100
      
      console.log(`[calculateKeyAmounts] 阶段${tierIndex + 1}: ${currentStartAge}-${currentEndAge}岁, 公式:${formula}`)
      
      const newKeyAmounts: any[] = []
      
      for (let age = currentStartAge; age <= currentEndAge; age++) {
        const year = policyInfo.birthYear + age
        const n = age - policyStartAge
        let amount = 0
        
        if (formulaType === 'compound') {
          amount = basicSumInsuredWan * Math.pow(1 + interestRate, n)
        } else if (formulaType === 'simple') {
          amount = basicSumInsuredWan * (1 + interestRate * n)
        } else if (formulaType === 'fixed') {
          const percentMatch = formula.match(/(\d+(?:\.\d+)?)%/)
          const ratioMatch = formula.match(/[×*]\s*(\d+(?:\.\d+)?)(?!%)/)
          
          if (percentMatch) {
            const percent = parseFloat(percentMatch[1])
            amount = basicSumInsuredWan * (percent / 100)
            console.log(`[金额计算] 百分比计算: ${basicSumInsuredWan}万 * ${percent}% = ${amount}万`)
          } else if (ratioMatch) {
            const ratio = parseFloat(ratioMatch[1])
            amount = basicSumInsuredWan * ratio
            console.log(`[金额计算] 倍数计算: ${basicSumInsuredWan}万 * ${ratio} = ${amount}万`)
          } else {
            amount = basicSumInsuredWan
            console.log(`[金额计算] 默认100%: ${amount}万`)
          }
        } else {
          amount = basicSumInsuredWan
        }
        
        newKeyAmounts.push({
          year,
          age,
          amount: parseFloat(amount.toFixed(1))
        })
      }
      
      console.log(`[calculateKeyAmounts] 阶段${tierIndex + 1}: 计算完成，共${newKeyAmounts.length}个金额，前3个:`, newKeyAmounts.slice(0, 3))
      
      return {
        ...tier,
        startAge: currentStartAge,
        endAge: currentEndAge,
        keyAmounts: newKeyAmounts
      }
    })
    
    // 🔑 根据输入格式返回对应的格式
    if (Array.isArray(parseResult?.payoutAmount)) {
      // 格式2：责任库格式，保持数组格式但转换为新格式（兼容显示逻辑）
      return {
        ...parseResult,
        payoutAmount: {
          details: {
            tiers: recalculatedTiers
          }
        }
      }
    } else {
      // 格式1：新格式
      return {
        ...parseResult,
        payoutAmount: {
          ...parseResult.payoutAmount,
          details: {
            ...parseResult.payoutAmount.details,
            tiers: recalculatedTiers
          }
        }
      }
    }
  }
  
  // 检查是否填写了计算所需的必要信息
  const hasRequiredPolicyInfo = () => {
    const basicSumInsuredValue = parseFloat(basicSumInsured)
    // 基本保额至少要10万，避免输入"1"或"10"时误触发计算
    const isValidBasicSum = basicSumInsured && basicSumInsured.trim() !== '' && basicSumInsuredValue >= 10
    
    return !!(
      birthYear && birthYear.trim() !== '' &&
      policyStartYear && policyStartYear.trim() !== '' &&
      coverageEndYear && coverageEndYear.trim() !== '' &&
      isValidBasicSum
    )
  }
  
  // 🎨 获取字段高亮样式（当有产品库责任但字段未填时）
  const getFieldHighlightStyle = (fieldValue: string) => {
    const hasLibraryCoverages = coverages.some(c => c.source === 'library')
    const isEmpty = !fieldValue || fieldValue.trim() === ''
    
    if (hasLibraryCoverages && isEmpty) {
      return {
        border: '2px solid #01BCD6',
        background: 'transparent',
        boxShadow: '0 4px 12px rgba(1, 188, 214, 0.15), 0 0 0 4px rgba(1, 188, 214, 0.08)'
      }
    }
    return {}
  }
  
  // 获取保单信息对象
  const getPolicyInfo = () => {
    const basicSumInsuredValue = parseFloat(basicSumInsured) * 10000
    console.log(`[getPolicyInfo] 输入的基本保额 = ${basicSumInsured}万，转换为元 = ${basicSumInsuredValue}`)
    return {
      birthYear: parseInt(birthYear),
      policyStartYear: parseInt(policyStartYear),
      coverageEndYear: coverageEndYear === 'lifetime' ? 'lifetime' : parseInt(coverageEndYear),
      basicSumInsured: basicSumInsuredValue,
      annualPremium: annualPremium ? parseFloat(annualPremium) : undefined,
      totalPaymentPeriod: totalPaymentPeriod === 'lifetime' ? 'lifetime' : totalPaymentPeriod ? parseInt(totalPaymentPeriod) : undefined
    }
  }
  
  // 🔑 手动计算理赔金额
  const handleManualCalculate = () => {
    console.log('[手动计算] 开始计算理赔金额')
    
    // 验证必填字段
    if (!birthYear || !birthYear.trim()) {
      message.error('请填写出生年份')
      return
    }
    if (!policyStartYear || !policyStartYear.trim()) {
      message.error('请填写投保开始年份')
      return
    }
    if (!coverageEndYear || !coverageEndYear.trim()) {
      message.error('请填写保障结束年份')
      return
    }
    if (!basicSumInsured || !basicSumInsured.trim()) {
      message.error('请填写基本保额')
      return
    }
    
    const basicSumInsuredValue = parseFloat(basicSumInsured)
    if (isNaN(basicSumInsuredValue) || basicSumInsuredValue <= 0) {
      message.error('基本保额必须是大于0的数字')
      return
    }
    
    // 获取保单信息
    const policyInfo = getPolicyInfo()
    console.log('[手动计算] 保单信息:', policyInfo)
    
    // 计算所有来自库的责任
    const hasLibraryCoverages = coverages.some(c => c.source === 'library')
    if (!hasLibraryCoverages) {
      message.warning('当前没有需要计算的责任')
      return
    }
    
    console.log('[手动计算] 开始计算，当前责任数：', coverages.length)
    
    const recalculatedCoverages = coverages.map((c, index) => {
      if (c.source === 'library' && c.parseResult) {
        console.log(`[手动计算] 正在计算第${index + 1}个责任:`, c.name)
        const calculatedResult = calculateKeyAmounts(c.parseResult, policyInfo)
        console.log(`[手动计算] 第${index + 1}个责任计算完成`)
        return { ...c, parseResult: calculatedResult }
      }
      return c
    })
    
    console.log('[手动计算] 所有责任计算完成，准备更新状态')
    setCoverages(recalculatedCoverages)
    message.success('理赔金额计算完成！', 2)
  }
  
  // 判断是否有来自库的责任
  const hasLibraryCoverages = coverages.some(c => c.source === 'library')
  
  // 判断是否已经计算过
  const hasCalculatedAmounts = coverages.some(c => {
    if (c.source === 'library' && c.parseResult) {
      const tiers = c.parseResult?.payoutAmount?.details?.tiers || []
      return tiers.some((t: any) => t.keyAmounts && t.keyAmounts.length > 0)
    }
    return false
  })
  
  // 查询产品并自动填充
  const handleProductSearch = async () => {
    if (!productIdNumber.trim()) {
      return
    }
    
    try {
      message.loading('正在查询产品...', 0)
      
      // 查询产品
      const productRes = await getProducts({ 保险产品ID号: productIdNumber })
      if (!productRes.data || productRes.data.length === 0) {
        message.destroy()
        message.warning('未找到匹配的产品，请继续手动填写')
        return
      }
      
      const product = productRes.data[0]
      
      // 自动填充基础信息
      setInsuranceCompany(product.insuranceCompany || product.公司名称 || '')
      setPolicyType(product.productCategory === '疾病险' ? 'critical_illness' : 
                    product.productCategory === '人寿险' ? 'life' :
                    product.productCategory === '意外险' ? 'accident' : 'annuity')
      setProductName(product.productName || product.保险产品名称 || '')
      
      // 查询责任列表
      const coverageRes = await getCoverageLibrary({ 
        保单ID号: productIdNumber,
        pageSize: 100
      })
      
      if (coverageRes.data && coverageRes.data.length > 0) {
        // 将责任库的数据转换为Coverage格式
        const standardCoverages: Coverage[] = coverageRes.data.map((c: any) => {
          // 确保 parseResult 包含所有必要字段
          const parseResult = c.parsedResult || {}
          
          // 🔑 从顶层对象复制关键字段（后端enrichCoverageData添加的字段）
          // 自然语言描述
          if (!parseResult.naturalLanguageDesc && c.naturalLanguageDesc) {
            parseResult.naturalLanguageDesc = c.naturalLanguageDesc
          }
          // 赔付金额数组
          if (!parseResult.payoutAmount && c.payoutAmount) {
            parseResult.payoutAmount = c.payoutAmount
          }
          
          // 如果 parsedResult 不包含赔付次数等字段，从顶层对象复制
          if (!parseResult.赔付次数 && c.赔付次数) {
            parseResult.赔付次数 = c.赔付次数
          }
          if (!parseResult.是否可以重复赔付 && c.是否可以重复赔付 !== undefined) {
            parseResult.是否可以重复赔付 = c.是否可以重复赔付
          }
          if (!parseResult.是否分组 && c.是否分组 !== undefined) {
            parseResult.是否分组 = c.是否分组
          }
          if (!parseResult.间隔期 && c.间隔期) {
            parseResult.间隔期 = c.间隔期
          }
          if (!parseResult.是否豁免 && c.是否豁免 !== undefined) {
            parseResult.是否豁免 = c.是否豁免
          }
          // 复制 note 字段（用于原文片段显示）
          if (!parseResult.note && c.note) {
            parseResult.note = c.note
          }
          
          return {
            id: `lib-${c.id}`,
            name: c.coverageName || c.责任名称,
            type: c.coverageType || c.责任类型,
            source: 'library' as const,
            libraryId: c.id,
            isRequired: c.isRequired || c.是否必选 || '可选',
            isSelected: c.isRequired === '必选' || c.是否必选 === '必选', // 必选责任默认选中
            parseResult: parseResult
          }
        })
        
        // 🔑 检查是否已填写计算所需的必要信息
        const canCalculate = hasRequiredPolicyInfo()
        
        if (canCalculate) {
          // ✅ 立即计算所有责任的理赔金额
          message.destroy()
          message.loading({ content: '正在计算理赔金额...', key: 'calc', duration: 0 })
          
          const policyInfo = getPolicyInfo()
          const calculatedCoverages = standardCoverages.map(c => {
            if (c.parseResult) {
              const calculatedResult = calculateKeyAmounts(c.parseResult, policyInfo)
              return { ...c, parseResult: calculatedResult }
            }
            return c
          })
          
          setCoverages(calculatedCoverages)
          setShowCoverageInput(false)
          message.destroy()
          message.success(`已加载${standardCoverages.length}项责任并计算理赔金额`)
        } else {
          // ⚠️ 提示用户填写必要信息后才能计算
          setCoverages(standardCoverages)
          setShowCoverageInput(false)
          message.destroy()
          message.info(`已加载${standardCoverages.length}项责任，请填写基础信息后将自动计算理赔金额`)
        }
      } else {
        message.destroy()
        message.success('已填充产品信息')
      }
    } catch (error: any) {
      message.destroy()
      message.error('查询失败：' + error.message)
    }
  }
  
  const handleAnalyzeCoverage = async () => {
    if (!clauseText.trim()) {
      message.warning('请输入责任条款')
      return
    }
    if (!selectedCoverageType) {
      message.warning('请选择责任类型')
      return
    }

    try {
      setLoading(true)
      message.loading({ content: '正在解析...', key: 'parse', duration: 0 })

      const policyInfo: PolicyInfo = {
        birthYear: parseInt(birthYear),
        policyStartYear: parseInt(policyStartYear),
        coverageEndYear: coverageEndYear === 'lifetime' ? 'lifetime' : parseInt(coverageEndYear),
        basicSumInsured: parseFloat(basicSumInsured) * 10000,
        annualPremium: parseFloat(annualPremium),
        totalPaymentPeriod: totalPaymentPeriod === 'lifetime' ? 'lifetime' : String(parseInt(totalPaymentPeriod)),
      }

      const result = await parseCoverage(clauseText, selectedCoverageType, policyInfo)
      
      // 检查是否不适用或保障期限已结束
      if (result.status === 'not_applicable') {
        message.warning({ 
          content: `此责任不适用：${result.reason || '条件不满足'}`, 
          key: 'parse',
          duration: 5
        })
      } else if (policyInfo && policyInfo.coverageEndYear !== 'lifetime') {
        const currentYear = new Date().getFullYear()
        if (currentYear > policyInfo.coverageEndYear) {
          message.warning({
            content: `⚠️ 合同已失效：保障期限已于${policyInfo.coverageEndYear}年结束（当前年份：${currentYear}年）`,
            key: 'parse',
            duration: 5
          })
        } else {
          message.success({ content: '解析成功！请查看右侧结果，确认无误后点击"保存责任"', key: 'parse' })
        }
      } else {
        message.success({ content: '解析成功！请查看右侧结果，确认无误后点击"保存责任"', key: 'parse' })
      }
      
      setParseResult(result)
      
      // 自动提取第一行作为责任名称
      const lines = clauseText.trim().split('\n')
      const extractedName = lines[0]?.trim() || '未命名责任'
      setCoverageName(extractedName)
    } catch (error: any) {
      console.error('解析错误详情:', error)
      const errorMessage = error.response?.data?.message || error.message || error.error || '解析失败，请检查网络连接或联系管理员'
      message.error({ content: errorMessage, key: 'parse', duration: 5 })
    } finally {
      setLoading(false)
    }
  }

  // 完成填写
  const handleComplete = async () => {
    // 验证必填项 - 提供详细的错误信息
    const missingFields: string[] = []
    
    if (!insuranceCompany || insuranceCompany.trim() === '') {
      missingFields.push('保险公司')
    }
    if (!productName || productName.trim() === '') {
      missingFields.push('产品名称')
    }
    if (!selectedMemberId) {
      missingFields.push('被保险人（请选择家庭成员）')
    }
    if (!policyStartYear || policyStartYear.trim() === '') {
      missingFields.push('投保开始年份')
    }
    if (!coverageEndYear || coverageEndYear.trim() === '') {
      missingFields.push('保障结束年份')
    }
    if (!totalPaymentPeriod || totalPaymentPeriod.trim() === '') {
      missingFields.push('总缴费期限')
    }
    if (!annualPremium || annualPremium.trim() === '' || parseFloat(annualPremium) <= 0) {
      missingFields.push('每年保费')
    }
    if (!basicSumInsured || basicSumInsured.trim() === '' || parseFloat(basicSumInsured) <= 0) {
      missingFields.push('基本保额')
    }
    
    if (missingFields.length > 0) {
      message.warning(`请填写以下必填项：${missingFields.join('、')}`)
      console.error('[handleComplete] 缺少必填项:', missingFields)
      console.error('[handleComplete] 当前值:', {
        insuranceCompany,
        productName,
        insuredPerson,
        birthYear,
        policyStartYear,
        coverageEndYear,
        totalPaymentPeriod,
        annualPremium,
        basicSumInsured
      })
      return
    }

    // 检查是否有选中的责任
    const selectedCount = coverages.filter(c => c.isSelected !== false).length
    if (coverages.length === 0) {
      message.warning('请至少添加一项保障责任')
      return
    }
    if (selectedCount === 0) {
      message.warning('请至少选择一项保障责任')
      return
    }

    // 实际保存逻辑（提取成函数，便于覆盖时复用）
    const doSavePolicy = async (overrideId?: number) => {
      try {
      // 🔄 如果基础信息已修改，重新计算所有责任的 keyAmounts
      let finalCoverages = coverages
      
      // 检查保障结束年份是否改变
      const currentPolicyInfo = {
          birthYear: parseInt(birthYear),
          policyStartYear: parseInt(policyStartYear),
          coverageEndYear: coverageEndYear === 'lifetime' ? 'lifetime' : parseInt(coverageEndYear),
          basicSumInsured: parseFloat(basicSumInsured) * 10000,
          annualPremium: parseFloat(annualPremium),
          totalPaymentPeriod: totalPaymentPeriod === 'lifetime' ? 'lifetime' : parseInt(totalPaymentPeriod),
        }
        
      // 如果有编辑的保单，检查保障结束年份是否改变
        const targetId = overrideId || (editId ? parseInt(editId) : null)
      let coverageEndYearChanged = false
        if (targetId) {
        try {
            const existingPolicy = await getPolicyById(targetId)
          if (existingPolicy) {
            const oldCoverageEndYear = existingPolicy.policyInfo?.coverageEndYear ?? existingPolicy.coverageEndYear ?? 'lifetime'
            const newCoverageEndYear = currentPolicyInfo.coverageEndYear
            if (oldCoverageEndYear !== newCoverageEndYear) {
              coverageEndYearChanged = true
              console.log(`[保存合同] 保障结束年份已改变: ${oldCoverageEndYear} → ${newCoverageEndYear}`)
            }
          }
        } catch (error) {
          console.warn('[保存合同] 无法获取原保单信息，跳过对比:', error)
        }
      }
      
      // 🔄 如果基础信息已修改，使用统一的 calculateKeyAmounts 重新计算所有责任
      if (policyInfoChanged || coverageEndYearChanged) {
        message.loading({ content: '检测到保单信息已修改，正在重新计算所有责任...', key: 'recalc', duration: 0 })
        console.log('[保存合同] 开始重新计算所有责任...')
        
        try {
          // 🔑 复用统一的计算函数
          finalCoverages = coverages.map((coverage, coverageIndex) => {
            console.log(`[保存合同] 重新计算责任${coverageIndex + 1}: ${coverage.name}`)
            
            if (coverage.result) {
              const calculatedResult = calculateKeyAmounts(coverage.result, currentPolicyInfo)
              return { ...coverage, result: calculatedResult }
            } else if (coverage.parseResult) {
              const calculatedResult = calculateKeyAmounts(coverage.parseResult, currentPolicyInfo)
              return { ...coverage, parseResult: calculatedResult }
            }
            return coverage
          })
          
          message.success({ content: '重新计算完成', key: 'recalc', duration: 1 })
        } catch (error: any) {
          console.error('[保存合同] 重新计算失败:', error)
          message.error({ content: '重新计算失败: ' + error.message, key: 'recalc' })
          return
        }
      }
      
      // 只保存已选中的责任
      const selectedCoverages = finalCoverages.filter(c => c.isSelected !== false)
      
      if (selectedCoverages.length === 0) {
        message.warning('请至少选择一项保障责任')
        return
      }
      
        // 尝试从责任中提取保单ID号（如果用户没有输入）
        let finalPolicyIdNumber = productIdNumber
        if (!finalPolicyIdNumber && selectedCoverages.length > 0) {
          const firstCoverage = selectedCoverages[0]
          finalPolicyIdNumber = firstCoverage?.parseResult?.保单ID号 || 
                                firstCoverage?.parseResult?.['保单ID号'] || ''
          if (finalPolicyIdNumber) {
            console.log('[保存] 从责任中提取保单ID号:', finalPolicyIdNumber)
          }
        }
        
        // 使用已选择的家庭成员ID
      const policyData = {
        userId: 1, // TODO: 从登录状态获取
          insuredPersonId: selectedMemberId, // 关联被保险人
        insuranceCompany,
        policyType,
        productName,
        insuredPerson,
          birthYear: selectedMember?.birthYear || parseInt(birthYear),
        policyStartYear: parseInt(policyStartYear),
        coverageEndYear: coverageEndYear === 'lifetime' ? 'lifetime' : parseInt(coverageEndYear),
        totalPaymentPeriod: totalPaymentPeriod === 'lifetime' ? 'lifetime' : parseInt(totalPaymentPeriod),
        annualPremium: parseFloat(annualPremium),
        basicSumInsured: parseFloat(basicSumInsured) * 10000,
          policyIdNumber: finalPolicyIdNumber || undefined, // 保单ID号（如：百年人寿[2020]疾病保险009号）
        coverages: selectedCoverages
      }

        console.log('[保存] policyIdNumber:', finalPolicyIdNumber)

        if (overrideId) {
          // 覆盖模式：更新已有保单
          await editPolicy(overrideId, policyData as any)
          message.success('已覆盖原有保单！')
        } else if (editId) {
        await editPolicy(parseInt(editId), policyData as any)
        message.success('更新成功！')
      } else {
        await addPolicy(policyData as any)
        message.success('保存成功！')
      }
      
        navigate('/my-policies')
    } catch (error: any) {
      message.error(error.message || '保存失败')
    }
    }
    
    // 检查保单ID + 被保险人 是否重复（同一产品同一被保人不能重复录入）
    if (productIdNumber && productIdNumber.trim()) {
      const duplicatePolicy = existingPolicies.find(p => 
        p.policyIdNumber === productIdNumber && 
        p.insuredPerson === insuredPerson &&
        (!editId || parseInt(editId) !== parseInt(p.id))
      )
      if (duplicatePolicy) {
        // 弹出确认框，询问是否覆盖
        Modal.confirm({
          title: '保单已存在',
          content: (
            <div>
              <p>该被保险人 <strong>{insuredPerson}</strong> 已有此保单：</p>
              <p style={{ color: '#666', marginTop: '8px' }}>
                产品名称：{duplicatePolicy.productName}<br/>
                保单ID：{productIdNumber}
              </p>
              <p style={{ marginTop: '12px', color: '#ff6b00' }}>是否覆盖原有保单？</p>
            </div>
          ),
          okText: '确认覆盖',
          cancelText: '取消',
          okButtonProps: { danger: true },
          onOk: async () => {
            await doSavePolicy(duplicatePolicy.id)
          }
        })
        return
      }
    }

    // 正常保存
    await doSavePolicy()
  }

  // 删除责任
  const removeCoverage = (index: number) => {
    setCoverages(coverages.filter((_, i) => i !== index))
  }

  return (
    <div style={{ minHeight: '100vh', padding: '24px' }}>
      {/* 顶部标题区域 - 参考我家的保单 */}
      <div style={{ 
        maxWidth: '1400px',
        margin: '0 auto',
        marginBottom: '32px'
      }}>
        <div style={{ 
          display: 'flex',
          alignItems: 'baseline',
          gap: '16px'
        }}>
          <h1 style={{ 
            fontSize: '30px',
            fontWeight: 700,
            color: '#1f2937',
            margin: 0
          }}>
            保单智能录入解析
          </h1>
          <p style={{
            fontSize: '14px',
            color: '#6b7280',
            margin: 0,
            fontWeight: 400
          }}>
            快速录入保单信息，智能解析保障责任
          </p>
        </div>
        </div>

      {/* 主内容区域 */}
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto'
      }}>

        {/* 左右两栏布局 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '9fr 11fr',
          gap: '24px'
        }}>
          {/* 左侧：输入区域 */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.7)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderRadius: '12px',
            padding: '24px',
            border: '2px solid #01BCD6'
          }}>
            <h2 style={{
              color: '#01BCD6',
              fontSize: '20px',
              marginBottom: '20px',
              paddingBottom: '12px',
              borderBottom: '2px solid #01BCD6'
            }}>📝 请录入您的保单信息</h2>

            {/* 保单基本信息 */}
            <div style={{ marginBottom: '16px' }}>
              {/* 保险产品ID号 */}
              <div style={{ marginBottom: '8px' }}>
                <label className="html-label">
                  保险产品ID号 <span style={{ fontSize: '12px', color: '#999', fontWeight: 'normal' }}>💡 输入产品编码可自动填充保险公司、产品名称及责任清单</span>
                </label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <ProductIdSelector
                      value={productIdNumber}
                      onChange={setProductIdNumber}
                      placeholder="如：百年人寿[2020]疾病保险013号"
                      options={policyIdOptions}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleProductSearch}
                    style={{ 
                      padding: '8px 24px', 
                      whiteSpace: 'nowrap',
                      background: '#01BCD6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      transition: 'all 0.3s',
                      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-1px)'
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(1, 188, 214, 0.3)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
                    }}
                  >
                    🔍 查询
                  </button>
                </div>
              </div>
              
              {/* 保险公司 */}
              <div style={{ marginBottom: '8px' }}>
                <label className="html-label">
                  保险公司 <span className="required">*</span>
                </label>
                <InsuranceCompanySelector
                  value={insuranceCompany}
                  onChange={setInsuranceCompany}
                />
              </div>

              {/* 保单类型和产品名称 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '8px' }}>
                <div>
                  <label className="html-label">
                    保单类型 <span className="required">*</span>
                  </label>
                  <select
                    className="html-select"
                    value={policyType}
                    onChange={(e) => setPolicyType(e.target.value)}
                  >
                    {POLICY_TYPES.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="html-label">
                    产品名称 <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    className="html-input"
                    placeholder="请输入保险产品名称"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                  />
                </div>
              </div>

              {/* 被保险人和基本保额同行 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '8px' }}>
                {/* 被保险人（选择家庭成员） */}
                <div>
                  <label className="html-label">
                    被保险人 <span className="required">*</span>
                  </label>
                  <select
                    className="html-select"
                    value={selectedMemberId || ''}
                    onChange={(e) => setSelectedMemberId(e.target.value ? parseInt(e.target.value) : null)}
                    style={{ ...getFieldHighlightStyle(selectedMemberId?.toString() || '') }}
                  >
                    <option value="">请选择家庭成员</option>
                    {(() => {
                      // 按固定顺序排序：本人、配偶、老大、老二...
                      const orderMap: Record<string, number> = { '本人': 0, '配偶': 1, '老大': 2, '老二': 3, '老三': 4, '老四': 5, '老五': 6 }
                      const sortedMembers = [...familyMembers].sort((a, b) => {
                        const orderA = orderMap[a.entity] ?? 99
                        const orderB = orderMap[b.entity] ?? 99
                        return orderA - orderB
                      })
                      
                      return sortedMembers.map(member => (
                        <option key={member.id} value={member.id}>
                          {member.entity}
                        </option>
                      ))
                    })()}
                  </select>
                </div>
                {/* 基本保额 */}
                <div>
                  <label className="html-label">
                    基本保额 <span className="required">*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number"
                      className="html-input"
                      placeholder="请输入基本保额"
                      value={basicSumInsured}
                      onChange={(e) => setBasicSumInsured(e.target.value)}
                      style={{ paddingRight: '40px', ...getFieldHighlightStyle(basicSumInsured) }}
                    />
                    <span style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#666',
                      fontSize: '14px'
                    }}>万元</span>
                  </div>
                </div>
              </div>

              {/* 新增家庭成员弹窗 */}
              <Modal
                title="新增家庭成员"
                open={addMemberModalVisible}
                onOk={handleAddMember}
                onCancel={() => setAddMemberModalVisible(false)}
                okText="保存"
                cancelText="取消"
                width={400}
              >
                <Form form={memberForm} layout="vertical" style={{ marginTop: '16px' }}>
                  <Form.Item
                    name="entity"
                    label="称谓"
                    rules={[{ required: true, message: '请选择称谓' }]}
                  >
                    <Select placeholder="请选择称谓">
                      {ENTITY_OPTIONS.map(opt => (
                        <Select.Option key={opt} value={opt}>{opt}</Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                  <Form.Item
                    name="birthYear"
                    label="出生年份"
                    rules={[{ required: true, message: '请输入出生年份' }]}
                  >
                    <InputNumber
                      min={1900}
                      max={new Date().getFullYear()}
                      style={{ width: '100%' }}
                      placeholder="请输入出生年份"
                    />
                  </Form.Item>
                  <Form.Item
                    name="gender"
                    label="性别"
                    rules={[{ required: true, message: '请选择性别' }]}
                  >
                    <Select placeholder="请选择性别">
                      <Select.Option value="男">男</Select.Option>
                      <Select.Option value="女">女</Select.Option>
                    </Select>
                  </Form.Item>
                </Form>
              </Modal>

              {/* 投保开始年份和保障结束年份 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '8px' }}>
                <div>
                  <label className="html-label">
                    投保开始年份 <span className="required">*</span>
                  </label>
                  <select
                    className="html-select"
                    value={policyStartYear}
                    onChange={(e) => setPolicyStartYear(e.target.value)}
                    style={getFieldHighlightStyle(policyStartYear)}
                  >
                    <option value="">请选择投保开始年份</option>
                    {startYears.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="html-label">
                    保障结束年份 <span className="required">*</span>
                  </label>
                  <select
                    className="html-select"
                    value={coverageEndYear}
                    onChange={(e) => setCoverageEndYear(e.target.value)}
                    style={getFieldHighlightStyle(coverageEndYear)}
                  >
                    <option value="">请选择保障结束年份</option>
                    <option value="lifetime">终身</option>
                    {endYears.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 总缴费期限和每年保费 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '8px' }}>
                <div>
                  <label className="html-label">
                    总缴费期限 <span className="required">*</span>
                    <span style={{ fontSize: '12px', color: '#999', fontWeight: 'normal', marginLeft: '4px' }}>
                      从投保开始年份计算
                    </span>
                  </label>
                  <select
                    className="html-select"
                    value={totalPaymentPeriod}
                    onChange={(e) => setTotalPaymentPeriod(e.target.value)}
                    style={getFieldHighlightStyle(totalPaymentPeriod)}
                  >
                    <option value="">请选择缴费期限</option>
                    {PAYMENT_PERIODS.map(period => (
                      <option key={period} value={period}>
                        {period === 'lifetime' ? '终身缴费' : `${period}年`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="html-label">
                    每年保费 <span className="required">*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number"
                      className="html-input"
                      placeholder="请输入每年保费"
                      value={annualPremium}
                      onChange={(e) => setAnnualPremium(e.target.value)}
                      style={{ paddingRight: '40px', ...getFieldHighlightStyle(annualPremium) }}
                    />
                    <span style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#666',
                      fontSize: '14px'
                    }}>元</span>
                  </div>
                </div>
                  </div>
                  
                  {/* 计算理赔金额按钮 - 仅在有库责任时显示 */}
                  {hasLibraryCoverages && (
                <div style={{ marginBottom: '8px' }}>
                    <button
                      onClick={handleManualCalculate}
                      style={{
                        width: '100%',
                        padding: '12px 20px',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: 'white',
                        background: '#01BCD6',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.3s',
                        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                        whiteSpace: 'nowrap'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)'
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(1, 188, 214, 0.3)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
                      }}
                    >
                      {hasCalculatedAmounts ? '🔄 重新计算' : '💫 计算理赔金额'}
                    </button>
                </div>
              )}
              
              {/* 提示信息 - 仅在有库责任时显示 */}
              {hasLibraryCoverages && (
                <div style={{ 
                  marginBottom: '8px',
                  padding: '8px 12px',
                  background: 'rgba(1, 188, 214, 0.05)',
                  border: '1px solid rgba(1, 188, 214, 0.2)',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#01BCD6',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  {hasCalculatedAmounts ? (
                    <>
                      <span>✅</span>
                      <span>理赔金额已计算，如需重新计算请点击上方按钮</span>
                    </>
                  ) : (
                    <>
                      <span>💡</span>
                      <span>已选择 {coverages.filter(c => c.source === 'library').length} 个责任，填写完保单信息后点击按钮计算金额</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* 保障责任列表 */}
            <div className="html-divider">
              <div className="html-divider-line"></div>
              <div className="html-divider-text">保障责任列表</div>
              <div className="html-divider-line"></div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              {coverages.length === 0 ? (
                <p style={{ color: '#999', textAlign: 'center', padding: '20px', fontSize: '14px' }}>
                  暂无责任，请点击下方按钮新增责任
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '12px' }}>
                  {coverages.map((coverage, index) => {
                    // 🔑 计算理赔金额范围（统一逻辑）
                    const payoutAmountDisplay = (() => {
                      const parseResult = coverage.parseResult || coverage.result
                      const tiers = parseResult?.payoutAmount?.details?.tiers || []
                      const hasKeyAmounts = tiers.some((t: any) => t.keyAmounts && t.keyAmounts.length > 0)
                      
                      if (!hasKeyAmounts) {
                        // 未计算：显示提示
                        if (coverage.source === 'library' && !hasRequiredPolicyInfo()) {
                          return <span style={{ color: '#FF7A5C', fontSize: '13px', fontStyle: 'italic' }}>
                            💡 待信息填全后点击计算
                          </span>
                        }
                        return <span style={{ color: '#999', fontSize: '13px' }}>暂无金额信息</span>
                      }
                      
                      // 已计算：提取最小和最大金额
                      const amounts: number[] = []
                      tiers.forEach((tier: any) => {
                        if (tier.keyAmounts && tier.keyAmounts.length > 0) {
                          tier.keyAmounts.forEach((ka: any) => {
                            if (typeof ka.amount === 'number') {
                              amounts.push(ka.amount)
                            }
                          })
                        }
                      })
                      
                      if (amounts.length === 0) {
                        return <span style={{ color: '#999', fontSize: '13px' }}>暂无金额信息</span>
                      }
                      
                      const minAmount = Math.min(...amounts)
                      const maxAmount = Math.max(...amounts)
                      
                      if (minAmount === maxAmount) {
                        return <span style={{ color: '#01BCD6', fontWeight: 600, fontSize: '14px' }}>
                          {minAmount.toFixed(1)}万元
                        </span>
                      }
                      
                      return <span style={{ color: '#01BCD6', fontWeight: 600, fontSize: '14px' }}>
                        {minAmount.toFixed(1)}-{maxAmount.toFixed(1)}万元
                      </span>
                    })()
                    
                    // 提取赔付次数（兼容两种格式：对象格式和字符串格式）
                    const parseResult = coverage.parseResult || coverage.result
                    let payoutCountDisplay = '暂无信息'
                    
                    // 格式1：从 parseResult.payoutCount 对象中提取（手动解析的）
                    if (parseResult?.payoutCount?.type === 'single') {
                      payoutCountDisplay = '单次赔付'
                    } else if (parseResult?.payoutCount?.maxCount) {
                      payoutCountDisplay = `最多${parseResult.payoutCount.maxCount}次`
                    }
                    // 格式2：从数据库字段中提取（责任库的）
                    else if (parseResult?.赔付次数) {
                      payoutCountDisplay = parseResult.赔付次数
                    }
                    
                    return (
                      <div key={index} style={{
                        padding: '12px',
                        background: '#f8fdfe',
                        borderRadius: '8px',
                        border: coverage.isSelected === false ? '2px dashed #ccc' : '2px solid #CAF4F7',
                        position: 'relative',
                        opacity: coverage.isSelected === false ? 0.6 : 1
                      }}>
                        {/* 右上角标签：必选/已选/未选 */}
                        <div style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px',
                          display: 'flex',
                          gap: '6px',
                          alignItems: 'center'
                        }}>
                          {/* 必选责任显示必选标签 */}
                          {coverage.isRequired === '必选' && (
                            <span style={{
                              padding: '5px 12px',
                              fontSize: '13px',
                              fontWeight: '600',
                              borderRadius: '12px',
                              background: '#ffebee',
                              color: '#c62828'
                            }}>
                              必选
                            </span>
                          )}
                          {/* 可选责任显示勾选框 */}
                          {coverage.isRequired !== '必选' && (
                            <label
                              onClick={() => {
                                const newCoverages = [...coverages]
                                newCoverages[index] = {
                                  ...coverage,
                                  isSelected: !coverage.isSelected
                                }
                                setCoverages(newCoverages)
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '13px',
                                fontWeight: '600',
                                color: coverage.isSelected === false ? '#999' : '#01BCD6',
                                cursor: 'pointer',
                                userSelect: 'none'
                              }}
                            >
                              {/* 勾选框 */}
                              <span style={{
                                width: '16px',
                                height: '16px',
                                border: coverage.isSelected === false ? '2px solid #ccc' : '2px solid #01BCD6',
                                borderRadius: '3px',
                                background: coverage.isSelected === false ? 'white' : '#01BCD6',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.3s'
                              }}>
                                {coverage.isSelected !== false && (
                                  <span style={{ color: 'white', fontSize: '12px', fontWeight: 'bold' }}>✓</span>
                                )}
                              </span>
                              {coverage.isSelected === false ? '未选' : '已选'}
                            </label>
                          )}
                        </div>
                        
                        {/* 责任名称 + 责任大类 + 小分类标签 */}
                        <div style={{ fontWeight: 600, marginBottom: '6px', paddingRight: '80px', fontSize: '15px' }}>
                          {coverage.name}
                          {/* 责任大类标签 */}
                          <span style={{
                            marginLeft: '8px',
                            padding: '2px 8px',
                            borderRadius: '8px',
                            fontSize: '11px',
                            fontWeight: '600',
                            background: coverage.type === '疾病责任' || coverage.type === '疾病类' ? '#e8f5e9' :
                                       coverage.type === '身故责任' || coverage.type === '身故类' ? '#ffebee' :
                                       coverage.type === '意外责任' || coverage.type === '意外类' ? '#fff3e0' :
                                       coverage.type === '年金责任' || coverage.type === '年金类' ? '#e3f2fd' : '#f5f5f5',
                            color: coverage.type === '疾病责任' || coverage.type === '疾病类' ? '#2e7d32' :
                                   coverage.type === '身故责任' || coverage.type === '身故类' ? '#c62828' :
                                   coverage.type === '意外责任' || coverage.type === '意外类' ? '#f57c00' :
                                   coverage.type === '年金责任' || coverage.type === '年金类' ? '#1565c0' : '#666'
                          }}>
                            {coverage.type || '未分类'}
                          </span>
                          {/* 小分类标签（重疾/中症/轻症/其他） */}
                          <span style={{
                            marginLeft: '6px',
                            padding: '2px 8px',
                            borderRadius: '8px',
                            fontSize: '11px',
                            fontWeight: '600',
                            background: detectCoverageCategory(coverage.name) === '重疾责任' ? '#ffebee' :
                                       detectCoverageCategory(coverage.name) === '中症责任' ? '#fff3e0' :
                                       detectCoverageCategory(coverage.name) === '轻症责任' ? '#e8f5e9' :
                                       detectCoverageCategory(coverage.name) === '其他' ? '#e3f2fd' : '#f5f5f5',
                            color: detectCoverageCategory(coverage.name) === '重疾责任' ? '#c62828' :
                                   detectCoverageCategory(coverage.name) === '中症责任' ? '#f57c00' :
                                   detectCoverageCategory(coverage.name) === '轻症责任' ? '#2e7d32' :
                                   detectCoverageCategory(coverage.name) === '其他' ? '#1565c0' : '#666'
                          }}>
                            {detectCoverageCategory(coverage.name)}
                          </span>
                        </div>
                        
                        {/* 🔑 理赔金额 + 赔付次数 */}
                        <div style={{ fontSize: '13px', color: '#666' }}>
                          <div style={{ marginBottom: '3px' }}>
                            <span style={{ marginRight: '4px' }}>💰 理赔金额：</span>
                            {payoutAmountDisplay}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div>
                              <span style={{ marginRight: '4px' }}>🔄 赔付次数：</span>
                              <span style={{ fontSize: '13px', color: '#666' }}>{payoutCountDisplay}</span>
                            </div>
                            {/* 编辑、删除按钮与赔付次数对齐 */}
                            <div style={{
                              display: 'flex',
                              gap: '6px',
                              marginLeft: 'auto'
                            }}>
                              <button
                                onClick={() => {
                                  // 🔑 编辑模式：只加载解析结果，不显示新增责任的输入表单
                                  setEditingIndex(index)
                                  setSelectedCoverageType(coverage.type)
                                  setClauseText(coverage.clause || '')
                                  setCoverageName(coverage.name)
                                  
                                  // 支持两种字段名
                                  const result = coverage.result || coverage.parseResult
                                  setParseResult(result)
                                  
                                  // 🔑 编辑模式不展开新增责任区域
                                  setShowCoverageInput(false)
                                  
                                  message.info('已加载责任信息，修改后点击"保存责任"更新')
                                  // 滚动到编辑区域
                                  window.scrollTo({ top: 0, behavior: 'smooth' })
                                }}
                                style={{
                                  fontSize: '13px',
                                  padding: '5px 14px',
                                  fontWeight: '500',
                                  background: '#01BCD6',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  transition: 'all 0.3s'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#00A8C0'
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '#01BCD6'
                                }}
                              >
                                编辑
                              </button>
                              <button
                                onClick={() => handleDeleteCoverage(index)}
                                style={{
                                  fontSize: '13px',
                                  padding: '5px 14px',
                                  fontWeight: '500',
                                  background: '#FF7A5C',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  transition: 'all 0.3s'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#FF6347'
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '#FF7A5C'
                                }}
                              >
                                删除
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 新增责任按钮 - 编辑模式时隐藏 */}
            {editingIndex === null && (
              <div style={{ marginBottom: '24px' }}>
                <button
                  type="button"
                  className="html-button-primary"
                  onClick={() => setShowCoverageInput(!showCoverageInput)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '15px',
                    fontWeight: '600',
                    border: '2px dashed #01BCD6',
                    background: showCoverageInput ? '#01BCD6' : 'white',
                    color: showCoverageInput ? 'white' : '#01BCD6'
                  }}
                >
                  {showCoverageInput ? '收起责任分析' : '+ 新增责任'}
                </button>
              </div>
            )}

            {/* 责任分析区域（可折叠）- 仅新增模式显示 */}
            {showCoverageInput && editingIndex === null && (
              <>
                {/* 责任类型选择 */}
                <div className="html-divider">
                  <div className="html-divider-line"></div>
                  <div className="html-divider-text">请选择责任类型</div>
                  <div className="html-divider-line"></div>
                </div>
            
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(4, 1fr)', 
              gap: '16px', 
              padding: '16px 0',
              marginBottom: '24px' 
            }}>
              {COVERAGE_TYPES.map(type => (
                <label key={type.value} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="coverageType"
                    value={type.value}
                    checked={selectedCoverageType === type.value}
                    onChange={(e) => setSelectedCoverageType(e.target.value)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--primary-color)' }}
                  />
                  <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{type.label}</span>
                </label>
              ))}
            </div>

            {/* 责任条款粘贴 */}
            <div className="html-divider">
              <div className="html-divider-line"></div>
              <div className="html-divider-text">粘贴责任条款</div>
              <div className="html-divider-line"></div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label className="html-label">
                保障责任条款 <span className="required">*</span>
              </label>
              <textarea
                className="html-textarea"
                placeholder="请仅粘贴一份责任的完整内容，既要确保内容无遗漏，也不要多粘其他责任或重复粘贴。第一行将自动识别为责任名称。"
                value={clauseText}
                onChange={(e) => setClauseText(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <button
                className="analyze-btn"
                onClick={handleAnalyzeCoverage}
                disabled={loading || !clauseText || !selectedCoverageType}
                style={{
                  width: '100%',
                  backgroundColor: '#01BCD6',
                  color: 'white',
                  border: '2px solid #01BCD6',
                  borderRadius: '8px',
                  padding: '12px 32px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: loading || !clauseText || !selectedCoverageType ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s'
                } as React.CSSProperties}
                onMouseEnter={(e) => {
                  if (!loading && clauseText && selectedCoverageType) {
                    e.currentTarget.style.backgroundColor = '#00A3BD'
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(1, 188, 214, 0.4)'
                    e.currentTarget.style.borderColor = '#01BCD6'
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#01BCD6'
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = 'none'
                  e.currentTarget.style.borderColor = '#01BCD6'
                }}
              >
                🔍 分析责任
              </button>
            </div>
              </>
            )}

            {/* 已移除重复的责任列表（已在上方显示） */}
            <div style={{ display: 'none' }}>
              {coverages.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {coverages.map((coverage, index) => (
                    <div key={index} style={{
                      padding: '16px',
                      background: '#f8fdfe',
                      borderRadius: '8px',
                      border: '2px solid #CAF4F7',
                      position: 'relative'
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: '8px', paddingRight: '140px', fontSize: '15px' }}>
                        {coverage.name}
                        <span style={{
                          marginLeft: '8px',
                          padding: '2px 8px',
                          borderRadius: '8px',
                          fontSize: '11px',
                          fontWeight: '600',
                          background: detectCoverageCategory(coverage.name) === '重疾责任' ? '#ffebee' :
                                     detectCoverageCategory(coverage.name) === '中症责任' ? '#fff3e0' :
                                     detectCoverageCategory(coverage.name) === '轻症责任' ? '#e8f5e9' :
                                     detectCoverageCategory(coverage.name) === '其他' ? '#e3f2fd' : '#f5f5f5',
                          color: detectCoverageCategory(coverage.name) === '重疾责任' ? '#c62828' :
                                 detectCoverageCategory(coverage.name) === '中症责任' ? '#f57c00' :
                                 detectCoverageCategory(coverage.name) === '轻症责任' ? '#2e7d32' :
                                 detectCoverageCategory(coverage.name) === '其他' ? '#1565c0' : '#666'
                        }}>
                          {detectCoverageCategory(coverage.name)}
                        </span>
                      </div>
                      {/* 赔付金额区间 */}
                      {coverage.result?.payoutAmount?.details?.tiers && coverage.result.payoutAmount.details.tiers.length > 0 && (
                        <div style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>
                          💰 赔付金额：
                          {(() => {
                            const tiers = coverage.result.payoutAmount.details.tiers
                            const firstTier = tiers[0]
                            const lastTier = tiers[tiers.length - 1]
                            
                            // 获取最小和最大金额
                            const amounts: number[] = []
                            tiers.forEach((tier: any) => {
                              if (tier.keyAmounts && tier.keyAmounts.length > 0) {
                                tier.keyAmounts.forEach((ka: any) => {
                                  if (typeof ka.amount === 'number') {
                                    amounts.push(ka.amount)
                                  }
                                })
                              } else if (tier.amount) {
                                amounts.push(typeof tier.amount === 'number' ? tier.amount : parseFloat(tier.amount))
                              }
                            })
                            
                            if (amounts.length > 0) {
                              const minAmount = Math.min(...amounts)
                              const maxAmount = Math.max(...amounts)
                              if (minAmount === maxAmount) {
                                return <span style={{ color: '#01BCD6', fontWeight: '600' }}>{minAmount.toFixed(1)}万元</span>
                              } else {
                                return <span style={{ color: '#01BCD6', fontWeight: '600' }}>{minAmount.toFixed(1)}-{maxAmount.toFixed(1)}万元</span>
                              }
                            }
                            return <span style={{ color: '#999' }}>未识别</span>
                          })()}
                        </div>
                      )}
                      {/* 赔付次数 */}
                      {(coverage.result?.payoutCount || coverage.result?.赔付次数) && (
                        <div style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>
                          🔢 赔付次数：
                          {(() => {
                            // 优先使用对象格式（手动解析的）
                            if (coverage.result.payoutCount) {
                              if (coverage.result.payoutCount.type === 'single') {
                                return <span style={{ fontWeight: '600' }}>单次赔付（合同终止）</span>
                              } else if (coverage.result.payoutCount.maxCount) {
                                return <span style={{ fontWeight: '600' }}>最多{coverage.result.payoutCount.maxCount}次</span>
                              } else {
                                return <span style={{ fontWeight: '600' }}>不限次数</span>
                              }
                            }
                            // 使用字符串格式（责任库的）
                            else if (coverage.result.赔付次数) {
                              return <span style={{ fontWeight: '600' }}>{coverage.result.赔付次数}</span>
                            }
                            return <span style={{ fontWeight: '600' }}>暂无信息</span>
                          })()}
                        </div>
                      )}
                      {coverage.result?.overallConfidence && (
                        <div style={{ fontSize: '12px', color: '#999', marginTop: '8px' }}>
                          置信度：{(coverage.result.overallConfidence * 100).toFixed(0)}%
                        </div>
                      )}
                      <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => {
                            // 编辑：恢复该责任的信息到输入区域和右侧显示
                            console.log('[编辑责任] 加载 coverage.result.payoutAmount.details.tiers:', 
                              coverage.result?.payoutAmount?.details?.tiers?.map((t: any, i: number) => ({
                                index: i + 1,
                                formula: t.formula,
                                formulaType: t.formulaType,
                                keyAmountsCount: t.keyAmounts?.length || 0,
                                firstAmount: t.keyAmounts?.[0]?.amount,
                                lastAmount: t.keyAmounts?.[t.keyAmounts?.length - 1]?.amount
                              }))
                            )
                            
                            // 根据当前的保障结束年份更新责任的保障结束年龄
                            let updatedResult = coverage.result
                            if (coverage.result?.payoutAmount?.details?.tiers && birthYear && coverageEndYear) {
                              const currentBirthYear = parseInt(birthYear)
                              const currentCoverageEndYear = coverageEndYear === 'lifetime' ? 100 : parseInt(coverageEndYear)
                              const newCoverageEndAge = coverageEndYear === 'lifetime' 
                                ? 100 
                                : currentCoverageEndYear - currentBirthYear
                              
                              console.log(`[编辑责任] 当前保障结束年份: ${coverageEndYear}, 对应年龄: ${newCoverageEndAge}岁`)
                              
                              // 更新每个tier的结束年龄和keyAmounts
                              const updatedTiers = coverage.result.payoutAmount.details.tiers.map((tier: any) => {
                                if (!tier.startAge || !tier.endAge) {
                                  return tier
                                }
                                
                                const currentStartAge = parseInt(tier.startAge.toString())
                                let currentEndAge = parseInt(tier.endAge.toString())
                                
                                // 如果结束年龄超过新的保障结束年龄，则限制为新的保障结束年龄
                                if (currentEndAge > newCoverageEndAge) {
                                  console.log(`[编辑责任] 阶段结束年龄从${currentEndAge}岁调整为${newCoverageEndAge}岁`)
                                  currentEndAge = newCoverageEndAge
                                  
                                  // 重新计算keyAmounts
                                  if (tier.keyAmounts && tier.keyAmounts.length > 0) {
                                    const filteredKeyAmounts = tier.keyAmounts.filter((ka: any) => ka.age <= newCoverageEndAge)
                                    return {
                                      ...tier,
                                      endAge: currentEndAge,
                                      keyAmounts: filteredKeyAmounts
                                    }
                                  }
                                }
                                
                                return {
                                  ...tier,
                                  endAge: currentEndAge
                                }
                              })
                              
                              updatedResult = {
                                ...coverage.result,
                                payoutAmount: {
                                  ...coverage.result.payoutAmount,
                                  details: {
                                    ...coverage.result.payoutAmount.details,
                                    tiers: updatedTiers
                                  }
                                }
                              }
                              
                              console.log('[编辑责任] 已根据当前保障结束年份更新责任的保障结束年龄')
                            }
                            
                            setEditingIndex(index) // 设置编辑索引
                            setSelectedCoverageType(coverage.type)
                            setClauseText(coverage.clause)
                            setCoverageName(coverage.name)
                            setParseResult(updatedResult)
                            message.info('已加载责任信息到编辑区，已根据当前保障结束年份更新保障结束年龄，修改后点击"保存责任"更新')
                            // 滚动到顶部
                            window.scrollTo({ top: 0, behavior: 'smooth' })
                          }}
                          style={{
                            background: '#01BCD6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '4px 12px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: '500'
                          }}
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => removeCoverage(index)}
                          style={{
                            background: '#ff4d4f',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '4px 12px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: '500'
                          }}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 合同完成按钮 */}
            <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '2px solid #e0e0e0' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                {/* 查看合同详情按钮 */}
                <button
                  onClick={() => setPreviewDrawerVisible(true)}
                  disabled={coverages.length === 0}
                  style={{ 
                    flex: 1,
                    backgroundColor: 'transparent',
                    color: coverages.length === 0 ? '#ccc' : '#01BCD6',
                    border: `1px solid ${coverages.length === 0 ? '#ccc' : '#01BCD6'}`,
                    borderRadius: '8px',
                    padding: '12px 24px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: coverages.length === 0 ? 'not-allowed' : 'pointer',
                    transition: 'all 0.3s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                  onMouseEnter={(e) => {
                    if (coverages.length > 0) {
                      e.currentTarget.style.backgroundColor = 'rgba(1, 188, 214, 0.1)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                  </svg>
                  查看合同详情
                </button>
                
                {/* 保存合同按钮 */}
                <button
                  className="complete-btn"
                  onClick={handleComplete}
                  disabled={coverages.length === 0}
                  style={{ 
                    flex: 1,
                    backgroundColor: '#01BCD6',
                    color: 'white',
                    border: '2px solid #01BCD6',
                    borderRadius: '8px',
                    padding: '12px 32px',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: coverages.length === 0 ? 'not-allowed' : 'pointer',
                    transition: 'all 0.3s'
                  } as React.CSSProperties}
                  onMouseEnter={(e) => {
                    if (coverages.length > 0) {
                      e.currentTarget.style.backgroundColor = '#00A3BD'
                      e.currentTarget.style.transform = 'translateY(-2px)'
                      e.currentTarget.style.boxShadow = '0 6px 16px rgba(1, 188, 214, 0.4)'
                      e.currentTarget.style.borderColor = '#01BCD6'
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#01BCD6'
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = 'none'
                    e.currentTarget.style.borderColor = '#01BCD6'
                  }}
                >
                  ✅ 保存合同
                </button>
              </div>
            </div>
          </div>

          {/* 右侧：解析结果 */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.7)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderRadius: '12px',
            padding: '24px',
            border: '2px solid #01BCD6'
          }}>
            <h2 style={{
              color: '#01BCD6',
              fontSize: '20px',
              marginBottom: '20px',
              paddingBottom: '12px',
              borderBottom: '2px solid #01BCD6'
            }}>📊 解析结果</h2>

            {loading && (
              <div className="html-loading">
                <div className="html-spinner"></div>
                <div>
                  <div style={{ padding: '12px', background: 'var(--bg-light)', borderLeft: '3px solid var(--primary-color)', borderRadius: '4px', marginBottom: '12px', fontSize: '14px' }}>
                    🤖 <strong>AI正在解析条款结构...</strong>
                  </div>
                  <div style={{ padding: '12px', background: 'var(--bg-light)', borderLeft: '3px solid var(--primary-color)', borderRadius: '4px', marginBottom: '12px', fontSize: '14px' }}>
                    📋 <strong>识别赔付阶段和计算公式...</strong>
                  </div>
                  <div style={{ padding: '12px', background: 'var(--bg-light)', borderLeft: '3px solid var(--primary-color)', borderRadius: '4px', marginBottom: '12px', fontSize: '14px' }}>
                    💰 <strong>结合您的保单信息计算实际金额...</strong>
                  </div>
                  <div style={{ padding: '8px 12px', background: '#fff3cd', borderLeft: '3px solid #ffc107', borderRadius: '4px', fontSize: '13px', color: '#856404' }}>
                    ⏱️ 预计还需50秒，请稍候...
                  </div>
                </div>
              </div>
            )}

            {!loading && !parseResult && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#999' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
                <div>请点击左侧"分析责任"按钮查看解析结果</div>
              </div>
            )}

            {!loading && parseResult && (
              <>
                {/* 检查是否不适用 */}
                {parseResult.status === 'not_applicable' ? (
                  <div style={{
                    padding: 24,
                    background: '#fff3cd',
                    border: '2px solid #ffc107',
                    borderRadius: 8,
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
                    <div style={{ fontSize: 18, fontWeight: '600', color: '#856404', display: 'block', marginBottom: 8 }}>
                      此责任不适用
                    </div>
                    <div style={{ fontSize: 14, color: '#856404' }}>
                      {parseResult.reason || parseResult.naturalLanguageDescription || '条件不满足'}
                    </div>
                  </div>
                ) : (
              <div>
                {/* 责任名称 - 始终显示，即使为空也允许用户输入 */}
                <div style={{ marginBottom: '16px' }}>
                  <label className="html-label">
                    责任名称
                    {coverageName && coverageName.trim() && (
                      <span style={{
                        marginLeft: '12px',
                        padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: '600',
                      background: detectCoverageCategory(coverageName) === '重疾责任' ? '#ffebee' :
                                 detectCoverageCategory(coverageName) === '中症责任' ? '#fff3e0' :
                                 detectCoverageCategory(coverageName) === '轻症责任' ? '#e8f5e9' :
                                 detectCoverageCategory(coverageName) === '其他' ? '#e3f2fd' : '#f5f5f5',
                      color: detectCoverageCategory(coverageName) === '重疾责任' ? '#c62828' :
                             detectCoverageCategory(coverageName) === '中症责任' ? '#f57c00' :
                             detectCoverageCategory(coverageName) === '轻症责任' ? '#2e7d32' :
                             detectCoverageCategory(coverageName) === '其他' ? '#1565c0' : '#666'
                    }}>
                      {detectCoverageCategory(coverageName)}
                    </span>
                    )}
                  </label>
                  <input
                    type="text"
                    className="html-input"
                    value={coverageName}
                    onChange={(e) => setCoverageName(e.target.value)}
                    placeholder="请输入或编辑责任名称"
                  />
                </div>

                {/* 理赔金额 */}
                {parseResult.payoutAmount && (
                  <div style={{ 
                    marginBottom: '16px',
                    padding: '20px',
                    background: '#f8fdfe',
                    borderRadius: '8px',
                    border: '2px solid #CAF4F7'
                  }}>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      marginBottom: '12px'
                    }}>
                      <h3 style={{ 
                        fontSize: '16px', 
                        fontWeight: '600', 
                        color: '#333',
                        margin: 0
                      }}>
                        💰 理赔金额
                      </h3>
                      {parseResult.payoutAmount.confidence && (
                        <span style={{
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '600',
                          background: parseResult.payoutAmount.confidence >= 0.8 ? '#e8f5e9' : 
                                     parseResult.payoutAmount.confidence >= 0.5 ? '#fff3e0' : '#ffebee',
                          color: parseResult.payoutAmount.confidence >= 0.8 ? '#2e7d32' : 
                                parseResult.payoutAmount.confidence >= 0.5 ? '#f57c00' : '#c62828'
                        }}>
                          置信度: {parseResult.payoutAmount.confidence >= 0.8 ? '高' : 
                                 parseResult.payoutAmount.confidence >= 0.5 ? '中' : '低'} 
                          ({Math.round(parseResult.payoutAmount.confidence * 100)}%)
                        </span>
                      )}
                    </div>

                    {/* 自然语言描述 */}
                    {(() => {
                      // 兼容多种数据结构
                      const naturalDesc = parseResult.payoutAmount.extractedText || 
                                         parseResult.payoutAmount.naturalLanguageDescription ||
                                         parseResult.naturalLanguageDesc ||
                                         (Array.isArray(parseResult.payoutAmount) && parseResult.payoutAmount.length > 0 
                                           ? parseResult.payoutAmount.map((p: any) => p.naturalLanguageDescription).filter(Boolean).join('\n')
                                           : null)
                      
                      if (!naturalDesc) return null
                      
                      return (
                        <div style={{ 
                          marginBottom: '12px',
                          fontSize: '14px',
                          color: '#333',
                          lineHeight: '1.6'
                        }}>
                          <span style={{ marginRight: '6px' }}>📝</span>
                          <span style={{ fontWeight: '600' }}>自然语言描述:</span>
                          <span style={{ marginLeft: '8px', color: '#666' }}>
                            {Array.isArray(naturalDesc) 
                              ? naturalDesc.join('；')
                              : naturalDesc}
                          </span>
                        </div>
                      )
                    })()}

                    {/* 阶段详情 */}
                    {(() => {
                      // 兼容两种数据结构：payoutAmount.details.tiers 或 payoutAmount.tiers
                      const tiers = parseResult.payoutAmount.details?.tiers || parseResult.payoutAmount.tiers || []
                      
                      // 如果没有阶段数据，显示提示信息
                      if (tiers.length === 0) {
                        return (
                          <div style={{
                            padding: '16px',
                            background: '#fff3cd',
                            border: '1px solid #ffc107',
                            borderRadius: '8px',
                            marginTop: '12px'
                          }}>
                            <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: '600', color: '#856404' }}>
                              ⚠️ 未能解析出赔付阶段信息
                            </div>
                            <div style={{ fontSize: '13px', color: '#856404' }}>
                              可能原因：
                              <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                                <li>条款中没有明确的赔付金额信息</li>
                                <li>赔付条件过于复杂，大模型无法识别</li>
                                <li>所有阶段被过滤（如年龄条件不符）</li>
                              </ul>
                              建议：请检查条款内容，或手动添加阶段信息
                            </div>
                          </div>
                        )
                      }
                      
                      return (
                        <div>
                          {tiers.map((tier: any, index: number) => (
                            <TierDisplay 
                              key={index} 
                              tier={tier} 
                              index={index}
                              totalTiers={tiers.length}
                              policyInfo={{
                                birthYear: parseInt(birthYear),
                                policyStartYear: parseInt(policyStartYear),
                                coverageEndYear,
                                basicSumInsured: parseFloat(basicSumInsured) * 10000 || 0 // 转换为元
                              }}
                              onUpdate={(idx, updatedTier) => {
                                console.log(`[onUpdate] 阶段${idx + 1}更新:`, {
                                  startAge: updatedTier.startAge,
                                  endAge: updatedTier.endAge,
                                  formula: updatedTier.formula,
                                  formulaType: updatedTier.formulaType,
                                  hasKeyAmounts: !!updatedTier.keyAmounts,
                                  keyAmountsLength: updatedTier.keyAmounts?.length || 0
                                })
                                
                                const newTiers = [...tiers]
                                const oldTier = newTiers[idx]
                                newTiers[idx] = updatedTier
                                
                                // 🔗 阶段衔接逻辑：如果修改了结束年龄，自动调整下一阶段的开始年龄
                                if (updatedTier.endAge !== oldTier.endAge && idx < newTiers.length - 1) {
                                  const nextTier = newTiers[idx + 1]
                                  if (updatedTier.endAge !== 'lifetime' && typeof updatedTier.endAge === 'number') {
                                    nextTier.startAge = updatedTier.endAge + 1
                                  }
                                }
                                
                                // 🔗 阶段衔接逻辑：如果修改了开始年龄，自动调整上一阶段的结束年龄
                                if (updatedTier.startAge !== oldTier.startAge && idx > 0) {
                                  const prevTier = newTiers[idx - 1]
                                  if (typeof updatedTier.startAge === 'number') {
                                    prevTier.endAge = updatedTier.startAge - 1
                                  }
                                }
                                
                                setParseResult({
                                  ...parseResult,
                                  payoutAmount: {
                                    ...parseResult.payoutAmount,
                                    details: {
                                      ...parseResult.payoutAmount.details,
                                      tiers: newTiers
                                    }
                                  }
                                })
                              }}
                              onDelete={(idx) => {
                                const newTiers = tiers.filter((_: any, i: number) => i !== idx)
                                setParseResult({
                                  ...parseResult,
                                  payoutAmount: {
                                    ...parseResult.payoutAmount,
                                    details: {
                                      ...parseResult.payoutAmount.details,
                                      tiers: newTiers
                                    }
                                  }
                                })
                              }}
                            />
                          ))}
                          {/* 添加新阶段按钮 */}
                          <button
                            onClick={() => {
                              // 🔗 新阶段的开始年龄自动连接到上一阶段的结束年龄+1
                              const lastTier = tiers[tiers.length - 1]
                              const policyStartAge = parseInt(policyStartYear) - parseInt(birthYear)
                              const newStartAge = lastTier && typeof lastTier.endAge === 'number' 
                                ? lastTier.endAge + 1 
                                : policyStartAge
                              
                              // 计算结束年龄（默认到100岁）
                              const defaultEndAge = 100
                              
                              // 初始化keyAmounts（基于基本保额100%计算）
                              const basicSumInsuredWan = parseFloat(basicSumInsured)
                              const initialKeyAmounts: any[] = []
                              for (let age = newStartAge; age <= defaultEndAge; age++) {
                                initialKeyAmounts.push({
                                  year: parseInt(birthYear) + age,
                                  age: age,
                                  amount: basicSumInsuredWan // 基本保额×100%
                                })
                              }
                              
                              const newTier = {
                                period: '新阶段',
                                formula: '基本保额×100%',
                                formulaType: 'fixed',
                                startAge: newStartAge,
                                endAge: defaultEndAge,
                                keyAmounts: initialKeyAmounts
                              }
                              const newTiers = [...tiers, newTier]
                              setParseResult({
                                ...parseResult,
                                payoutAmount: {
                                  ...parseResult.payoutAmount,
                                  details: {
                                    ...parseResult.payoutAmount.details,
                                    tiers: newTiers
                                  }
                                }
                              })
                              
                              message.success('已添加新阶段，请根据需要调整公式和年龄范围')
                            }}
                            style={{
                              width: '100%',
                              padding: '12px',
                              marginTop: '12px',
                              background: '#01BCD6',
                              border: 'none',
                              borderRadius: '8px',
                              color: '#fff',
                              fontSize: '14px',
                              fontWeight: '600',
                              cursor: 'pointer',
                              transition: 'all 0.3s'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#00A3BD'
                              e.currentTarget.style.transform = 'translateY(-2px)'
                              e.currentTarget.style.boxShadow = '0 4px 12px rgba(1, 188, 214, 0.3)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = '#01BCD6'
                              e.currentTarget.style.transform = 'translateY(0)'
                              e.currentTarget.style.boxShadow = 'none'
                            }}
                          >
                            ➕ 添加新阶段
                          </button>
                        </div>
                      )
                    })()}
                  </div>
                )}

                {/* 其他字段 - 赔付次数（兼容两种格式） */}
                {(parseResult.payoutCount || parseResult.赔付次数) && (
                  <OtherFieldDisplay
                    title="赔付次数"
                    data={(() => {
                      // 从note中提取与"赔付次数"相关的原文
                      const noteText = parseResult.note || ''
                      const noteParts = noteText.split(/[；;]/)
                      const countKeywords = ['次为限', '限赔', '限给付', '最多赔', '累计']
                      const extractedFromNote = noteParts.filter((part: string) => 
                        countKeywords.some(kw => part.includes(kw))
                      ).join('；')
                      
                      if (parseResult.payoutCount) {
                        return { ...parseResult.payoutCount, extractedText: extractedFromNote || parseResult.payoutCount.extractedText }
                      }
                      return { extractedText: extractedFromNote || parseResult.赔付次数 }
                    })()}
                    note={parseResult.note}
                    renderContent={(data) => {
                      // 兼容两种格式：
                      // 1. payoutCount对象格式：{ type: 'single', maxCount: 1 }
                      // 2. 赔付次数字符串格式："1次"、"最多3次"
                      let value = '1'
                      if (data?.type === 'single') {
                        value = '1'
                      } else if (data?.type === 'multiple' && data?.maxCount) {
                        value = data.maxCount.toString()
                      } else if (parseResult.赔付次数) {
                        // 从字符串中提取数字
                        const match = parseResult.赔付次数.match(/(\d+)/)
                        value = match ? match[1] : '1'
                      }
                      return (
                        <div style={{ marginTop: '12px', position: 'relative', display: 'inline-block' }}>
                          <input
                            type="number"
                            min="1"
                            value={value}
                            onChange={(e) => {
                              const newValue = parseInt(e.target.value) || 1
                              setParseResult({
                                ...parseResult,
                                payoutCount: {
                                  ...parseResult.payoutCount,
                                  maxCount: newValue,
                                  type: newValue === 1 ? 'single' : 'multiple'
                                },
                                赔付次数: newValue === 1 ? '1次' : `最多${newValue}次`
                              })
                            }}
                            style={{
                              width: '150px',
                              padding: '10px 35px 10px 12px',
                              border: '2px solid #CAF4F7',
                              borderRadius: '6px',
                              fontSize: '14px',
                              background: '#ffffff'
                            }}
                          />
                          <span style={{
                            position: 'absolute',
                            right: '10px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: '#666',
                            fontSize: '14px',
                            pointerEvents: 'none',
                            userSelect: 'none'
                          }}>
                            次
                          </span>
                        </div>
                      )
                    }}
                  />
                )}

                {/* 其他字段 - 是否分组（兼容责任库格式） */}
                <OtherFieldDisplay
                  title="是否分组"
                  data={(() => {
                    // 从note中提取与"是否分组"相关的原文
                    const noteText = parseResult.note || ''
                    const noteParts = noteText.split(/[；;]/)
                    const groupKeywords = ['分组', '组别', '同组', '不同组']
                    const extractedFromNote = noteParts.filter((part: string) => 
                      groupKeywords.some(kw => part.includes(kw))
                    ).join('；')
                    
                    if (parseResult.grouping) {
                      return { ...parseResult.grouping, extractedText: parseResult.grouping.extractedText || extractedFromNote }
                    }
                    // 即使 是否分组 是 undefined，也返回带有 extractedText 的对象
                    return { isGrouped: parseResult.是否分组, extractedText: extractedFromNote || '' }
                  })()}
                  payoutCountData={parseResult.payoutCount || (parseResult.赔付次数 === '1次' ? { type: 'single' } : null)}
                  note={parseResult.note}
                    renderContent={(data, payoutCountData) => {
                      const isSinglePayout = payoutCountData?.type === 'single' || parseResult.赔付次数 === '1次'
                      let defaultValue = 'not_grouped'
                      if (isSinglePayout) {
                        defaultValue = 'not_applicable'
                      } else if (data?.isGrouped !== undefined) {
                        defaultValue = data.isGrouped ? 'grouped' : 'not_grouped'
                      } else if (parseResult.是否分组 !== undefined) {
                        defaultValue = parseResult.是否分组 ? 'grouped' : 'not_grouped'
                      }
                      return (
                        <div style={{ marginTop: '12px', display: 'flex', gap: '16px', alignItems: 'center' }}>
                          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name="groupingRadio"
                              value="grouped"
                              checked={defaultValue === 'grouped'}
                              onChange={() => {
                                setParseResult({
                                  ...parseResult,
                                  grouping: { ...parseResult.grouping, isGrouped: true }
                                })
                              }}
                              style={{ marginRight: '6px', accentColor: '#CAF4F7' }}
                            />
                            <span>分组</span>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name="groupingRadio"
                              value="not_grouped"
                              checked={defaultValue === 'not_grouped'}
                              onChange={() => {
                                setParseResult({
                                  ...parseResult,
                                  grouping: { ...parseResult.grouping, isGrouped: false }
                                })
                              }}
                              style={{ marginRight: '6px', accentColor: '#CAF4F7' }}
                            />
                            <span>不分组</span>
                          </label>
                          {isSinglePayout && (
                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name="groupingRadio"
                                value="not_applicable"
                                checked={defaultValue === 'not_applicable'}
                                onChange={() => {
                                  setParseResult({
                                    ...parseResult,
                                    grouping: null
                                  })
                                }}
                                style={{ marginRight: '6px', accentColor: '#CAF4F7' }}
                              />
                              <span>一次赔付不涉及</span>
                            </label>
                          )}
                        </div>
                      )
                    }}
                  />

                {/* 其他字段 - 是否可以重复赔付（兼容责任库格式） */}
                <OtherFieldDisplay
                    title="是否可以重复赔付"
                    data={(() => {
                      // 从note中提取与"是否可以重复赔付"相关的原文
                      const noteText = parseResult.note || ''
                      const noteParts = noteText.split(/[；;]/)
                      const repeatKeywords = ['重复', '再次', '多次', '限赔', '限给付', '累计', '最多赔']
                      const extractedFromNote = noteParts.filter((part: string) => 
                        repeatKeywords.some(kw => part.includes(kw))
                      ).join('；')
                      
                      if (parseResult.repeatablePayout) {
                        return { ...parseResult.repeatablePayout, extractedText: parseResult.repeatablePayout.extractedText || extractedFromNote }
                      }
                      // 即使 是否可以重复赔付 是 undefined，也返回带有 extractedText 的对象
                      return { isRepeatable: parseResult.是否可以重复赔付, extractedText: extractedFromNote || '' }
                    })()}
                    payoutCountData={parseResult.payoutCount || (parseResult.赔付次数 === '1次' ? { type: 'single' } : null)}
                    note={parseResult.note}
                    renderContent={(data, payoutCountData) => {
                      const isSinglePayout = payoutCountData?.type === 'single' || parseResult.赔付次数 === '1次'
                      
                      // 从note中智能判断是否可以重复赔付
                      const noteText = parseResult.note || ''
                      // 如果note中包含"每种...限赔1次"或"每种...限给付一次"等，说明不可以重复赔付
                      const hasNotRepeatableKeyword = /每种.{0,5}限赔1次|每种.{0,5}限给付一次|每种.{0,5}仅给付一次|每种.{0,5}只给付一次|给付以1次为限|给付以一次为限/.test(noteText)
                      
                      let defaultValue = hasNotRepeatableKeyword ? 'not_repeatable' : 'repeatable'
                      if (isSinglePayout) {
                        defaultValue = 'not_applicable'
                      } else if (typeof data === 'object' && data?.isRepeatable !== undefined) {
                        defaultValue = data.isRepeatable ? 'repeatable' : 'not_repeatable'
                      } else if (typeof data === 'boolean') {
                        defaultValue = data ? 'repeatable' : 'not_repeatable'
                      } else if (parseResult.是否可以重复赔付 !== undefined) {
                        defaultValue = parseResult.是否可以重复赔付 ? 'repeatable' : 'not_repeatable'
                      }
                      return (
                        <div style={{ marginTop: '12px', display: 'flex', gap: '16px', alignItems: 'center' }}>
                          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name="repeatablePayoutRadio"
                              value="repeatable"
                              checked={defaultValue === 'repeatable'}
                              onChange={() => {
                                setParseResult({
                                  ...parseResult,
                                  repeatablePayout: { ...parseResult.repeatablePayout, isRepeatable: true }
                                })
                              }}
                              style={{ marginRight: '6px', accentColor: '#CAF4F7' }}
                            />
                            <span>可以</span>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name="repeatablePayoutRadio"
                              value="not_repeatable"
                              checked={defaultValue === 'not_repeatable'}
                              onChange={() => {
                                setParseResult({
                                  ...parseResult,
                                  repeatablePayout: { ...parseResult.repeatablePayout, isRepeatable: false }
                                })
                              }}
                              style={{ marginRight: '6px', accentColor: '#CAF4F7' }}
                            />
                            <span>不可以</span>
                          </label>
                          {isSinglePayout && (
                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name="repeatablePayoutRadio"
                                value="not_applicable"
                                checked={defaultValue === 'not_applicable'}
                                onChange={() => {
                                  setParseResult({
                                    ...parseResult,
                                    repeatablePayout: null
                                  })
                                }}
                                style={{ marginRight: '6px', accentColor: '#CAF4F7' }}
                              />
                              <span>一次赔付不涉及</span>
                            </label>
                          )}
                        </div>
                      )
                    }}
                  />

                {/* 其他字段 - 间隔期（兼容责任库格式） */}
                <OtherFieldDisplay
                  title="间隔期"
                  data={(() => {
                    // 从note中提取与"间隔期"相关的原文
                    const noteText = parseResult.note || ''
                    const noteParts = noteText.split(/[；;]/)
                    const intervalKeywords = ['间隔', '相隔', '之后', '日后', '天后', '年后']
                    const extractedFromNote = noteParts.filter((part: string) => 
                      intervalKeywords.some(kw => part.includes(kw))
                    ).join('；')
                    
                    if (parseResult.intervalPeriod) {
                      return { ...parseResult.intervalPeriod, extractedText: extractedFromNote || parseResult.intervalPeriod.extractedText }
                    }
                    if (parseResult.间隔期) {
                      return { hasInterval: true, days: parseInt(parseResult.间隔期.match(/\d+/)?.[0] || '0'), extractedText: extractedFromNote || parseResult.间隔期 }
                    }
                    return null
                  })()}
                  payoutCountData={parseResult.payoutCount || (parseResult.赔付次数 === '1次' ? { type: 'single' } : null)}
                  note={parseResult.note}
                    renderContent={(data, payoutCountData) => {
                      const isSinglePayout = payoutCountData?.type === 'single' || parseResult.赔付次数 === '1次'
                      let value = '0'
                      if (data?.hasInterval === false) {
                        value = '0'
                      } else if (data?.hasInterval && data?.days) {
                        value = data.days.toString()
                      } else if (parseResult.间隔期) {
                        // 从字符串中提取数字，如"间隔180天"
                        const match = parseResult.间隔期.match(/(\d+)/)
                        value = match ? match[1] : '0'
                      }
                      if (isSinglePayout) {
                        value = '0'
                      }
                      return (
                        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                          <div style={{ position: 'relative', display: 'inline-block', flex: '0 0 auto' }}>
                            <input
                              type="number"
                              min="0"
                              value={value}
                              onChange={(e) => {
                                const newDays = parseInt(e.target.value) || 0
                                setParseResult({
                                  ...parseResult,
                                  intervalPeriod: {
                                    ...parseResult.intervalPeriod,
                                    hasInterval: newDays > 0,
                                    days: newDays
                                  }
                                })
                              }}
                              style={{
                                width: '150px',
                                padding: '10px 35px 10px 12px',
                                border: '2px solid #CAF4F7',
                                borderRadius: '6px',
                                fontSize: '14px',
                                background: '#ffffff'
                              }}
                            />
                            <span style={{
                              position: 'absolute',
                              right: '10px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              color: '#666',
                              fontSize: '14px',
                              pointerEvents: 'none',
                              userSelect: 'none'
                            }}>
                              天
                            </span>
                          </div>
                          <div style={{ flex: 1 }}></div>
                          <div style={{
                            flexShrink: 0,
                            fontSize: '12px',
                            color: '#999',
                            fontStyle: 'italic',
                            whiteSpace: 'nowrap'
                          }}>
                            💡 注：输入0表示无间隔期
                          </div>
                        </div>
                      )
                    }}
                  />

                {/* 其他字段 - 疾病发生是否豁免保费（兼容责任库格式） */}
                <OtherFieldDisplay
                    title="疾病发生是否豁免保费"
                    data={parseResult.premiumWaiver || (parseResult.是否豁免 !== undefined ? { isWaived: parseResult.是否豁免 } : null)}
                    renderContent={(data) => {
                      let defaultValue = 'not_waived'
                      if (typeof data === 'object' && data?.isWaived !== undefined) {
                        defaultValue = data.isWaived ? 'waived' : 'not_waived'
                      } else if (typeof data === 'boolean') {
                        defaultValue = data ? 'waived' : 'not_waived'
                      } else if (parseResult.是否豁免 !== undefined) {
                        defaultValue = parseResult.是否豁免 ? 'waived' : 'not_waived'
                      }
                      return (
                        <div style={{ marginTop: '12px', display: 'flex', gap: '16px', alignItems: 'center' }}>
                          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name="premiumWaiverRadio"
                              value="waived"
                              checked={defaultValue === 'waived'}
                              onChange={() => {
                                setParseResult({
                                  ...parseResult,
                                  premiumWaiver: { ...parseResult.premiumWaiver, isWaived: true }
                                })
                              }}
                              style={{ marginRight: '6px', accentColor: '#CAF4F7' }}
                            />
                            <span>豁免</span>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name="premiumWaiverRadio"
                              value="not_waived"
                              checked={defaultValue === 'not_waived'}
                              onChange={() => {
                                setParseResult({
                                  ...parseResult,
                                  premiumWaiver: { ...parseResult.premiumWaiver, isWaived: false }
                                })
                              }}
                              style={{ marginRight: '6px', accentColor: '#CAF4F7' }}
                            />
                            <span>不豁免</span>
                          </label>
                        </div>
                      )
                    }}
                  />

                {/* 保存责任按钮 */}
                {!loading && parseResult && (
                  <div style={{ 
                    marginTop: '24px',
                    paddingTop: '24px',
                    borderTop: '2px solid #CAF4F7'
                  }}>
                    <button
                      onClick={() => {
                        if (!coverageName || !coverageName.trim()) {
                          message.warning('请输入责任名称')
                          return
                        }
                        
                        // 🔍 校验阶段时间是否重叠
                        const tiers = parseResult?.payoutAmount?.details?.tiers || []
                        if (tiers.length > 1) {
                          // 按开始年龄排序
                          const sortedTiers = [...tiers].sort((a: any, b: any) => {
                            const aStart = a.startAge ?? a.keyAmounts?.[0]?.age ?? 0
                            const bStart = b.startAge ?? b.keyAmounts?.[0]?.age ?? 0
                            return aStart - bStart
                          })
                          
                          // 检查是否有重叠
                          for (let i = 0; i < sortedTiers.length - 1; i++) {
                            const currentTier = sortedTiers[i]
                            const nextTier = sortedTiers[i + 1]
                            
                            const currentEnd = currentTier.endAge ?? currentTier.keyAmounts?.[currentTier.keyAmounts?.length - 1]?.age
                            const nextStart = nextTier.startAge ?? nextTier.keyAmounts?.[0]?.age
                            
                            if (currentEnd && nextStart && currentEnd >= nextStart) {
                              message.error(`阶段时间重叠：第${i + 1}阶段结束年龄(${currentEnd}岁)不能大于或等于第${i + 2}阶段开始年龄(${nextStart}岁)`)
                              return
                            }
                          }
                        }
                        
                        // 🔄 保存前自动重新计算所有阶段（确保数据一致性）
                        // 先输出当前 parseResult 的状态
                        console.log('[保存责任-开始] 当前 parseResult.payoutAmount.details.tiers:', 
                          parseResult?.payoutAmount?.details?.tiers?.map((t: any, i: number) => ({
                            index: i + 1,
                            formula: t.formula,
                            formulaType: t.formulaType,
                            startAge: t.startAge,
                            endAge: t.endAge
                          }))
                        )
                        
                        let finalParseResult = { ...parseResult }
                        
                        if (parseResult?.payoutAmount?.details?.tiers) {
                          message.loading({ content: '正在重新计算各阶段金额...', key: 'recalc', duration: 0 })
                          
                          const policyInfo = {
                            birthYear: parseInt(birthYear),
                            policyStartYear: parseInt(policyStartYear),
                            coverageEndYear: coverageEndYear === 'lifetime' ? 'lifetime' : parseInt(coverageEndYear),
                            basicSumInsured: parseFloat(basicSumInsured) * 10000,
                            annualPremium: parseFloat(annualPremium),
                            totalPaymentPeriod: totalPaymentPeriod === 'lifetime' ? 'lifetime' : parseInt(totalPaymentPeriod),
                          }
                          
                          const policyStartAge = policyInfo.policyStartYear - policyInfo.birthYear
                          const basicSumInsuredWan = policyInfo.basicSumInsured / 10000
                          
                          // 遍历所有阶段，重新计算 keyAmounts
                          const recalculatedTiers = parseResult.payoutAmount.details.tiers.map((tier: any, tierIndex: number) => {
                            // 🔑 关键修复：如果 startAge/endAge 是 undefined，从 keyAmounts 中提取
                            const actualStartAge = tier.startAge ?? tier.keyAmounts?.[0]?.age
                            const actualEndAge = tier.endAge ?? tier.keyAmounts?.[tier.keyAmounts?.length - 1]?.age
                            
                            console.log(`[保存-重新计算] 阶段${tierIndex + 1}:`, {
                              'tier.startAge': tier.startAge,
                              'tier.endAge': tier.endAge,
                              'actualStartAge': actualStartAge,
                              'actualEndAge': actualEndAge,
                              formula: tier.formula,
                              formulaType: tier.formulaType,
                              interestRate: tier.interestRate,
                              hasKeyAmounts: !!tier.keyAmounts,
                              keyAmountsLength: tier.keyAmounts?.length || 0
                            })
                            
                            // 如果没有年龄范围或公式，跳过
                            if (!actualStartAge || !actualEndAge || !tier.formula) {
                              console.log(`[保存-重新计算] 阶段${tierIndex + 1}: 跳过（缺少必要字段）`)
                              return tier
                            }
                            
                            const currentStartAge = parseInt(actualStartAge.toString())
                            const currentEndAge = parseInt(actualEndAge.toString())
                            const formula = tier.formula || ''
                            const formulaType = tier.formulaType || 'fixed'
                            const interestRate = parseFloat(tier.interestRate?.toString() || '0') / 100
                            
                            console.log(`[保存-重新计算] 阶段${tierIndex + 1}: 开始计算，年龄范围${currentStartAge}-${currentEndAge}，公式类型=${formulaType}，公式="${formula}"`)
console.log(`[保存-重新计算] 基础信息: 投保金额=${basicSumInsuredWan}万元，投保年龄=${policyStartAge}岁`)
                            
                            const newKeyAmounts: any[] = []
                            
                            for (let age = currentStartAge; age <= currentEndAge; age++) {
                              const year = policyInfo.birthYear + age
                              const n = age - policyStartAge
                              let amount = 0
                              
                              if (formulaType === 'compound') {
                                amount = basicSumInsuredWan * Math.pow(1 + interestRate, n)
                              } else if (formulaType === 'simple') {
                                amount = basicSumInsuredWan * (1 + interestRate * n)
                              } else if (formulaType === 'fixed') {
                                const percentMatch = formula.match(/(\d+(?:\.\d+)?)%/)
                                const ratioMatch = formula.match(/[×*]\s*(\d+(?:\.\d+)?)(?!%)/)
                                
                                if (age === currentStartAge) {
                                  console.log(`[保存-计算公式] 公式="${formula}"，百分比匹配:`, percentMatch?.[1], '倍数匹配:', ratioMatch?.[1])
                                }
                                
                                if (percentMatch) {
                                  const percent = parseFloat(percentMatch[1])
                                  amount = basicSumInsuredWan * (percent / 100)
                                  if (age === currentStartAge) {
                                    console.log(`[保存-计算公式] 使用百分比: ${percent}% → ${basicSumInsuredWan} × ${percent/100} = ${amount}`)
                                  }
                                } else if (ratioMatch) {
                                  const ratio = parseFloat(ratioMatch[1])
                                  amount = basicSumInsuredWan * ratio
                                  if (age === currentStartAge) {
                                    console.log(`[保存-计算公式] 使用倍数: ×${ratio} → ${basicSumInsuredWan} × ${ratio} = ${amount}`)
                                  }
                                } else {
                                  amount = basicSumInsuredWan
                                  if (age === currentStartAge) {
                                    console.log(`[保存-计算公式] 未匹配到百分比或倍数，使用默认100% → ${amount}`)
                                  }
                                }
                              } else {
                                amount = basicSumInsuredWan
                              }
                              
                              newKeyAmounts.push({
                                year,
                                age,
                                amount: parseFloat(amount.toFixed(1))
                              })
                            }
                            
                            console.log(`[保存-重新计算] 阶段${tierIndex + 1}: 计算完成，共${newKeyAmounts.length}个年份，前3个:`, newKeyAmounts.slice(0, 3))
                            
                            return {
                              ...tier,
                              startAge: currentStartAge,  // 🔑 确保保存正确的年龄范围
                              endAge: currentEndAge,
                              keyAmounts: newKeyAmounts
                            }
                          })
                          
                          finalParseResult = {
                            ...parseResult,
                            payoutAmount: {
                              ...parseResult.payoutAmount,
                              details: {
                                ...parseResult.payoutAmount.details,
                                tiers: recalculatedTiers
                              }
                            }
                          }
                          
                          // 🔑 关键：同步更新当前的 parseResult 状态，确保界面显示最新数据
                          setParseResult(finalParseResult)
                          
                          message.success({ content: '重新计算完成', key: 'recalc', duration: 1 })
                        }
                        
                        const updatedCoverage: Coverage = {
                          name: coverageName.trim(),
                          type: selectedCoverageType,
                          clause: clauseText,
                          result: finalParseResult,
                          policyType: policyType,
                          source: 'custom' as const,
                          isSelected: true, // 新增责任默认选中
                          isRequired: '可选' // 自定义责任默认可选
                        }
                        
                        console.log('[保存责任] 最终保存的 coverage.result.payoutAmount.details.tiers:', 
                          updatedCoverage.result?.payoutAmount?.details?.tiers?.map((t: any, i: number) => ({
                            index: i + 1,
                            formula: t.formula,
                            formulaType: t.formulaType,
                            keyAmountsCount: t.keyAmounts?.length || 0,
                            firstAmount: t.keyAmounts?.[0]?.amount,
                            lastAmount: t.keyAmounts?.[t.keyAmounts?.length - 1]?.amount
                          }))
                        )
                        
                        if (editingIndex !== null) {
                          // 更新模式：替换现有责任
                          const newCoverages = [...coverages]
                          newCoverages[editingIndex] = updatedCoverage
                          setCoverages(newCoverages)
                          
                          // 调试：输出更新后的责任数据
                          console.log('[保存责任] 更新后的 coverage 金额范围:', (() => {
                            const tiers = updatedCoverage.result?.payoutAmount?.details?.tiers || []
                            const amounts: number[] = []
                            tiers.forEach((tier: any) => {
                              if (tier.keyAmounts && tier.keyAmounts.length > 0) {
                                tier.keyAmounts.forEach((ka: any) => {
                                  if (typeof ka.amount === 'number') {
                                    amounts.push(ka.amount)
                                  }
                                })
                              }
                            })
                            if (amounts.length > 0) {
                              return `${Math.min(...amounts).toFixed(1)}-${Math.max(...amounts).toFixed(1)}万元`
                            }
                            return '未识别'
                          })())
                          
                          message.success({ content: '责任已更新', key: 'save' })
                          setEditingIndex(null)
                        } else {
                          // 新增模式：检查责任名称是否重复
                          const duplicateIndex = coverages.findIndex(existing => 
                            existing.name.trim() === updatedCoverage.name.trim()
                          )
                          
                          if (duplicateIndex >= 0) {
                            // 使用 Modal.confirm 询问用户是否要保存
                            Modal.confirm({
                              title: '责任名称重复',
                              content: `已存在名称为"${updatedCoverage.name}"的责任，是否仍要保存？`,
                              okText: '保存',
                              cancelText: '取消',
                              onOk: () => {
                                setCoverages([...coverages, updatedCoverage])
                                message.success({ content: '责任已保存到列表', key: 'save' })
                                // 清空解析结果和输入
                                setParseResult(null)
                                setClauseText('')
                                setSelectedCoverageType('')
                                setCoverageName('')
                              }
                            })
                            return
                          }
                          
                          // 新增模式：添加到责任列表
                          setCoverages([...coverages, updatedCoverage])
                          message.success({ content: '责任已保存到列表', key: 'save' })
                        }
                        
                        // 清空解析结果和输入
                        setParseResult(null)
                        setClauseText('')
                        setSelectedCoverageType('')
                        setCoverageName('')
                      }}
                      style={{
                        width: '100%',
                        backgroundColor: '#01BCD6',
                        color: 'white',
                        border: '2px solid #01BCD6',
                        borderRadius: '8px',
                        padding: '12px 32px',
                        fontSize: '16px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.3s'
                      } as React.CSSProperties}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#00A3BD'
                        e.currentTarget.style.transform = 'translateY(-2px)'
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(1, 188, 214, 0.4)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#01BCD6'
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    >
                      {editingIndex !== null ? '💾 更新责任' : '💾 保存责任'}
                    </button>
                  </div>
                )}
              </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      
      {/* 合同详情预览 Drawer */}
      <PolicyDetailCard
        mode="drawer"
        policy={buildPreviewPolicy()}
        visible={previewDrawerVisible}
        onClose={() => setPreviewDrawerVisible(false)}
      />
    </div>
  )
  
  // 构建预览用的保单数据
  function buildPreviewPolicy(): Policy {
    return {
      insuranceCompany: insuranceCompany || '未填写',
      productName: productName || '未填写',
      insuredPerson: insuredPerson || '未选择',
      policyType: policyType,
      policyIdNumber: productIdNumber,
      birthYear: birthYear ? parseInt(birthYear) : 2000,
      policyStartYear: policyStartYear ? parseInt(policyStartYear) : new Date().getFullYear(),
      coverageEndYear: coverageEndYear === 'lifetime' ? 'lifetime' : (coverageEndYear ? parseInt(coverageEndYear) : 'lifetime'),
      totalPaymentPeriod: totalPaymentPeriod,
      annualPremium: annualPremium ? parseFloat(annualPremium) : 0,
      basicSumInsured: basicSumInsured ? parseFloat(basicSumInsured) * 10000 : 0,
      policyInfo: {
        birthYear: birthYear ? parseInt(birthYear) : 2000,
        policyStartYear: policyStartYear ? parseInt(policyStartYear) : new Date().getFullYear(),
        coverageEndYear: coverageEndYear === 'lifetime' ? 'lifetime' : (coverageEndYear ? parseInt(coverageEndYear) : 'lifetime'),
        basicSumInsured: basicSumInsured ? parseFloat(basicSumInsured) * 10000 : 0,
        annualPremium: annualPremium ? parseFloat(annualPremium) : 0,
        totalPaymentPeriod: totalPaymentPeriod,
      },
      coverages: coverages.filter(c => c.isSelected !== false)
    }
  }
}

