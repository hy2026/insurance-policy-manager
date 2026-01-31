import axios, { AxiosInstance } from 'axios'
import type {
  ParseResult,
  PolicyInfo,
  PayoutTier,
  KeyAmount,
  Policy,
  InsuranceProduct,
  TrainingData,
} from '@/types'

// 创建axios实例
const api: AxiosInstance = axios.create({
  baseURL: '/api', // 通过Vite代理转发到后端
  timeout: 180000, // 3分钟超时（LLM调用可能需要较长时间）
  headers: {
    'Content-Type': 'application/json',
  },
})

// 响应拦截器
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('API请求失败:', error)
    // 提取更详细的错误信息
    const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message || '请求失败'
    const errorObj = {
      ...error,
      message: errorMessage,
      error: errorMessage
    }
    return Promise.reject(errorObj)
  }
)

// ==================== 解析相关API ====================

/**
 * 解析保险条款
 */
export async function parseCoverage(
  clauseText: string,
  coverageType: string,
  policyInfo?: PolicyInfo
): Promise<ParseResult> {
  const response: any = await api.post('/parse', {
    clauseText,
    coverageType,
    policyInfo,
  })
  // 后端返回格式: { success: boolean, result?: any, message?: string }
  // 响应拦截器已经返回了response.data，所以response就是后端返回的对象
  if (response && response.success && response.result) {
    return response.result as ParseResult
  }
  throw new Error(response?.message || '解析失败')
}

/**
 * 重新计算指定阶段的金额
 */
export async function recalculateTier(
  tier: PayoutTier,
  policyInfo: PolicyInfo
): Promise<KeyAmount[]> {
  const response: any = await api.post('/coverage/recalculate', {
    tier,
    policyInfo,
  })
  return response.data?.keyAmounts || []
}

// ==================== 保单相关API ====================

/**
 * 获取用户保单（客户真实保单）
 * 注意：需要传入userId参数（暂时用默认值1）
 */
export async function getPolicies(userId: number = 1): Promise<Policy[]> {
  const response: any = await api.get('/policies', {
    params: { userId }
  })
  return response.data || []
}

/**
 * 根据ID获取保单
 */
export async function getPolicyById(id: number): Promise<Policy> {
  const response: any = await api.get(`/policies/${id}`)
  return response.data!
}

/**
 * 创建保单
 */
export async function createPolicy(policy: Omit<Policy, 'id' | 'createdAt' | 'updatedAt'>): Promise<Policy> {
  const response: any = await api.post('/policies', policy)
  return response.data!
}

/**
 * 更新保单
 */
export async function updatePolicy(id: number, policy: Partial<Policy>): Promise<Policy> {
  const response: any = await api.put(`/policies/${id}`, policy)
  return response.data!
}

/**
 * 删除保单
 */
export async function deletePolicy(id: number): Promise<void> {
  await api.delete(`/policies/${id}`)
}

// 别名函数（为了兼容不同命名习惯）
export const addPolicy = createPolicy
export const editPolicy = updatePolicy
export const removePolicy = deletePolicy

// ==================== 产品库相关API ====================

/**
 * 获取所有产品
 */
export async function getProducts(params?: {
  page?: number
  pageSize?: number
  [key: string]: any
}): Promise<{ data: InsuranceProduct[], total: number, byCategory?: any }> {
  // 注意：响应拦截器已经返回了response.data，所以response就是后端返回的对象
  const response: any = await api.get('/products', { params })
  // response 已经是 { success: true, data: [...], total: ..., byCategory: ... }
  if (response && response.success) {
    return {
      data: response.data || [],
      total: response.total || 0,
      byCategory: response.byCategory || {}
    }
  }
  return { data: [], total: 0 }
}

/**
 * 根据ID获取产品
 */
export async function getProductById(id: number): Promise<InsuranceProduct> {
  const response: any = await api.get(`/products/${id}`)
  return response.data!
}

/**
 * 创建产品
 */
export async function createProduct(product: Omit<InsuranceProduct, 'id' | 'createdAt' | 'updatedAt'>): Promise<InsuranceProduct> {
  const response: any = await api.post('/products', product)
  return response.data!
}

/**
 * 更新产品
 */
export async function updateProduct(id: number, product: Partial<InsuranceProduct>): Promise<InsuranceProduct> {
  const response: any = await api.put(`/products/${id}`, product)
  return response.data!
}

/**
 * 删除产品
 */
export async function deleteProduct(id: number): Promise<void> {
  await api.delete(`/products/${id}`)
}

/**
 * 导入产品Excel文件
 */
export async function importProducts(file: File): Promise<{ success: boolean; message: string; count: number }> {
  const formData = new FormData()
  formData.append('file', file)
  
  const response: any = await axios.post('/api/products/import', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    },
    timeout: 180000
  })
  
  return response.data
}

/**
 * 导出产品数据为Excel
 */
export async function exportProducts(): Promise<void> {
  // 创建一个临时的a标签来触发下载
  const link = document.createElement('a')
  link.href = `/api/products/export?t=${Date.now()}`
  link.download = `保险产品库导出-${Date.now()}.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// ==================== 责任库相关API ====================

/**
 * 保存解析后的责任到库（用于训练）
 */
export async function saveCoveragesToLibrary(data: {
  insuranceCompany: string
  productName: string
  policyType: string
  coverages: any[]
}): Promise<{ productId: number; coverageIds: number[]; count: number }> {
  const response: any = await api.post('/coverage-library/save', data)
  return response.data!
}

/**
 * 获取责任库列表（支持分页和筛选）
 */
export async function getCoverageLibrary(filters?: {
  page?: number
  pageSize?: number
  保单ID号?: string
  责任类型?: string
  责任名称?: string
  是否可以重复赔付?: string
  是否分组?: string
  是否豁免?: string
  是否已审核?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}): Promise<{
  data: any[]
  total: number
  verified: number
  unverified: number
}> {
  // 注意：响应拦截器已经返回了response.data，所以这里response就是后端返回的对象
  const response: any = await api.get('/coverage-library', {
    params: filters
  })
  
  // 后端返回格式：{ success: true, data: [...], total: ..., verified: ..., unverified: ... }
  // 响应拦截器已经提取了response.data，所以response就是 { success: true, data: [...], total: ... }
  if (response && response.success !== undefined) {
    // 新格式：{ success: true, data: [...], total: ... }
    return {
      data: response.data || [],
      total: response.total || 0,
      verified: response.verified || 0,
      unverified: response.unverified || 0
    }
  }
  
  // 兼容旧格式：直接返回data字段
  if (response && response.data) {
    return {
      data: Array.isArray(response.data) ? response.data : [],
      total: response.total || 0,
      verified: response.verified || 0,
      unverified: response.unverified || 0
    }
  }
  
  // 默认返回
  console.warn('getCoverageLibrary: 未识别的响应格式', response)
  return { data: [], total: 0, verified: 0, unverified: 0 }
}

/**
 * 导入解析结果JSON
 */
export async function importCoverageLibrary(data: {
  cases: any[]
  batchInfo?: any
}): Promise<{ count: number; success: number; failed: number }> {
  const response: any = await api.post('/coverage-library/import', data)
  return response.data!
}

/**
 * 导出责任库数据
 */
export async function exportCoverageLibrary(filters?: any): Promise<void> {
  // 直接使用axios获取blob，绕过响应拦截器
  // 创建一个新的axios实例，不使用拦截器
  const axiosInstance = axios.create({
    baseURL: '/api',
    timeout: 180000,
    responseType: 'blob'
  })
  
  const response = await axiosInstance.get('/coverage-library/export', {
    params: filters
  })
  
  // 创建下载链接
  const blob = new Blob([response.data], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `责任库导出-${Date.now()}.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

/**
 * 标记责任为已验证
 */
export async function verifyCoverage(id: number, verifiedBy: string): Promise<any> {
  const response: any = await api.post(`/coverage-library/${id}/verify`, {
    verifiedBy
  })
  return response.data!
}

/**
 * 获取责任库统计（按责任类型分组）
 */
export async function getCoverageLibraryStats(policyId?: string): Promise<{
  total: number
  verified: number
  unverified: number
  byType: {
    疾病责任: { total: number; verified: number; unverified: number }
    身故责任: { total: number; verified: number; unverified: number }
    意外责任: { total: number; verified: number; unverified: number }
    年金责任: { total: number; verified: number; unverified: number }
  }
}> {
  const response: any = await api.get('/coverage-library/stats', {
    params: policyId ? { policyId } : {}
  })
  if (response.success && response.data) {
    return response.data
  }
  throw new Error(response.message || '获取统计数据失败')
}

/**
 * 获取合同统计信息（合同数量、责任总数、合同ID列表）
 */
export async function getContractStats(): Promise<{
  contractCount: number
  totalCoverageCount: number
  policyIds: string[]
}> {
  const response: any = await api.get('/coverage-library/contract-stats')
  if (response.success && response.data) {
    return response.data
  }
  throw new Error(response.message || '获取合同统计失败')
}

// ==================== 训练数据相关API ====================

/**
 * 获取所有训练数据
 */
export async function getTrainingData(filters?: {
  verified?: boolean
  coverageType?: string
}): Promise<TrainingData[]> {
  const response: any = await api.get('/training/data', {
    params: filters,
  })
  return response.data || []
}

/**
 * 标记数据为已验证
 */
export async function verifyTrainingData(id: number, verifiedBy: string): Promise<TrainingData> {
  const response: any = await api.post(`/training/data/${id}/verify`, {
    verifiedBy,
  })
  return response.data!
}

/**
 * 导出训练数据
 */
export async function exportTrainingData(): Promise<{ filePath: string; totalSamples: number }> {
  const response: any = await api.post('/training/export')
  return response.data!
}

/**
 * 健康检查
 */
export async function healthCheck(): Promise<{ status: string }> {
  const response: any = await api.get('/health')
  return response.data || response
}

// ==================== 审核相关API（新）====================

/**
 * 审核责任（通过/不通过）
 */
export async function reviewCoverage(
  id: number,
  reviewData: {
    reviewStatus: 'approved' | 'rejected'
    reviewNotes?: string
    reviewedBy: string
  }
): Promise<any> {
  const response: any = await api.post(`/coverage-library/${id}/review`, reviewData)
  return response.data || response
}

/**
 * 审核产品（通过/不通过）
 */
export async function reviewProduct(
  id: number,
  reviewData: {
    reviewStatus: 'approved' | 'rejected'
    reviewNotes?: string
    reviewedBy: string
  }
): Promise<any> {
  const response: any = await api.post(`/products/${id}/review`, reviewData)
  return response.data || response
}

// ==================== 家庭成员/被保险人相关API ====================

export interface FamilyMember {
  id: number;
  userId: number;
  entity: string;  // 本人/配偶/孩子/父母
  birthYear: number;
  gender: string;  // 男/女
  name?: string | null;
  policyCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface PersonInfoInput {
  userId: number;
  entity: string;  // 本人/配偶/孩子
  birthYear: number;
  name?: string;
  gender?: string;
}

/**
 * 获取用户的所有家庭成员
 */
export async function getFamilyMembers(userId: number = 1): Promise<FamilyMember[]> {
  const response: any = await api.get('/insured-persons', {
    params: { userId }
  })
  return response.data || []
}

/**
 * 创建新的家庭成员
 */
export async function createFamilyMember(data: {
  userId: number;
  entity: string;
  birthYear: number;
  gender: string;
  name?: string;
}): Promise<FamilyMember> {
  const response: any = await api.post('/insured-persons', data)
  return response.data!
}

/**
 * 更新家庭成员信息
 */
export async function updateFamilyMember(id: number, data: {
  entity?: string;
  birthYear?: number;
  gender?: string;
  name?: string;
}): Promise<FamilyMember> {
  const response: any = await api.put(`/insured-persons/${id}`, data)
  return response.data!
}

/**
 * 删除家庭成员
 */
export async function deleteFamilyMember(id: number): Promise<void> {
  await api.delete(`/insured-persons/${id}`)
}

export interface PersonConflictResult {
  hasConflict: boolean;
  existingPerson?: {
    id: number;
    entity: string;
    birthYear: number;
    name?: string | null;
    policies: Array<{
      id: number;
      productName: string;
      policyType: string;
      insuranceCompany: string;
      policyStartYear: number;
      basicSumInsured?: number | null;
      annualPremium?: number | null;
    }>;
  };
  changes?: {
    birthYear: {
      old: number;
      new: number;
      ageDifference: number;
    };
  };
}

/**
 * 检测人员信息冲突
 */
export async function checkPersonInfoConflict(
  personInfo: PersonInfoInput
): Promise<PersonConflictResult> {
  const response: any = await api.post('/insured-persons/check-conflict', personInfo)
  return response
}

/**
 * 获取或创建被保险人记录
 */
export async function getOrCreateInsuredPerson(
  personInfo: PersonInfoInput
): Promise<{ id: number; isNew: boolean }> {
  const response: any = await api.post('/insured-persons/get-or-create', personInfo)
  return response
}

/**
 * 更新被保险人信息（影响所有关联保单）
 * 支持旧数据更新：当 personId === -1 时，需要传入 entity 和 userId
 */
export async function updateInsuredPersonGlobally(
  personId: number,
  updates: {
    birthYear?: number;
    name?: string;
    gender?: string;
    entity?: string;  // 用于旧数据更新
    userId?: number;  // 用于旧数据更新
  }
): Promise<{
  updatedPerson: any;
  affectedPolicies: number;
}> {
  const response: any = await api.put(`/insured-persons/${personId}/update-globally`, updates)
  return response
}

export default api

