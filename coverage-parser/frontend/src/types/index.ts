// ==================== 保单信息类型 ====================
export interface PolicyInfo {
  birthYear: number
  policyStartYear: number
  coverageEndYear: number | 'lifetime'
  basicSumInsured: number // 单位：元
  annualPremium?: number
  totalPaymentPeriod?: string
}

// ==================== 解析结果类型 ====================
export interface PayoutTier {
  period: string
  value?: number | string | object
  unit?: string
  startAge?: number
  endAge?: number
  amount?: number
  formula?: string
  formulaType?: 'compound' | 'simple' | 'max'
  interestRate?: number
  keyAmounts?: KeyAmount[]
}

export interface KeyAmount {
  year: number
  age: number
  amount: number
}

export interface PayoutAmount {
  type: string
  confidence: number
  extractedText?: string[]
  details?: {
    tiers?: PayoutTier[]
    conditions?: PayoutTier[]
  }
}

export interface PayoutCount {
  type: string
  maxCount: number | null
  confidence: number
  extractedText?: string[]
}

export interface IntervalPeriod {
  hasInterval: boolean
  days: number | null
  confidence: number
  extractedText?: string[]
}

export interface Grouping {
  isGrouped: boolean
  groupCount: number | null
  confidence: number
  extractedText?: string[]
}

export interface RepeatablePayout {
  isRepeatable: boolean
  confidence: number
  extractedText?: string[]
}

export interface PremiumWaiver {
  isWaived: boolean
  confidence: number
  extractedText?: string[]
}

export interface Condition {
  type: string
  description: string
  confidence: number
}

export interface ParseResult {
  payoutAmount?: PayoutAmount  // 改为可选，不适用时不包含
  payoutCount?: PayoutCount
  intervalPeriod?: IntervalPeriod
  grouping?: Grouping
  repeatablePayout?: RepeatablePayout
  premiumWaiver?: PremiumWaiver
  conditions?: Condition[]
  overallConfidence?: number
  parseMethod?: string
  // 不适用责任相关字段
  status?: 'applicable' | 'not_applicable'
  reason?: string  // 不适用原因
  naturalLanguageDescription?: string  // 自然语言描述（不适用时显示）
}

// ==================== 责任类型 ====================
export interface Coverage {
  id?: string
  name: string
  type: string
  clause: string
  result: ParseResult
  policyType?: string
  createdAt?: Date
}

// ==================== 保单类型 ====================
export interface Policy {
  id?: string
  insuranceCompany: string
  productName: string
  insuredPerson: string
  policyType?: string
  productSubCategory?: string  // 保险小类：重疾保险/防癌保险等
  policyInfo: PolicyInfo
  coverages: Coverage[]
  // 以下字段是为了兼容性，允许直接在顶层访问
  birthYear?: number
  policyStartYear?: number
  coverageEndYear?: number | 'lifetime' | string
  totalPaymentPeriod?: number | string
  paymentPeriod?: number | string
  annualPremium?: number
  basicSumInsured?: number
  policyIdNumber?: string  // 保单ID号
  createdAt?: Date
  updatedAt?: Date
}

// ==================== API响应类型 ====================
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  message?: string
  error?: string
}

export interface ParseApiResponse extends ApiResponse {
  data: ParseResult
}

export interface RecalculateApiResponse extends ApiResponse {
  keyAmounts: KeyAmount[]
}

// ==================== 产品库类型 ====================
export interface InsuranceProduct {
  id: number
  company: string
  productName: string
  policyType: string
  approvalDate?: Date
  standardCoverages?: any
  createdAt: Date
  updatedAt: Date
}

// ==================== 训练数据类型 ====================
export interface TrainingData {
  id: number
  productId: number
  coverageType: string
  coverageName: string
  clauseText: string
  parsedResult: any
  verified: boolean
  verifiedBy?: string
  createdAt: Date
}










