import { useState } from 'react'
import type { Policy, Coverage } from '@/types'

interface PolicyDetailContentProps {
  policy: Policy
  compact?: boolean  // 紧凑模式（用于 accordion）
}

// 获取给付次数的展示文本
const getPayoutCountText = (coverage: Coverage): string => {
  const result = (coverage as any).parseResult || coverage.result
  if (!result?.payoutCount) return '单次'
  
  const maxCount = result.payoutCount.maxCount
  if (maxCount === null || maxCount === 1) return '单次'
  if (maxCount === 999 || maxCount > 10) return '多次'
  return `${maxCount}次`
}

// 判断是否可以重复
const canRepeat = (coverage: Coverage): boolean => {
  const result = (coverage as any).parseResult || coverage.result
  if (!result?.payoutCount) return false
  
  const maxCount = result.payoutCount.maxCount
  return maxCount !== null && maxCount > 1
}

// 获取分组信息
const getGroupingText = (coverage: Coverage): string | null => {
  const result = (coverage as any).parseResult || coverage.result
  if (!result?.grouping) return null
  
  const { isGrouped, groupCount } = result.grouping
  if (!isGrouped) return '不分组'
  if (groupCount) return `分组${groupCount === 2 ? '二' : groupCount}次`
  return '分组'
}

// 获取间隔期文本
const getIntervalText = (coverage: Coverage): string => {
  const result = (coverage as any).parseResult || coverage.result
  if (!result?.intervalPeriod) return '无间隔期'
  
  const { hasInterval, days } = result.intervalPeriod
  if (!hasInterval || days === 0) return '无间隔期'
  if (days === 180) return '180天间隔'
  if (days === 365) return '1年间隔'
  return `${days}天间隔`
}

// 获取给付比例
const getPayoutRatio = (coverage: Coverage): string | null => {
  const result = (coverage as any).parseResult || coverage.result
  if (!result?.payoutAmount?.details?.tiers?.[0]) return null
  
  const tier = result.payoutAmount.details.tiers[0]
  
  // 方法1：从公式中提取百分比（支持小数，如60.0%）
  if (tier.formula) {
    const match = tier.formula.match(/([\d.]+)%/)
    if (match) {
      const ratio = parseFloat(match[1])
      // 如果是整数就返回整数格式，否则保留小数
      return ratio % 1 === 0 ? `${Math.round(ratio)}%` : `${ratio}%`
    }
  }
  
  // 方法2：从keyAmounts中的ratio提取
  if (tier.keyAmounts?.[0]?.ratio) {
    const ratio = tier.keyAmounts[0].ratio
    return `${Math.round(ratio * 100)}%`
  }
  
  // 方法3：从ratio字段直接提取
  if (tier.ratio !== undefined && tier.ratio !== null) {
    return `${Math.round(tier.ratio * 100)}%`
  }
  
  return null
}

// 金额详情类型
interface AmountDetails {
  currentAmount: number  // 当前年龄阶段的金额（用于比例计算）
  minAmount: number      // 最小金额（用于显示区间）
  maxAmount: number      // 最大金额（用于显示区间）
}

// 从单个tier提取金额
const extractTierAmount = (tier: any, basicSumInsured: number): number | null => {
  // 如果有 keyAmounts，使用第一个
  if (tier?.keyAmounts?.[0]) {
    const rawAmount = tier.keyAmounts[0].amount
    // 智能判断单位
    return rawAmount >= 10000 ? rawAmount / 10000 : rawAmount
  }
  
  // 如果 tier 直接有 amount 字段
  if (tier?.amount) {
    return tier.amount >= 10000 ? tier.amount / 10000 : tier.amount
  }
  
  // 从公式计算
  if (tier?.formula) {
    const match = tier.formula.match(/([\d.]+)%/)
    if (match) {
      const ratio = parseFloat(match[1]) / 100
      return (basicSumInsured * ratio) / 10000
    }
  }
  
  return null
}

// 计算保额金额（简单版，返回单一金额）
// 重要：只使用等待期后（waitingPeriodStatus === 'after'）的金额
const getAmountInWan = (coverage: Coverage, basicSumInsured: number): number | null => {
  // 兼容两种字段名：parseResult（从库加载的）和 result（标准格式）
  const result = (coverage as any).parseResult || coverage.result
  const allTiers = result?.payoutAmount?.details?.tiers || []
  
  if (allTiers.length === 0) {
    return null
  }
  
  // 过滤：只保留等待期后的阶段
  const afterTiers = allTiers.filter((tier: any) => {
    const status = tier.waitingPeriodStatus
    return !status || status === 'after'
  })
  
  // 使用第一个等待期后的阶段
  const tier = afterTiers[0] || allTiers[0]  // 如果都是等待期内，回退到第一个
  const amount = extractTierAmount(tier, basicSumInsured)
  
  if (amount !== null && amount > 0) return amount
  
  // 如果有基本保额，使用它
  if (basicSumInsured > 0) {
    return basicSumInsured / 10000
  }
  
  return null
}

// 计算保额金额详情（返回当前阶段金额和金额区间）
// 重要：只使用等待期后（waitingPeriodStatus === 'after'）的金额
const getAmountDetailsForCoverage = (coverage: Coverage, basicSumInsured: number, currentAge: number): AmountDetails | null => {
  const result = (coverage as any).parseResult || coverage.result
  const allTiers = result?.payoutAmount?.details?.tiers || []
  
  // 过滤：只保留等待期后的阶段（waitingPeriodStatus === 'after' 或没有该字段的）
  const tiers = allTiers.filter((tier: any) => {
    const status = tier.waitingPeriodStatus
    // 如果没有该字段，默认认为是等待期后；如果有该字段，必须是 'after'
    return !status || status === 'after'
  })
  
  if (tiers.length === 0) {
    // 没有等待期后的tiers，尝试使用简单金额
    const simpleAmount = getAmountInWan(coverage, basicSumInsured)
    if (simpleAmount) {
      return { currentAmount: simpleAmount, minAmount: simpleAmount, maxAmount: simpleAmount }
    }
    return null
  }
  
  // 提取所有等待期后阶段的金额
  const tierAmounts: { startAge: number; endAge: number; amount: number }[] = []
  
  tiers.forEach((tier: any) => {
    const amount = extractTierAmount(tier, basicSumInsured)
    if (amount !== null && amount > 0) {  // 排除金额为0的阶段
      tierAmounts.push({
        startAge: tier.startAge || 0,
        endAge: tier.endAge || 100,
        amount
      })
    }
  })
  
  if (tierAmounts.length === 0) {
    return null
  }
  
  // 找到当前年龄所在阶段的金额
  let currentAmount = tierAmounts[0].amount  // 默认使用第一个
  for (const ta of tierAmounts) {
    if (currentAge >= ta.startAge && currentAge <= ta.endAge) {
      currentAmount = ta.amount
      break
    }
  }
  
  // 计算最小和最大金额
  const amounts = tierAmounts.map(ta => ta.amount)
  const minAmount = Math.min(...amounts)
  const maxAmount = Math.max(...amounts)
  
  return { currentAmount, minAmount, maxAmount }
}

// 检查是否有豁免
// 识别豁免保费责任
const getWaiverCoverages = (coverages: Coverage[]): string[] => {
  const waivers: string[] = []
  coverages.forEach(c => {
    if (c.name && c.name.includes('豁免')) {
      waivers.push(c.name)
    }
  })
  return waivers
}

// 识别年金责任（从责任大类识别）
const getAnnuityCoverages = (coverages: Coverage[]): Array<{ name: string; amount: string }> => {
  const annuities: Array<{ name: string; amount: string }> = []
  coverages.forEach(c => {
    const coverageType = (c as any)['责任大类']
    
    // 只从责任大类识别
    if (coverageType === '年金责任') {
      const result = (c as any).parseResult || c.result
      let amountText = '详见条款'
      
      // 尝试从parseResult中获取金额
      if (result?.payoutAmount?.details?.tiers?.[0]) {
        const tier = result.payoutAmount.details.tiers[0]
        if (tier.keyAmounts?.[0]?.amount) {
          const rawAmount = tier.keyAmounts[0].amount
          const amount = rawAmount < 10000 ? rawAmount : rawAmount / 10000
          amountText = `领取${amount}万`
        }
      }
      
      annuities.push({
        name: c.name,
        amount: amountText
      })
    }
  })
  return annuities
}

// 识别意外责任（从责任大类识别）
const getAccidentCoverages = (coverages: Coverage[]): Array<{ name: string; amount: string }> => {
  const accidents: Array<{ name: string; amount: string }> = []
  coverages.forEach(c => {
    const coverageType = (c as any)['责任大类']
    
    // 只从责任大类识别
    if (coverageType === '意外责任') {
      const result = (c as any).parseResult || c.result
      let amountText = '详见条款'
      
      // 尝试从parseResult中获取金额
      if (result?.payoutAmount?.details?.tiers?.[0]) {
        const tier = result.payoutAmount.details.tiers[0]
        if (tier.keyAmounts?.[0]?.amount) {
          const rawAmount = tier.keyAmounts[0].amount
          const amount = rawAmount < 10000 ? rawAmount : rawAmount / 10000
          amountText = `赔付${amount}万`
        }
      }
      
      accidents.push({
        name: c.name,
        amount: amountText
      })
    }
  })
  return accidents
}

// 获取所有身故责任（从责任大类识别）
const getDeathBenefits = (coverages: Coverage[], basicSumInsured: number): Array<{ 
  name: string;
  amount: string;
}> => {
  // 从责任大类识别所有身故责任
  const deathCoverages = coverages.filter(c => (c as any)['责任大类'] === '身故责任')
  
  if (deathCoverages.length === 0) {
    return []
  }
  
  return deathCoverages.map(deathCoverage => {
    const result = (deathCoverage as any).parseResult || deathCoverage.result
    const formula = result?.payoutAmount?.details?.tiers?.[0]?.formula || ''
    const extractedText = result?.payoutAmount?.extractedText?.join(' ') || ''
    const fullText = formula + extractedText
    
    // 获取具体赔付金额
    let amountText = '详见条款'
    const tier = result?.payoutAmount?.details?.tiers?.[0]
    
    if (tier?.keyAmounts?.[0]?.amount) {
      const raw = tier.keyAmounts[0].amount
      const amount = raw >= 10000 ? raw / 10000 : raw
      amountText = `赔付${amount}万`
    } else if (fullText.includes('已交保费') || fullText.includes('所交保费')) {
      amountText = '赔付已交保费'
    } else if (fullText.includes('保额') || fullText.includes('保险金额')) {
      // 如果是按保额赔付，使用基本保额
      const amount = basicSumInsured / 10000
      amountText = `赔付${amount}万`
    }
    
    return {
      name: deathCoverage.name,
      amount: amountText
    }
  })
}

// 从责任名称中提取"第X次"的数字
const extractPayoutNumber = (name: string): number => {
  // 匹配"第一次"、"第二次"..."第十次"等中文数字
  const chineseMatch = name.match(/第([一二三四五六七八九十]+)次/)
  if (chineseMatch) {
    const chineseNum = chineseMatch[1]
    const numMap: { [key: string]: number } = {
      '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
      '六': 6, '七': 7, '八': 8, '九': 9, '十': 10
    }
    // 处理"十一"、"十二"等
    if (chineseNum === '十') return 10
    if (chineseNum.startsWith('十')) return 10 + (numMap[chineseNum[1]] || 0)
    return numMap[chineseNum] || 1
  }
  
  // 匹配"第1次"、"第2次"等阿拉伯数字
  const arabicMatch = name.match(/第(\d+)次/)
  if (arabicMatch) {
    return parseInt(arabicMatch[1])
  }
  
  // 匹配"首次"
  if (name.includes('首次')) return 1
  
  // 默认返回1（表示这是一次性的责任）
  return 1
}

// 汇总责任类别信息
const summarizeCategoryInfo = (coverages: Coverage[], basicSumInsured: number): {
  totalCount: number
  hasGrouping: boolean
  groupingText: string
  canRepeatText: string
  intervalText: string
  payoutAmountRange: string
} => {
  // 计算赔付次数：取"第X次"的最大值，而不是责任数量累加
  let maxPayoutNumber = 0
  coverages.forEach(c => {
    const num = extractPayoutNumber(c.name || '')
    if (num > maxPayoutNumber) maxPayoutNumber = num
  })
  // 如果没有"第X次"的责任，次数就是责任数量
  const totalCount = maxPayoutNumber > 0 ? maxPayoutNumber : coverages.length
  
  // 检查是否分组
  const groupingSet = new Set<string>()
  coverages.forEach(c => {
    const grouping = getGroupingText(c)
    if (grouping) groupingSet.add(grouping)
  })
  const hasGrouping = groupingSet.has('分组') || groupingSet.has('分组二次') || groupingSet.has('分组三次')
  const groupingText = hasGrouping ? Array.from(groupingSet).join('/') : '不分组'
  
  // 检查是否可以重复
  const hasRepeat = coverages.some(c => canRepeat(c))
  const canRepeatText = hasRepeat ? '可重复' : '不可重复'
  
  // 检查间隔期
  const intervalSet = new Set<string>()
  coverages.forEach(c => {
    const interval = getIntervalText(c)
    if (interval && interval !== '无间隔期') intervalSet.add(interval)
  })
  const intervalText = intervalSet.size > 0 ? Array.from(intervalSet).join('/') : '无间隔期'
  
  // 检查赔付金额范围
  const amounts = coverages
    .map(c => {
      const amount = getAmountInWan(c, basicSumInsured)
      return amount
    })
    .filter(a => a !== null && a > 0) as number[]
  
  const payoutAmountRange = amounts.length > 0
    ? amounts.length === 1 || Math.min(...amounts) === Math.max(...amounts)
      ? `${amounts[0]}万`
      : `${Math.min(...amounts)}万-${Math.max(...amounts)}万`
    : '待定'
  
  return {
    totalCount,
    hasGrouping,
    groupingText,
    canRepeatText,
    intervalText,
    payoutAmountRange
  }
}

export default function PolicyDetailContent({ policy, compact = false }: PolicyDetailContentProps) {
  // 展开状态管理
  const [expandedCategories, setExpandedCategories] = useState<{ [key: string]: boolean }>({})
  
  const currentYear = new Date().getFullYear()
  const birthYear = policy.birthYear || policy.policyInfo?.birthYear || 2000
  const policyStartYear = policy.policyStartYear || policy.policyInfo?.policyStartYear || currentYear
  const policyStartAge = policyStartYear - birthYear
  const currentAge = currentYear - birthYear
  const basicSumInsured = policy.basicSumInsured || policy.policyInfo?.basicSumInsured || 0
  const coverageEndYear = policy.coverageEndYear || policy.policyInfo?.coverageEndYear
  
  // 切换展开状态
  const toggleCategory = (key: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }
  
  // 计算保障结束年龄
  const isLifetime = coverageEndYear === 'lifetime' || coverageEndYear === '终身'
  const endAge = isLifetime ? 100 : 
    (typeof coverageEndYear === 'number' ? coverageEndYear - birthYear : 100)
  
  // 计算圆球位置百分比（基于保障期限，而非当前进度）
  // 假设人生最大年龄100岁，从开始年龄到100岁为全程
  const maxAge = 100
  const coveragePercent = isLifetime ? 100 : 
    Math.min(100, Math.max(5, ((endAge - policyStartAge) / (maxAge - policyStartAge)) * 100))
  
  // 按责任大类分组
  const getCoveragesByCategory = () => {
    const categories = {
      '重疾责任': [] as Coverage[],
      '中症责任': [] as Coverage[],
      '轻症责任': [] as Coverage[],
      '前症责任': [] as Coverage[],
      '其他疾病责任': [] as Coverage[], // 也叫"特定疾病责任"
    }
    
    
    policy.coverages?.forEach(c => {
      const coverageType = (c as any)['责任大类'] // 责任大类
      const coverageCategory = (c as any)['责任小类'] // 责任小类
      
      // 只处理"疾病责任"大类
      if (coverageType === '疾病责任' && coverageCategory) {
        // 根据责任小类分类
        if (coverageCategory === '重疾责任') {
          categories['重疾责任'].push(c)
        } else if (coverageCategory === '中症责任') {
          categories['中症责任'].push(c)
        } else if (coverageCategory === '轻症责任') {
          categories['轻症责任'].push(c)
        } else if (coverageCategory === '前症责任') {
          categories['前症责任'].push(c)
        } else if (coverageCategory === '特定疾病责任') {
          categories['其他疾病责任'].push(c)
        } else {
          // 未知的责任小类
          console.warn('⚠️ 未知的责任小类:', coverageCategory, '责任名称:', c.name)
        }
      }
    })
    
    return categories
  }
  
  const categorizedCoverages = getCoveragesByCategory()
  
  
  // 类别金额详情类型
  interface CategoryAmountDetails {
    currentAmount: number  // 当前年龄阶段的金额（用于比例计算）
    minAmount: number      // 最小金额（用于显示区间）
    maxAmount: number      // 最大金额（用于显示区间）
  }
  
  // 判断是否为"第一次"或"首次"的责任
  const isFirstTimeCoverage = (name: string): boolean => {
    return name.includes('首次') || name.includes('第一次')
  }
  
  // 判断是否有多次赔付标记（首次、第X次）
  const hasPayoutOrderMark = (name: string): boolean => {
    return /首次|第[一二三四五六七八九十\d]+次/.test(name)
  }
  
  // 提取基础名称（去掉"首次"、"第X次"、"基本"、"额外"等）
  const extractCoreName = (name: string): string => {
    return name
      .replace(/首次/g, '')
      .replace(/第[一二三四五六七八九十\d]+次/g, '')
      .replace(/基本/g, '')
      .replace(/额外/g, '')
      .replace(/关爱/g, '')
      .trim()
  }
  
  // 计算每个大类的保额汇总（智能累计，支持阶段金额）
  // 规则：多次赔付只统计首次/第一次的金额
  const calculateCategoryAmountDetails = (coverages: Coverage[]): CategoryAmountDetails => {
    let totalCurrent = 0
    let totalMin = 0
    let totalMax = 0
    
    // 按核心名称分组（去掉首次、第X次、基本、额外等）
    const groupedByCoreName: { [key: string]: Coverage[] } = {}
    
    coverages.forEach(c => {
      const name = c.name || ''
      const coreName = extractCoreName(name)
      
      if (!groupedByCoreName[coreName]) {
        groupedByCoreName[coreName] = []
      }
      groupedByCoreName[coreName].push(c)
    })
    
    // 对每个核心名称的责任组进行处理
    Object.entries(groupedByCoreName).forEach(([coreName, covs]) => {
      // 检查这组责任中是否有多次赔付标记
      const hasOrderMark = covs.some(c => hasPayoutOrderMark(c.name || ''))
      
      if (hasOrderMark) {
        // 有多次赔付标记，只统计"首次"或"第一次"的金额
        const firstTimeCoverages = covs.filter(c => isFirstTimeCoverage(c.name || ''))
        
        if (firstTimeCoverages.length > 0) {
          // 累加所有首次/第一次的金额（如：首次基本 + 首次额外）
          firstTimeCoverages.forEach(c => {
            const details = getAmountDetailsForCoverage(c, basicSumInsured, currentAge)
            if (details) {
              totalCurrent += details.currentAmount
              totalMin += details.minAmount
              totalMax += details.maxAmount
            }
          })
        } else {
          // 如果没有"首次/第一次"（如特定疾病从第二次开始），取金额最大的那个
          let bestDetails: AmountDetails | null = null
          let maxCurrentAmount = 0
          covs.forEach(c => {
            const details = getAmountDetailsForCoverage(c, basicSumInsured, currentAge)
            if (details && details.currentAmount > maxCurrentAmount) {
              maxCurrentAmount = details.currentAmount
              bestDetails = details
            }
          })
          if (bestDetails) {
            totalCurrent += bestDetails.currentAmount
            totalMin += bestDetails.minAmount
            totalMax += bestDetails.maxAmount
          }
        }
      } else {
        // 没有多次赔付标记，累计所有金额
        covs.forEach(c => {
          const details = getAmountDetailsForCoverage(c, basicSumInsured, currentAge)
          if (details) {
            totalCurrent += details.currentAmount
            totalMin += details.minAmount
            totalMax += details.maxAmount
          }
        })
      }
    })
    
    return { currentAmount: totalCurrent, minAmount: totalMin, maxAmount: totalMax }
  }
  
  // 各类责任保额详情（包含当前金额和金额区间）
  const criticalDetails = calculateCategoryAmountDetails(categorizedCoverages['重疾责任'])
  const moderateDetails = calculateCategoryAmountDetails(categorizedCoverages['中症责任'])
  const mildDetails = calculateCategoryAmountDetails(categorizedCoverages['轻症责任'])
  const preSymptomsDetails = calculateCategoryAmountDetails(categorizedCoverages['前症责任'])
  const otherDetails = calculateCategoryAmountDetails(categorizedCoverages['其他疾病责任'])
  
  // 兼容旧代码：提取当前金额
  const criticalAmount = criticalDetails.currentAmount
  const moderateAmount = moderateDetails.currentAmount
  const mildAmount = mildDetails.currentAmount
  const preSymptomsAmount = preSymptomsDetails.currentAmount
  const otherAmount = otherDetails.currentAmount
  
  
  // 格式化金额区间显示
  const formatAmountRange = (details: CategoryAmountDetails): string => {
    if (details.minAmount === details.maxAmount) {
      return `${details.currentAmount}万`
    }
    return `${details.minAmount}万～${details.maxAmount}万`
  }
  
  // 主保额（基本保额）
  const mainAmount = basicSumInsured / 10000
  
  // 给付责任列表 - 按大类展示（始终显示五个模块）
  const payoutCategories = [
    { key: '重疾责任', name: '重疾给付', coverages: categorizedCoverages['重疾责任'], color: '#01BCD6' },
    { key: '中症责任', name: '中症给付', coverages: categorizedCoverages['中症责任'], color: '#f57c00' },
    { key: '轻症责任', name: '轻症给付', coverages: categorizedCoverages['轻症责任'], color: '#43a047' },
    { key: '前症责任', name: '前症给付', coverages: categorizedCoverages['前症责任'], color: '#A5D6A7' },
    { key: '其他疾病责任', name: '特定疾病给付', coverages: categorizedCoverages['其他疾病责任'], color: '#7BADB5' },
  ] // 不再过滤，始终显示五个模块
  
  // 识别其他权益
  const waiverCoverages = getWaiverCoverages(policy.coverages || [])
  const annuityCoverages = getAnnuityCoverages(policy.coverages || [])
  const accidentCoverages = getAccidentCoverages(policy.coverages || [])
  
  
  // 获取所有身故责任
  const deathBenefits = getDeathBenefits(policy.coverages || [], basicSumInsured)
  
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
          基本保额就是你买保险时定的核心赔偿基数，后续轻症、中症、重症的赔偿都以这个数为基础计算
        </p>
        
        {/* 责任金额矩形图 - 类似Excel饼图的Treemap效果 */}
        {(() => {
          // 构建有金额的责任列表（使用当前阶段金额计算比例，显示金额区间）
          // 构建责任列表，重疾责任固定排在第一个
          const allResponsibilities = [
            { name: '重疾责任', amount: criticalAmount > 0 ? criticalAmount : mainAmount, displayAmount: formatAmountRange(criticalDetails.currentAmount > 0 ? criticalDetails : { currentAmount: mainAmount, minAmount: mainAmount, maxAmount: mainAmount }), color: '#FF7A5C', bgColor: 'rgba(255, 122, 92, 0.18)', priority: 1 },
            { name: '中症责任', amount: moderateAmount, displayAmount: formatAmountRange(moderateDetails), color: '#01BCD6', bgColor: 'rgba(1, 188, 214, 0.28)', priority: 2 },
            { name: '轻症责任', amount: mildAmount, displayAmount: formatAmountRange(mildDetails), color: '#B3EBEF', bgColor: 'rgba(179, 235, 239, 0.20)', priority: 3 },
            { name: '前症责任', amount: preSymptomsAmount, displayAmount: formatAmountRange(preSymptomsDetails), color: '#A5D6A7', bgColor: 'rgba(165, 214, 167, 0.20)', priority: 4 },
            { name: '特定疾病责任', amount: otherAmount, displayAmount: formatAmountRange(otherDetails), color: '#888', bgColor: '#f0f8fc', priority: 5 } // 浅灰色，不加透明
          ]
          
          // 过滤掉金额为0的责任
          const validResponsibilities = allResponsibilities.filter(r => r.amount > 0)
          
          // 将重疾责任固定在第一位，其他责任按金额大小排序
          const criticalResp = validResponsibilities.find(r => r.name === '重疾责任')
          const otherResps = validResponsibilities
            .filter(r => r.name !== '重疾责任')
            .sort((a, b) => b.amount - a.amount) // 其他责任按金额从大到小排序
          
          const responsibilities = criticalResp 
            ? [criticalResp, ...otherResps]
            : otherResps
          
          const totalAmount = responsibilities.reduce((sum, r) => sum + r.amount, 0)
          
          // 简单布局：超过2类责任时显示两层
          const rows: Array<typeof responsibilities> = []
          
          if (responsibilities.length <= 2) {
            // 1-2类责任，一行显示
            rows.push(responsibilities)
          } else {
            // 超过2类责任，分两行显示
            const halfCount = Math.ceil(responsibilities.length / 2)
            rows.push(responsibilities.slice(0, halfCount))
            rows.push(responsibilities.slice(halfCount))
          }
          
          const totalHeight = 160 // 总高度（再次缩小）
          
          return (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              height: `${totalHeight}px`,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12), 0 2px 4px rgba(0, 0, 0, 0.08)',
              backdropFilter: 'blur(8px)',
              marginBottom: '16px',
            }}>
              {rows.map((row, rowIndex) => {
                const rowTotalAmount = row.reduce((sum, r) => sum + r.amount, 0)
                const rowHeightPercentage = (rowTotalAmount / totalAmount) * 100
                const isFirstRow = rowIndex === 0
                const isLastRow = rowIndex === rows.length - 1
                
                return (
                  <div 
                    key={rowIndex}
                    style={{
                      display: 'flex',
                      flex: rowTotalAmount, // 行高根据该行的总金额占比
                    }}
                  >
                    {row.map((resp, colIndex) => {
                      const percentage = ((resp.amount / totalAmount) * 100).toFixed(1)
                      const isFirstCol = colIndex === 0
                      const isLastCol = colIndex === row.length - 1
                      
                      return (
                        <div
                          key={resp.name}
                          style={{
                            background: resp.bgColor,
                            flex: resp.amount, // 宽度根据金额占比
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '10px 8px',
                            transition: 'all 0.2s',
                            cursor: 'default',
                            border: `1px solid ${resp.color}`,
                            // 添加毛玻璃、阴影效果
                            backdropFilter: 'blur(10px)',
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.filter = 'brightness(1.05)'
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.filter = 'brightness(1)'
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.08)'
                          }}
                        >
                          <div style={{ 
                            fontSize: rowHeightPercentage > 40 ? '12px' : '11px',
                            color: resp.color === '#B3EBEF' ? '#0097A7' : resp.color,
                            fontWeight: 600,
                            marginBottom: rowHeightPercentage > 30 ? '4px' : '2px',
                            textAlign: 'center',
                            lineHeight: 1.2,
                          }}>
                            {resp.name}
                          </div>
                          <div style={{ 
                            fontSize: rowHeightPercentage > 40 ? '22px' : rowHeightPercentage > 25 ? '18px' : '16px',
                            fontWeight: 700, 
                            color: resp.color === '#B3EBEF' ? '#0097A7' : resp.color,
                            marginBottom: '1px',
                            lineHeight: 1,
                          }}>
                            {(resp as any).displayAmount || `${resp.amount}万`}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
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
          padding: '40px 16px 16px 16px', // 增加顶部padding，为年龄标签留空间
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
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'baseline',
            gap: '6px'
          }}>
            <span>当前</span>
            <span style={{ fontSize: '14px', color: '#01BCD6', fontWeight: 600 }}>{currentAge}岁</span>
          </div>
          <div style={{ flex: 1, position: 'relative', height: '8px' }}>
            {/* 背景轨道 */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '100%',
              background: 'linear-gradient(90deg, #e0e0e0, #f0f0f0)',
              borderRadius: '4px'
            }} />
            {/* 进度条 */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: `${coveragePercent}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #01BCD6, rgba(1, 188, 214, 0.6))',
              borderRadius: '4px',
              transition: 'width 0.5s ease'
            }} />
            {/* 圆球 */}
            <div style={{
              position: 'absolute',
              top: '-4px',
              left: `${coveragePercent}%`,
              width: '16px',
              height: '16px',
              background: '#01BCD6',
              borderRadius: '50%',
              transform: 'translateX(-50%)',
              boxShadow: '0 2px 6px rgba(1, 188, 214, 0.4)',
              border: '2px solid #fff'
            }} />
            {/* 圆球旁边的年龄标签 */}
            <div style={{
              position: 'absolute',
              top: '-30px',
              left: `${coveragePercent}%`,
              transform: 'translateX(-50%)',
              padding: '4px 12px',
              background: '#01BCD6',
              color: '#fff',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 6px rgba(1, 188, 214, 0.3)'
            }}>
              {isLifetime ? '终身' : `${endAge}岁`}
            </div>
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
            终身
          </div>
        </div>
        <p style={{ fontSize: '12px', color: '#999', marginTop: '12px', marginBottom: '0' }}>
          保障期限指所购保险产品为被保险人提供保障的保险年限
        </p>
      </Section>
      
      {/* 责任详情 */}
      {payoutCategories.map(category => {
          const hasCoverages = category.coverages.length > 0
          const summary = hasCoverages ? summarizeCategoryInfo(category.coverages, basicSumInsured) : null
          const isExpanded = expandedCategories[category.key]
          
          return (
            <Section 
              key={category.key} 
              title={`${category.name}（${category.coverages.length}项）`}
              rightElement={
                hasCoverages && category.coverages.length > 1 ? (
                  <button
                    onClick={() => toggleCategory(category.key)}
                    style={{
                      padding: '5px 14px',
                      background: 'transparent',
                      border: '1px solid #01BCD6',
                      borderRadius: '18px',
                      color: '#01BCD6',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#01BCD6'
                      e.currentTarget.style.color = '#fff'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = '#01BCD6'
                    }}
                  >
                    {isExpanded ? '收起' : '展开详细'}
                    <span style={{ fontSize: '10px' }}>
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </button>
                ) : null
              }
            >
              {/* 特定疾病给付 - 按疾病名称汇总显示 */}
              {category.key === '其他疾病责任' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                  {hasCoverages ? (
                    <>
                      <div style={{ 
                        display: 'flex', 
                        flexWrap: 'wrap', 
                        gap: '8px'
                      }}>
                        {(() => {
                          // 按疾病名称汇总
                          const grouped: { [key: string]: { baseName: string; count: number; maxAmount: number } } = {}
                          
                          category.coverages.forEach((coverage) => {
                            // 提取基础疾病名称（去掉"第X次"、"第二次"等后缀）
                            let baseName = coverage.name
                              .replace(/第[一二三四五六七八九十\d]+次/g, '')
                              .replace(/[（(].*?[）)]/g, '') // 去掉括号内容
                              .trim()
                            
                            // 如果去掉后缀后名称太短，保留原名
                            if (baseName.length < 3) {
                              baseName = coverage.name
                            }
                            
                            // 获取赔付金额
                            const result = (coverage as any).parseResult || coverage.result
                            let amount = 0
                            if (result?.payoutAmount?.details?.tiers?.[0]?.keyAmounts?.[0]?.amount) {
                              const raw = result.payoutAmount.details.tiers[0].keyAmounts[0].amount
                              amount = raw >= 10000 ? raw / 10000 : raw
                            }
                            
                            if (!grouped[baseName]) {
                              grouped[baseName] = { baseName, count: 0, maxAmount: 0 }
                            }
                            grouped[baseName].count += 1
                            grouped[baseName].maxAmount = Math.max(grouped[baseName].maxAmount, amount)
                          })
                          
                          return Object.values(grouped).map((item, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 12px',
                                background: '#fff',
                                border: '1px solid #7BADB5',
                                borderRadius: '16px',
                                fontSize: '13px'
                              }}
                            >
                              <span style={{ color: '#333', fontWeight: 500 }}>{item.baseName}</span>
                              {item.maxAmount > 0 && (
                                <span style={{ color: '#7BADB5', fontWeight: 600 }}>赔付{item.maxAmount}万</span>
                              )}
                              <span style={{ color: '#999' }}>{item.count}次</span>
                            </div>
                          ))
                        })()}
                      </div>
                    </>
                  ) : (
                    <Tag active={true}>不包含</Tag>
                  )}
                </div>
              ) : (
                /* 其他责任类型 - 显示汇总信息，所有标签亮色 */
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                  {hasCoverages ? (
                    <>
                      <Tag active={true}>{summary!.totalCount}次</Tag>
                      <Tag active={true}>{summary!.groupingText}</Tag>
                      <Tag active={true}>{summary!.canRepeatText}</Tag>
                      <Tag active={true}>{summary!.intervalText}</Tag>
                      <Tag active={true}>赔付{summary!.payoutAmountRange}</Tag>
                    </>
                  ) : (
                    /* 没有责任时，仅显示"不包含"（蓝色标签） */
                    <Tag active={true}>不包含</Tag>
                  )}
                </div>
              )}
              
              {/* 责任说明 */}
              <p style={{ fontSize: '12px', color: '#999', marginTop: '12px', marginBottom: '0', lineHeight: '1.6' }}>
                {category.key === '重疾责任' && '重疾多次赔付增加了保障范围，随着医学的进步，很多原先在我们赔金出比较严重的疾病，慢慢的就可以治愈或者可以带病生存延续生命，如果是单次赔付的重疾险，理赔过一次重症之后，保障责任就结束了。这时，多次赔付的重疾险，可以很好地为我们解决"理赔了一次重症以后，无法再拥有保障"的问题。'}
                {category.key === '中症责任' && '轻/中症多次赔付增加了保障的范围，随着医学的进步，很多原先在我们赔金出比较严重的疾病，慢慢的就可以治愈或者可以带病生存延续生命，如果是单次赔付的重疾险，理赔过一次重症之后，保障责任就结束了。这时，多次赔付的重疾险，可以很好地为我们解决"理赔了一次重症以后，无法再拥有保障"的问题。'}
                {category.key === '轻症责任' && '轻/中症多次赔付增加了保障的范围，随着医学的进步，很多原先在我们赔金出比较严重的疾病，慢慢的就可以治愈或者可以带病生存延续生命，如果是单次赔付的重疾险，理赔过一次重症之后，保障责任就结束了。这时，多次赔付的重疾险，可以很好地为我们解决"理赔了一次重症以后，无法再拥有保障"的问题。'}
                {category.key === '前症责任' && '前症是指疾病的极早期阶段，早于轻症，通常症状较轻或无明显症状。及早发现并治疗前症，可以有效预防疾病恶化，降低发展为轻症、中症乃至重疾的风险。前症给付为被保险人提供了更早期的保障，体现了保险对健康管理的前瞻性关注。'}
                {category.key === '其他疾病责任' && '特定疾病给付包括特定疾病、少儿特定疾病、罕见疾病等专项保障责任。这些责任针对特定人群或特定疾病提供额外保障，增强了保险产品的保障深度和广度。'}
              </p>
                
                {/* 展开后的详细卡片 - 只有在有责任时才显示 */}
                {hasCoverages && isExpanded && (
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    gap: '10px',
                    marginTop: '16px',
                    paddingTop: '16px',
                    borderTop: '1px solid #01BCD620'
                  }}>
                    {/* 排序：主责任优先，再按次数排序 */}
                    {[...category.coverages].sort((a, b) => {
                      // 1. 主责任优先
                      const aLevel = (a as any).responsibilityLevel || ''
                      const bLevel = (b as any).responsibilityLevel || ''
                      const aIsMain = aLevel === '主责任' ? 0 : 1
                      const bIsMain = bLevel === '主责任' ? 0 : 1
                      if (aIsMain !== bIsMain) return aIsMain - bIsMain
                      
                      // 2. 按次数排序（首次/第一次 < 第二次 < 第三次...）
                      const aNum = extractPayoutNumber(a.name || '')
                      const bNum = extractPayoutNumber(b.name || '')
                      return aNum - bNum
                    }).map((coverage, index) => {
                      const interval = getIntervalText(coverage)
                      const grouping = getGroupingText(coverage) || '不分组'
                      const isRepeat = canRepeat(coverage)
                      
                      // 获取所有赔付阶段
                      const result = (coverage as any).parseResult || coverage.result
                      const tiers = result?.payoutAmount?.details?.tiers || []
                      
                      // 如果没有tier，创建一个默认的
                      const tiersToShow = tiers.length > 0 ? tiers : [{ startAge: policyStartAge, endAge: 100 }]
                      
                      // 计算单个阶段的金额
                      const getTierAmount = (tier: any) => {
                        if (tier?.keyAmounts?.[0]?.amount) {
                          const raw = tier.keyAmounts[0].amount
                          return raw >= 10000 ? raw / 10000 : raw
                        } else if (tier?.amount) {
                          return tier.amount >= 10000 ? tier.amount / 10000 : tier.amount
                        }
                        return null
                      }
                      
                      // 获取年龄范围文本
                      const getAgeRange = (tier: any) => {
                        const tierStartAge = tier?.startAge || policyStartAge
                        const tierEndAge = tier?.endAge || 100
                        return tierEndAge >= 100 ? `${tierStartAge}岁～终身` : `${tierStartAge}岁～${tierEndAge}岁`
                      }
                      
                      return (
                        <div
                          key={index}
                          style={{
                            width: '100%',
                            background: '#fff',
                            border: '1px solid #01BCD620',
                            borderRadius: '8px',
                            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                            overflow: 'hidden'
                          }}
                        >
                          {/* 责任名称行 + 标签 + 第一个阶段 */}
                          <div style={{
                            padding: '12px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px'
                          }}>
                            {/* 责任名称 */}
                            <div style={{ 
                              fontSize: '14px', 
                              fontWeight: 600,
                              color: '#333',
                              flex: '0 0 180px'
                            }}>
                              {coverage.name}
                            </div>
                            
                            {/* 标签信息 */}
                            <span style={{ 
                              padding: '3px 10px',
                              background: '#01BCD615',
                              color: '#01BCD6',
                              borderRadius: '10px',
                              fontWeight: 500,
                              fontSize: '12px'
                            }}>
                              {grouping}
                            </span>
                            
                            <span style={{ 
                              padding: '3px 10px',
                              background: isRepeat ? '#e8f5e9' : '#f5f5f5',
                              color: isRepeat ? '#4caf50' : '#999',
                              borderRadius: '10px',
                              fontSize: '12px'
                            }}>
                              {isRepeat ? '可重复' : '不可重复'}
                            </span>
                            
                            <span style={{ 
                              padding: '3px 10px',
                              background: '#f5f5f5',
                              color: '#666',
                              borderRadius: '10px',
                              fontSize: '12px'
                            }}>
                              {interval}
                            </span>
                            
                            <div style={{ flex: 1 }} />
                            
                            {/* 第一个阶段的年龄和金额 */}
                            <div style={{ 
                              padding: '3px 12px',
                              background: '#e3f2fd',
                              color: '#1976d2',
                              borderRadius: '10px',
                              fontSize: '12px',
                              fontWeight: 500
                            }}>
                              {getAgeRange(tiersToShow[0])}
                            </div>
                            
                            {getTierAmount(tiersToShow[0]) && getTierAmount(tiersToShow[0])! > 0 && (
                              <div style={{ 
                                padding: '4px 12px',
                                background: '#01BCD6',
                                color: '#fff',
                                borderRadius: '10px',
                                fontWeight: 600,
                                fontSize: '12px',
                                whiteSpace: 'nowrap'
                              }}>
                                {getTierAmount(tiersToShow[0])}万
                              </div>
                            )}
                          </div>
                          
                          {/* 后续阶段，每个阶段一行 */}
                          {tiersToShow.slice(1).map((tier: any, tierIndex: number) => {
                            const tierAmount = getTierAmount(tier)
                            
                            return (
                              <div 
                                key={tierIndex}
                                style={{
                                  padding: '8px 16px',
                                  paddingLeft: '196px', // 对齐第一行的标签开始位置
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'flex-end',
                                  gap: '12px',
                                  background: '#fafafa',
                                  borderTop: '1px solid #01BCD608'
                                }}
                              >
                                <div style={{ 
                                  padding: '3px 12px',
                                  background: '#e3f2fd',
                                  color: '#1976d2',
                                  borderRadius: '10px',
                                  fontSize: '12px',
                                  fontWeight: 500
                                }}>
                                  {getAgeRange(tier)}
                                </div>
                                
                                {tierAmount && tierAmount > 0 && (
                                  <div style={{ 
                                    padding: '4px 12px',
                                    background: '#01BCD6',
                                    color: '#fff',
                                    borderRadius: '10px',
                                    fontWeight: 600,
                                    fontSize: '12px'
                                  }}>
                                    {tierAmount}万
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )}
            </Section>
          )
        })}
      
      {/* 身故责任 */}
      <Section title={`身故责任（${deathBenefits.length}项）`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {deathBenefits.length === 0 ? (
            // 情况1: 不包含
            <Tag active={true}>不包含</Tag>
          ) : (
            // 情况2: 有身故责任，按格式显示每个责任
            deathBenefits.map((death, idx) => (
              <div
                key={idx}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  background: '#fff',
                  border: '1px solid #01BCD6',
                  borderRadius: '16px',
                  fontSize: '13px'
                }}
              >
                <span style={{ color: '#333', fontWeight: 500 }}>{death.name}</span>
                <span style={{ color: '#01BCD6', fontWeight: 600 }}>{death.amount}</span>
              </div>
            ))
          )}
        </div>
        <p style={{ fontSize: '12px', color: '#999', marginTop: '12px', marginBottom: '0', lineHeight: '1.6' }}>
          身故责任指被保险人遭受意外伤害或因疾病导致身故，保险公司需按合同约定的保额给付。若已经给付过任意一次重大疾病保险金，则本合同的现金价值自首次重大疾病保险金支付之日起降低为零，身故保险金的保险责任均终止。
        </p>
      </Section>
      
      {/* 其他权益 */}
      <Section title={`其他权益（${waiverCoverages.length + annuityCoverages.length + accidentCoverages.length}项）`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* 豁免保费 */}
          {waiverCoverages.length === 0 ? (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '6px 12px',
                background: '#fff',
                border: '1px solid #01BCD6',
                borderRadius: '16px',
                fontSize: '13px',
                color: '#333',
                fontWeight: 500
              }}
            >
              不豁免保费
            </div>
          ) : (
            waiverCoverages.map((waiver, idx) => (
              <div
                key={`waiver-${idx}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '6px 12px',
                  background: '#fff',
                  border: '1px solid #01BCD6',
                  borderRadius: '16px',
                  fontSize: '13px',
                  color: '#333',
                  fontWeight: 500
                }}
              >
                {waiver}
              </div>
            ))
          )}
          
          {/* 年金责任 */}
          {annuityCoverages.map((annuity, idx) => (
            <div
              key={`annuity-${idx}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                background: '#fff',
                border: '1px solid #01BCD6',
                borderRadius: '16px',
                fontSize: '13px'
              }}
            >
              <span style={{ color: '#333', fontWeight: 500 }}>{annuity.name}</span>
              <span style={{ color: '#01BCD6', fontWeight: 600 }}>{annuity.amount}</span>
            </div>
          ))}
          
          {/* 意外责任 */}
          {accidentCoverages.map((accident, idx) => (
            <div
              key={`accident-${idx}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                background: '#fff',
                border: '1px solid #01BCD6',
                borderRadius: '16px',
                fontSize: '13px'
              }}
            >
              <span style={{ color: '#333', fontWeight: 500 }}>{accident.name}</span>
              <span style={{ color: '#01BCD6', fontWeight: 600 }}>{accident.amount}</span>
            </div>
          ))}
          
          {/* 未发生退回保费 */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '6px 12px',
              background: '#fff',
              border: '1px solid #01BCD6',
              borderRadius: '16px',
              fontSize: '13px',
              color: '#333',
              fontWeight: 500
            }}
          >
            {annuityCoverages.length === 0 ? '未发生不退回保费' : '满期可领取年金'}
          </div>
        </div>
        <p style={{ fontSize: '12px', color: '#999', marginTop: '12px', marginBottom: '0', lineHeight: '1.6' }}>
          豁免保费指一旦触发合同里约定的情况（比如得轻症、中症、重疾，或者身故/全残），剩下还没交的保费就不用交了，但保险的保障还继续有效。
        </p>
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
      padding: '5px 14px',
      fontSize: '13px',
      fontWeight: 500,
      color: active ? '#01BCD6' : '#999',
      background: active ? 'rgba(1, 188, 214, 0.1)' : '#f5f5f5',
      border: `1px solid ${active ? 'rgba(1, 188, 214, 0.3)' : '#e5e7eb'}`,
      borderRadius: '18px',
      transition: 'all 0.2s'
    }}>
      {children}
    </span>
  )
}

