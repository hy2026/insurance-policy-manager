import type { Policy, Coverage } from '@/types'

interface PolicyDetailContentProps {
  policy: Policy
  compact?: boolean  // 紧凑模式（用于 accordion）
}

// 获取责任类型的中文名称
const getCoverageTypeName = (type: string): string => {
  const typeMap: Record<string, string> = {
    '重疾保险金': '重疾给付',
    '中症保险金': '中症给付',
    '轻症保险金': '轻症给付',
    '身故保险金': '身故责任',
    '全残保险金': '全残责任',
    '特定疾病保险金': '特疾给付',
    '恶性肿瘤保险金': '癌症给付',
  }
  return typeMap[type] || type
}

// 获取给付次数的展示文本
const getPayoutCountText = (coverage: Coverage): string => {
  const result = coverage.result
  if (!result?.payoutCount) return '单次'
  
  const maxCount = result.payoutCount.maxCount
  if (maxCount === null || maxCount === 1) return '单次'
  if (maxCount === 999 || maxCount > 10) return '多次'
  return `${maxCount}次`
}

// 获取分组信息
const getGroupingText = (coverage: Coverage): string | null => {
  const result = coverage.result
  if (!result?.grouping) return null
  
  const { isGrouped, groupCount } = result.grouping
  if (!isGrouped) return '不分组'
  if (groupCount) return `分组${groupCount === 2 ? '二' : groupCount}次`
  return '分组'
}

// 获取间隔期文本
const getIntervalText = (coverage: Coverage): string => {
  const result = coverage.result
  if (!result?.intervalPeriod) return '无间隔期'
  
  const { hasInterval, days } = result.intervalPeriod
  if (!hasInterval || days === 0) return '无间隔期'
  if (days === 180) return '180天间隔'
  if (days === 365) return '1年间隔'
  return `${days}天间隔`
}

// 获取给付比例
const getPayoutRatio = (coverage: Coverage): string | null => {
  const result = coverage.result
  if (!result?.payoutAmount?.details?.tiers?.[0]) return null
  
  const tier = result.payoutAmount.details.tiers[0]
  if (tier.formula) {
    // 从公式中提取百分比
    const match = tier.formula.match(/(\d+)%/)
    if (match) return `${match[1]}%`
  }
  return null
}

// 计算保额金额
const getAmountInWan = (coverage: Coverage, basicSumInsured: number): number | null => {
  const result = coverage.result
  if (!result?.payoutAmount?.details?.tiers?.[0]) return null
  
  const tier = result.payoutAmount.details.tiers[0]
  
  // 如果有 keyAmounts，使用第一个
  if (tier.keyAmounts?.[0]) {
    return tier.keyAmounts[0].amount / 10000
  }
  
  // 从公式计算
  if (tier.formula) {
    const match = tier.formula.match(/(\d+)%/)
    if (match) {
      const ratio = parseInt(match[1]) / 100
      return (basicSumInsured * ratio) / 10000
    }
  }
  
  return basicSumInsured / 10000
}

// 检查是否有豁免
const checkWaiver = (coverages: Coverage[], keyword: string): boolean => {
  return coverages.some(c => {
    const waiver = c.result?.premiumWaiver
    if (!waiver?.isWaived) return false
    const text = waiver.extractedText?.join(' ') || ''
    return text.includes(keyword)
  })
}

// 检查身故责任
const checkDeathBenefit = (coverages: Coverage[]): { hasDeathBenefit: boolean; returnPremium: boolean; paySum: boolean } => {
  const deathCoverage = coverages.find(c => c.type === '身故保险金' || c.name.includes('身故'))
  
  if (!deathCoverage) {
    return { hasDeathBenefit: false, returnPremium: false, paySum: false }
  }
  
  const formula = deathCoverage.result?.payoutAmount?.details?.tiers?.[0]?.formula || ''
  const extractedText = deathCoverage.result?.payoutAmount?.extractedText?.join(' ') || ''
  const fullText = formula + extractedText
  
  return {
    hasDeathBenefit: true,
    returnPremium: fullText.includes('已交保费') || fullText.includes('所交保费'),
    paySum: fullText.includes('保额') || fullText.includes('保险金额')
  }
}

export default function PolicyDetailContent({ policy, compact = false }: PolicyDetailContentProps) {
  const currentYear = new Date().getFullYear()
  const birthYear = policy.birthYear || policy.policyInfo?.birthYear || 2000
  const policyStartYear = policy.policyStartYear || policy.policyInfo?.policyStartYear || currentYear
  const policyStartAge = policyStartYear - birthYear
  const currentAge = currentYear - birthYear
  const basicSumInsured = policy.basicSumInsured || policy.policyInfo?.basicSumInsured || 0
  const coverageEndYear = policy.coverageEndYear || policy.policyInfo?.coverageEndYear
  
  // 计算保障结束年龄
  const endAge = coverageEndYear === 'lifetime' || coverageEndYear === '终身' ? 100 : 
    (typeof coverageEndYear === 'number' ? coverageEndYear - birthYear : 100)
  
  // 计算进度条百分比
  const progressPercent = Math.min(100, Math.max(5, ((currentAge - policyStartAge) / (endAge - policyStartAge)) * 100))
  
  // 按责任大类分组
  const getCoveragesByCategory = () => {
    const categories = {
      '重疾责任': [] as Coverage[],
      '中症责任': [] as Coverage[],
      '轻症责任': [] as Coverage[],
      '其他疾病责任': [] as Coverage[],
    }
    
    policy.coverages?.forEach(c => {
      const name = (c.name || '').toLowerCase()
      const type = (c.type || '').toLowerCase()
      const fullText = name + type
      
      // 更精确的分类逻辑
      if (fullText.includes('重疾') || fullText.includes('重大疾病') || fullText.includes('严重疾病') || 
          type.includes('重疾保险金') || type.includes('重大疾病保险金')) {
        categories['重疾责任'].push(c)
      } else if (fullText.includes('中症') || type.includes('中症保险金')) {
        categories['中症责任'].push(c)
      } else if (fullText.includes('轻症') || type.includes('轻症保险金')) {
        categories['轻症责任'].push(c)
      } else if (!fullText.includes('身故') && !fullText.includes('豁免')) {
        // 排除身故和豁免责任
        categories['其他疾病责任'].push(c)
      }
    })
    
    return categories
  }
  
  const categorizedCoverages = getCoveragesByCategory()
  
  // 调试：输出分类结果
  console.log('🔍 保单责任分类结果:', {
    产品名称: policy.productName,
    重疾责任数量: categorizedCoverages['重疾责任'].length,
    中症责任数量: categorizedCoverages['中症责任'].length,
    轻症责任数量: categorizedCoverages['轻症责任'].length,
    其他疾病责任数量: categorizedCoverages['其他疾病责任'].length,
    重疾责任列表: categorizedCoverages['重疾责任'].map(c => ({ name: c.name, type: c.type })),
    中症责任列表: categorizedCoverages['中症责任'].map(c => ({ name: c.name, type: c.type })),
    轻症责任列表: categorizedCoverages['轻症责任'].map(c => ({ name: c.name, type: c.type })),
  })
  
  // 计算每个大类的保额汇总（智能累计）
  const calculateCategoryAmount = (coverages: Coverage[]): number => {
    // 按责任名称分组
    const groupedByName: { [key: string]: Coverage[] } = {}
    
    coverages.forEach(c => {
      const name = c.name || ''
      // 提取基础名称（去掉"第一次"、"第二次"等）
      const baseName = name.replace(/第[一二三四五六七八九十]+次/g, '').trim()
      
      if (!groupedByName[baseName]) {
        groupedByName[baseName] = []
      }
      groupedByName[baseName].push(c)
    })
    
    let total = 0
    
    // 对每个基础名称的责任进行处理
    Object.entries(groupedByName).forEach(([baseName, covs]) => {
      // 检查是否有"第X次"的多次赔付
      const hasMultipleTimes = covs.some(c => /第[一二三四五六七八九十]+次/.test(c.name || ''))
      
      if (hasMultipleTimes) {
        // 如果有多次赔付，只取"第一次"的金额
        const firstTime = covs.find(c => (c.name || '').includes('第一次'))
        if (firstTime) {
          const amount = getAmountInWan(firstTime, basicSumInsured)
          if (amount) total += amount
        }
      } else {
        // 如果不是多次赔付（如"额外给付"等），则累计所有金额
        covs.forEach(c => {
          const amount = getAmountInWan(c, basicSumInsured)
          if (amount) total += amount
        })
      }
    })
    
    return total
  }
  
  // 各类责任保额
  const criticalAmount = calculateCategoryAmount(categorizedCoverages['重疾责任'])
  const moderateAmount = calculateCategoryAmount(categorizedCoverages['中症责任'])
  const mildAmount = calculateCategoryAmount(categorizedCoverages['轻症责任'])
  const otherAmount = calculateCategoryAmount(categorizedCoverages['其他疾病责任'])
  
  console.log('💰 各类责任金额:', {
    产品名称: policy.productName,
    基本保额: basicSumInsured / 10000,
    重疾金额: criticalAmount,
    中症金额: moderateAmount,
    轻症金额: mildAmount,
    其他疾病金额: otherAmount,
  })
  
  // 主保额（基本保额）
  const mainAmount = basicSumInsured / 10000
  
  // 给付责任列表 - 按大类展示
  const payoutCategories = [
    { key: '重疾责任', name: '重疾给付', coverages: categorizedCoverages['重疾责任'], color: '#01BCD6' },
    { key: '中症责任', name: '中症给付', coverages: categorizedCoverages['中症责任'], color: '#f57c00' },
    { key: '轻症责任', name: '轻症给付', coverages: categorizedCoverages['轻症责任'], color: '#43a047' },
  ].filter(cat => cat.coverages.length > 0)
  
  // 检查豁免
  const hasLightWaiver = checkWaiver(policy.coverages || [], '轻症')
  const hasModerateWaiver = checkWaiver(policy.coverages || [], '中症')
  const hasCriticalWaiver = checkWaiver(policy.coverages || [], '重疾') || checkWaiver(policy.coverages || [], '重大疾病')
  
  // 检查身故责任
  const deathBenefit = checkDeathBenefit(policy.coverages || [])
  
  const padding = compact ? '20px' : '16px'
  
  return (
    <div style={{ padding: compact ? padding : '0', background: 'transparent' }}>
      {/* 保障责任与保额 */}
      <Section title="保障责任与保额">
        <div style={{ marginBottom: '8px' }}>
          <span style={{ color: '#01BCD6', fontSize: '13px' }}>▶ 基本保额：</span>
          <span style={{ color: '#01BCD6', fontSize: '28px', fontWeight: 700 }}>{mainAmount}</span>
          <span style={{ color: '#01BCD6', fontSize: '14px' }}>万</span>
        </div>
        <p style={{ fontSize: '12px', color: '#999', marginBottom: '16px', marginTop: '0' }}>
          保额即保险金额，指被保险人出险后能拿到的保险赔付金额
        </p>
        
        {/* 责任金额比例图 - 横向堆叠条形图 */}
        {(() => {
          // 构建有金额的责任列表
          const responsibilities = [
            { name: '重疾责任', amount: criticalAmount > 0 ? criticalAmount : mainAmount, color: '#01BCD6', bgColor: 'rgba(1, 188, 214, 0.15)' },
            { name: '中症责任', amount: moderateAmount, color: '#f57c00', bgColor: 'rgba(255, 167, 38, 0.15)' },
            { name: '轻症责任', amount: mildAmount, color: '#43a047', bgColor: 'rgba(102, 187, 106, 0.15)' },
            { name: '其他疾病责任', amount: otherAmount, color: '#7b1fa2', bgColor: 'rgba(156, 39, 176, 0.15)' }
          ].filter(r => r.amount > 0) // 只显示金额大于0的责任
          
          const totalAmount = responsibilities.reduce((sum, r) => sum + r.amount, 0)
          
          return (
            <div style={{
              background: 'rgba(1, 188, 214, 0.04)',
              borderRadius: '12px',
              padding: '20px',
              border: '1px solid rgba(1, 188, 214, 0.15)'
            }}>
              {/* 横向堆叠条形图 */}
              <div style={{
                display: 'flex',
                height: '80px',
                borderRadius: '10px',
                overflow: 'hidden',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                marginBottom: '20px'
              }}>
                {responsibilities.map((resp, index) => {
                  const percentage = (resp.amount / totalAmount) * 100
                  return (
                    <div
                      key={resp.name}
                      style={{
                        width: `${percentage}%`,
                        background: resp.bgColor,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        padding: '12px 8px',
                        borderRight: index < responsibilities.length - 1 ? '2px solid #fff' : 'none',
                        transition: 'all 0.3s'
                      }}
                    >
                      <div style={{ 
                        fontSize: '13px', 
                        color: resp.color, 
                        fontWeight: 600,
                        marginBottom: '4px',
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        width: '100%'
                      }}>
                        {resp.name}
                      </div>
                      <div style={{ 
                        fontSize: '18px', 
                        fontWeight: 700, 
                        color: resp.color 
                      }}>
                        {resp.amount}万
                      </div>
                    </div>
                  )
                })}
              </div>
              
              {/* 图例说明 */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'center' }}>
                {responsibilities.map(resp => (
                  <div key={resp.name} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ 
                      width: '12px', 
                      height: '12px', 
                      borderRadius: '3px', 
                      background: resp.color 
                    }} />
                    <span style={{ fontSize: '12px', color: '#666' }}>
                      {resp.name}：{resp.amount}万 ({((resp.amount / totalAmount) * 100).toFixed(1)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}
      </Section>
      
      {/* 保障期限 */}
      <Section title="保障期限">
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '16px',
          padding: '16px',
          background: 'rgba(1, 188, 214, 0.05)',
          borderRadius: '12px',
          border: '1px solid rgba(1, 188, 214, 0.15)'
        }}>
          <div style={{
            padding: '8px 20px',
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '24px',
            fontSize: '14px',
            color: '#666',
            fontWeight: 500,
            whiteSpace: 'nowrap'
          }}>
            当前
          </div>
          <div style={{ flex: 1, position: 'relative', height: '8px' }}>
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '100%',
              background: 'linear-gradient(90deg, #e0e0e0, #f0f0f0)',
              borderRadius: '4px'
            }} />
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: `${progressPercent}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #01BCD6, rgba(1, 188, 214, 0.6))',
              borderRadius: '4px',
              transition: 'width 0.5s ease'
            }} />
            <div style={{
              position: 'absolute',
              top: '-4px',
              left: `${progressPercent}%`,
              width: '16px',
              height: '16px',
              background: '#01BCD6',
              borderRadius: '50%',
              transform: 'translateX(-50%)',
              boxShadow: '0 2px 6px rgba(1, 188, 214, 0.4)',
              border: '2px solid #fff'
            }} />
          </div>
          <div style={{
            padding: '8px 20px',
            background: 'rgba(1, 188, 214, 0.15)',
            border: '1px solid #01BCD6',
            borderRadius: '24px',
            fontSize: '14px',
            color: '#01BCD6',
            fontWeight: 600,
            whiteSpace: 'nowrap'
          }}>
            {coverageEndYear === 'lifetime' || coverageEndYear === '终身' ? '终身' : `${coverageEndYear}年`}
          </div>
        </div>
        <p style={{ fontSize: '12px', color: '#999', marginTop: '12px', marginBottom: '0' }}>
          保障期限指所购保险产品为保险人提供保险保障的保险年限
        </p>
      </Section>
      
      {/* 给付方式 - 按责任大类展示 */}
      {payoutCategories.map((category) => {
        // 取该类别第一个责任的属性作为代表
        const mainCoverage = category.coverages[0]
        const ratio = getPayoutRatio(mainCoverage)
        
        return (
          <Section 
            key={category.key} 
            title={category.name}
          >
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              {/* 分组信息 */}
              {getGroupingText(mainCoverage) && (
                <Tag active>{getGroupingText(mainCoverage)}</Tag>
              )}
              
              {/* 给付次数 */}
              <Tag active>{getPayoutCountText(mainCoverage)}</Tag>
              
              {/* 间隔期 */}
              <Tag>{getIntervalText(mainCoverage)}</Tag>
              
              {/* 给付比例 */}
              {ratio && (
                <>
                  <span style={{ color: category.color, fontSize: '14px', marginLeft: '8px' }}>▶</span>
                  <span style={{ color: category.color, fontSize: '14px', fontWeight: 600 }}>
                    给付比例：{ratio}
                  </span>
                </>
              )}
            </div>
            <p style={{ fontSize: '12px', color: '#999', marginTop: '12px', marginBottom: '0', lineHeight: '1.6' }}>
              {category.key === '重疾责任' && '重疾多次赔付增加了保障的范围。如果是单次赔付的重疾险，理赔过一次重疾之后，保障责任就结束了。多次赔付的重疾险，可以很好地解决"理赔了一次重疾以后，无法再拥有保障"的问题。'}
              {category.key === '中症责任' && '中症是介于重疾和轻症之间的疾病状态，赔付比例通常为基本保额的50%-60%。中症多次赔付可以更好地覆盖疾病风险。'}
              {category.key === '轻症责任' && '轻症是重疾的早期阶段或较轻程度，赔付比例通常为基本保额的20%-45%。轻症多次赔付可以让您在疾病早期就获得保障。'}
            </p>
          </Section>
        )
      })}
      
      {/* 身故责任 */}
      <Section title="身故责任">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Tag active={!deathBenefit.hasDeathBenefit}>不包含</Tag>
          <Tag active={deathBenefit.returnPremium}>返保费</Tag>
          <Tag active={deathBenefit.paySum}>赔保额</Tag>
        </div>
        <p style={{ fontSize: '12px', color: '#999', marginTop: '12px', marginBottom: '0', lineHeight: '1.6' }}>
          身故责任指被保险人遭受意外伤害或因疾病导致身故，保险公司需按合同约定的保额给付。若已经给付过任意一次重大疾病保险金，则本合同的现金价值6自首次重大疾病保险金支付之日起降低为零，身故保险金的保险责任均终止。
        </p>
      </Section>
      
      {/* 豁免保费 */}
      <Section title="豁免保费">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Tag active={hasLightWaiver}>轻症豁免</Tag>
          <Tag active={hasModerateWaiver}>中症豁免</Tag>
          <Tag active={hasCriticalWaiver}>重大疾病豁免</Tag>
        </div>
        <div style={{ fontSize: '12px', color: '#999', marginTop: '12px', lineHeight: '1.8' }}>
          <div>轻症豁免指一旦轻症获得赔付后，后期未交的保费不需要再缴费；</div>
          <div>中症豁免指一旦中症获得赔付后，后期未交的保费不需要再缴费；</div>
          <div>重大疾病豁免指一旦重疾获得赔付后，后期未交的保费不需要再缴费；</div>
        </div>
      </Section>
    </div>
  )
}

// 区块组件
function Section({ 
  title, 
  children, 
  rightElement 
}: { 
  title: string
  children: React.ReactNode
  rightElement?: React.ReactNode 
}) {
  return (
    <div style={{ 
      marginBottom: '16px',
      background: '#fff',
      borderRadius: '12px',
      padding: '20px 24px',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
      border: '1px solid rgba(1, 188, 214, 0.1)'
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        marginBottom: '12px',
        paddingBottom: '8px',
        borderBottom: '2px solid #01BCD6'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '4px', height: '18px', background: '#01BCD6', borderRadius: '2px' }} />
          <span style={{ fontSize: '16px', fontWeight: 600, color: '#333' }}>{title}</span>
        </div>
        {rightElement}
      </div>
      {children}
    </div>
  )
}

// 标签组件
function Tag({ 
  children, 
  active = false 
}: { 
  children: React.ReactNode
  active?: boolean 
}) {
  return (
    <span style={{
      padding: '6px 16px',
      fontSize: '13px',
      fontWeight: 500,
      color: active ? '#01BCD6' : '#999',
      background: active ? 'rgba(1, 188, 214, 0.1)' : '#f5f5f5',
      border: `1px solid ${active ? 'rgba(1, 188, 214, 0.3)' : '#e5e7eb'}`,
      borderRadius: '20px',
      transition: 'all 0.2s'
    }}>
      {children}
    </span>
  )
}

