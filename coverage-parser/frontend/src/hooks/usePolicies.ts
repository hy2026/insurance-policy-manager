import { useState, useEffect } from 'react'
import { getPolicies, createPolicy, updatePolicy, deletePolicy } from '@/services/api'
import type { Policy } from '@/types'
import { message } from 'antd'

export function usePolicies() {
  const [policies, setPolicies] = useState<Policy[]>([])
  const [loading, setLoading] = useState(false)

  // 加载保单列表
  const loadPolicies = async () => {
    try {
      setLoading(true)
      const data = await getPolicies()
      setPolicies(data)
    } catch (error: any) {
      console.error('加载保单失败:', error)
      message.error('加载保单失败')
    } finally {
      setLoading(false)
    }
  }

  // 创建保单
  const addPolicy = async (policy: Omit<Policy, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      setLoading(true)
      const newPolicy = await createPolicy(policy)
      setPolicies([...policies, newPolicy])
      message.success('保单已创建')
      return newPolicy
    } catch (error: any) {
      console.error('创建保单失败:', error)
      message.error('创建保单失败')
      throw error
    } finally {
      setLoading(false)
    }
  }

  // 更新保单
  const editPolicy = async (id: string, updates: Partial<Policy>) => {
    try {
      setLoading(true)
      const updatedPolicy = await updatePolicy(id, updates)
      setPolicies(policies.map(p => p.id === id ? updatedPolicy : p))
      message.success('保单已更新')
      return updatedPolicy
    } catch (error: any) {
      console.error('更新保单失败:', error)
      message.error('更新保单失败')
      throw error
    } finally {
      setLoading(false)
    }
  }

  // 删除保单
  const removePolicy = async (id: string) => {
    try {
      setLoading(true)
      await deletePolicy(id)
      setPolicies(policies.filter(p => p.id !== id))
      message.success('保单已删除')
    } catch (error: any) {
      console.error('删除保单失败:', error)
      message.error('删除保单失败')
      throw error
    } finally {
      setLoading(false)
    }
  }

  // 初始加载
  useEffect(() => {
    loadPolicies()
  }, [])

  return {
    policies,
    loading,
    loadPolicies,
    addPolicy,
    editPolicy,
    removePolicy,
  }
}

































