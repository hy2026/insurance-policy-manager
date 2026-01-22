import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal, message, Select } from 'antd'
import { getPolicies, removePolicy, getFamilyMembers, createFamilyMember, updateFamilyMember, deleteFamilyMember } from '@/services/api'
import type { Policy } from '@/types'
import type { FamilyMember } from '@/services/api'
import PolicyDetailCard from '@/components/PolicyDetailCard'

console.log('💎💎💎 版本 13.0 - 添加保单详情展开 💎💎💎')

// 根据性别动态生成婚育状态选项（参照zhichu1）
const getMaritalStatusOptions = (gender: string) => [
  {
    value: 'single-no-child',
    label: '单身 + 不养娃',
    image: gender === '男' ? '/images/self-male.png' : '/images/self-female.png'
  },
  {
    value: 'single-with-child',
    label: '单身 + 养娃',
    image: gender === '男' ? '/images/single-male-child.png' : '/images/single-female-child.png'
  },
  {
    value: 'married-no-child',
    label: '已婚 + 不养娃',
    image: '/images/family-married.png'
  },
  {
    value: 'married-with-child',
    label: '已婚 + 养娃',
    image: '/images/family-married-child.png'
  }
]

// 根据家庭成员组成获取当前状态
// 判断是否是孩子类型的entity
const isChildEntity = (entity: string): boolean => {
  return ['孩子', '老大', '老二', '老三', '老四', '老五'].includes(entity) || entity.startsWith('孩子')
}

const getFamilyStatus = (members: FamilyMember[]): string => {
  const hasSpouse = members.some(m => m.entity === '配偶')
  const hasChild = members.some(m => isChildEntity(m.entity))
  
  if (hasSpouse && hasChild) return '已婚 + 养娃'
  if (hasSpouse && !hasChild) return '已婚 + 不养娃'
  if (!hasSpouse && hasChild) return '单身 + 养娃'
  return '单身 + 不养娃'
}

// 根据家庭成员组成获取家庭图片
const getFamilyImage = (members: FamilyMember[], selfGender: string | null): string => {
  const hasSpouse = members.some(m => m.entity === '配偶')
  const hasChild = members.some(m => isChildEntity(m.entity))
  const gender = selfGender || '男'
  
  if (hasSpouse && hasChild) return '/images/family-married-child.png'
  if (hasSpouse && !hasChild) return '/images/family-married.png'
  if (!hasSpouse && hasChild) return gender === '男' ? '/images/single-male-child.png' : '/images/single-female-child.png'
  return gender === '男' ? '/images/self-male.png' : '/images/self-female.png'
}

// 根据性别和称谓获取头像
const getAvatarByGenderAndEntity = (gender: string | null, entity: string): string => {
  if (isChildEntity(entity)) return '/images/child.png'
  if (entity === '配偶') return gender === '男' ? '/images/self-male.png' : '/images/spouse.png'
  return gender === '男' ? '/images/self-male.png' : '/images/self-female.png'
}

const POLICY_TYPE_MAP: Record<string, string> = {
  'critical_illness': '重疾险',
  'life': '人寿险',
  'accident': '意外险',
  'annuity': '年金险'
}

export default function PolicyManagerHomePage() {
  const navigate = useNavigate()
  const currentYear = new Date().getFullYear()
  
  // 数据状态
  const [policies, setPolicies] = useState<Policy[]>([])
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([])
  const [filteredMemberId, setFilteredMemberId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  
  // 家庭登记表单状态
  const [showFamilyForm, setShowFamilyForm] = useState(false)
  const [birthYear, setBirthYear] = useState<string>('2000')
  const [gender, setGender] = useState<string>('女')
  const [maritalStatus, setMaritalStatus] = useState<string>('')
  const [partnerBirthYear, setPartnerBirthYear] = useState<string>('')
  const [children, setChildren] = useState<{ id: string; birthYear: string }[]>([])
  const [saving, setSaving] = useState(false)
  
  // 保单详情展开状态
  const [expandedPolicyId, setExpandedPolicyId] = useState<string | number | null>(null)

  // 年份选项
  const years = Array.from({ length: 70 }, (_, i) => currentYear - 18 - i)
  const childYears = Array.from({ length: 30 }, (_, i) => currentYear - i)

  // 计算需要显示的字段
  const needPartnerInfo = maritalStatus === 'married-no-child' || maritalStatus === 'married-with-child'
  const needChildInfo = maritalStatus === 'single-with-child' || maritalStatus === 'married-with-child'

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [policiesData, membersData] = await Promise.all([
        getPolicies(1),
        getFamilyMembers(1)
      ])
      setPolicies(policiesData)
      setFamilyMembers(membersData)
      
      // 如果没有家庭成员，首次进入时展开登记表单
      if (membersData.length === 0) {
        setShowFamilyForm(true)
      } else {
        // 从现有成员中提取数据到表单
        initFormFromMembers(membersData)
      }
    } catch (error) {
      console.error('加载数据失败:', error)
      message.error('加载数据失败')
    } finally {
      setLoading(false)
    }
  }

  // 从现有成员初始化表单数据
  const initFormFromMembers = (members: FamilyMember[]) => {
    const selfMember = members.find(m => m.entity === '本人')
    const spouseMember = members.find(m => m.entity === '配偶')
    const childMembers = members.filter(m => isChildEntity(m.entity))
    
    if (selfMember) {
      setBirthYear(selfMember.birthYear.toString())
      setGender(selfMember.gender || '女')
    }
    
    if (spouseMember) {
      setPartnerBirthYear(spouseMember.birthYear.toString())
    }
    
    if (childMembers.length > 0) {
      setChildren(childMembers.map(c => ({
        id: c.id.toString(),
        birthYear: c.birthYear.toString()
      })))
    }
    
    // 推断婚育状态
    if (spouseMember && childMembers.length > 0) {
      setMaritalStatus('married-with-child')
    } else if (spouseMember) {
      setMaritalStatus('married-no-child')
    } else if (childMembers.length > 0) {
      setMaritalStatus('single-with-child')
    } else if (selfMember) {
      setMaritalStatus('single-no-child')
    }
  }

  // 当婚育状态变化时的处理
  useEffect(() => {
    if (!needPartnerInfo) {
      setPartnerBirthYear('')
    } else if (!partnerBirthYear && birthYear) {
      setPartnerBirthYear(birthYear)
    }
  }, [needPartnerInfo])

  useEffect(() => {
    if (needChildInfo && children.length === 0) {
      setChildren([{ id: Date.now().toString(), birthYear: '' }])
    } else if (!needChildInfo) {
      setChildren([])
    }
  }, [needChildInfo])

  // 添加/删除/更新孩子
  const addChild = () => {
    if (children.length < 10) {
      setChildren([...children, { id: Date.now().toString(), birthYear: '' }])
    }
  }
  const removeChild = (childId: string) => {
    if (children.length > 1) {
      setChildren(children.filter(c => c.id !== childId))
    }
  }
  const updateChildBirthYear = (childId: string, value: string) => {
    setChildren(children.map(c => c.id === childId ? { ...c, birthYear: value } : c))
  }

  // 检查是否有需要更新的保单
  const checkAffectedPolicies = () => {
    const selfMember = familyMembers.find(m => m.entity === '本人')
    const spouseMember = familyMembers.find(m => m.entity === '配偶')
    const childMembers = familyMembers.filter(m => isChildEntity(m.entity))
    
    const changes: string[] = []
    let affectedPolicyCount = 0
    
    // 检查本人出生年份变化
    if (selfMember && selfMember.birthYear !== parseInt(birthYear)) {
      const policyCount = getMemberPolicyCount('本人')
      if (policyCount > 0) {
        changes.push(`本人出生年份从 ${selfMember.birthYear} 改为 ${birthYear}，将影响 ${policyCount} 份保单的理赔金额计算`)
        affectedPolicyCount += policyCount
      }
    }
    
    // 检查配偶变化
    if (needPartnerInfo && spouseMember && spouseMember.birthYear !== parseInt(partnerBirthYear)) {
      const policyCount = getMemberPolicyCount('配偶')
      if (policyCount > 0) {
        changes.push(`配偶出生年份从 ${spouseMember.birthYear} 改为 ${partnerBirthYear}，将影响 ${policyCount} 份保单`)
        affectedPolicyCount += policyCount
      }
    }
    
    // 检查孩子变化
    childMembers.forEach((child, i) => {
      if (i < children.length && child.birthYear !== parseInt(children[i].birthYear)) {
        const policyCount = policies.filter(p => p.insuredPerson === '孩子').length
        if (policyCount > 0) {
          changes.push(`孩子出生年份变化，将影响 ${policyCount} 份保单`)
          affectedPolicyCount += policyCount
        }
      }
    })
    
    return { changes, affectedPolicyCount }
  }

  // 保存家庭信息
  const handleSaveFamilyInfo = async () => {
    if (!birthYear || !gender || !maritalStatus) {
      message.warning('请完整填写本人信息和当前状态')
      return
    }
    if (needPartnerInfo && !partnerBirthYear) {
      message.warning('请填写伴侣出生年份')
      return
    }
    if (needChildInfo && children.some(c => !c.birthYear)) {
      message.warning('请填写所有孩子的出生年份')
      return
    }

    // 检查是否有受影响的保单
    const { changes, affectedPolicyCount } = checkAffectedPolicies()
    
    if (affectedPolicyCount > 0) {
      Modal.confirm({
        title: '确认修改家庭成员信息',
        content: (
          <div>
            <p style={{ marginBottom: '12px', color: '#ff4d4f' }}>
              此操作将影响 <strong>{affectedPolicyCount}</strong> 份保单的理赔金额计算：
            </p>
            <ul style={{ paddingLeft: '20px', color: '#666' }}>
              {changes.map((change, i) => (
                <li key={i} style={{ marginBottom: '4px' }}>{change}</li>
              ))}
            </ul>
            <p style={{ marginTop: '12px', color: '#999', fontSize: '12px' }}>
              系统将自动重新计算受影响保单的各阶段理赔金额
            </p>
          </div>
        ),
        okText: '确认修改',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: () => doSaveFamilyInfo(),
      })
    } else {
      doSaveFamilyInfo()
    }
  }

  // 实际执行保存
  const doSaveFamilyInfo = async () => {
    try {
      setSaving(true)
      const userId = 1

      const selfMember = familyMembers.find(m => m.entity === '本人')
      const spouseMember = familyMembers.find(m => m.entity === '配偶')
      const childMembers = familyMembers.filter(m => isChildEntity(m.entity))

      // 1. 处理本人信息
      if (selfMember) {
        await updateFamilyMember(selfMember.id, { entity: '本人', birthYear: parseInt(birthYear), gender })
      } else {
        await createFamilyMember({ userId, entity: '本人', birthYear: parseInt(birthYear), gender })
      }

      // 2. 处理配偶信息
      if (needPartnerInfo) {
        const partnerGender = gender === '男' ? '女' : '男'
        if (spouseMember) {
          await updateFamilyMember(spouseMember.id, { entity: '配偶', birthYear: parseInt(partnerBirthYear), gender: partnerGender })
        } else {
          await createFamilyMember({ userId, entity: '配偶', birthYear: parseInt(partnerBirthYear), gender: partnerGender })
        }
      } else if (spouseMember) {
        // 尝试删除配偶，如果有保单则保留
        try {
          await deleteFamilyMember(spouseMember.id)
        } catch (e: any) {
          console.log('配偶有关联保单，保留记录')
        }
      }

      // 3. 处理孩子信息
      if (needChildInfo) {
        // 按出生年份排序现有孩子（从大到小，即老大最先）
        const sortedChildMembers = [...childMembers].sort((a, b) => a.birthYear - b.birthYear)
        
        // 更新现有孩子的出生年份（保持 entity 不变，避免唯一约束冲突）
        for (let i = 0; i < children.length; i++) {
          const child = children[i]
          if (i < sortedChildMembers.length) {
            // 更新现有孩子，只更新 birthYear，不改变 entity
            await updateFamilyMember(sortedChildMembers[i].id, { birthYear: parseInt(child.birthYear), gender: '男' })
          } else {
            // 创建新孩子，使用新的 entity 名称
            const childEntityNames = ['老大', '老二', '老三', '老四', '老五']
            // 找一个未被使用的 entity
            const usedEntities = sortedChildMembers.map(m => m.entity)
            let childEntity = childEntityNames.find(name => !usedEntities.includes(name)) || `孩子${i + 1}`
            await createFamilyMember({ userId, entity: childEntity, birthYear: parseInt(child.birthYear), gender: '男' })
          }
        }
        
        // 删除多余的孩子（只删除没有保单的）
        for (let i = children.length; i < sortedChildMembers.length; i++) {
          try {
            await deleteFamilyMember(sortedChildMembers[i].id)
          } catch (e: any) {
            console.log('孩子有关联保单，保留记录')
          }
        }
      } else {
        // 不需要孩子信息，尝试删除所有孩子
        for (const child of childMembers) {
          try {
            await deleteFamilyMember(child.id)
          } catch (e: any) {
            console.log('孩子有关联保单，保留记录')
          }
        }
      }

      message.success('家庭信息保存成功，相关保单已更新')
      setShowFamilyForm(false) // 收起表单
      loadData() // 重新加载数据
    } catch (error: any) {
      console.error('保存失败:', error)
      message.error(error.response?.data?.error || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  // 计算每个成员的保单数量
  const getMemberPolicyCount = (entity: string) => {
    return policies.filter(p => p.insuredPerson === entity).length
  }

  // 筛选保单
  const getFilteredPolicies = () => {
    if (!filteredMemberId) return policies
    const member = familyMembers.find(m => m.id === filteredMemberId)
    if (!member) return policies
    return policies.filter(p => p.insuredPerson === member.entity)
  }

  // 删除保单
  const handleDeletePolicy = async (id: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这份保单吗？',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await removePolicy(id)
          message.success('删除成功')
          loadData()
        } catch (error) {
          message.error('删除失败')
        }
      }
    })
  }

  // 获取分类的家庭成员
  const selfMember = familyMembers.find(m => m.entity === '本人')
  const spouseMember = familyMembers.find(m => m.entity === '配偶')
  const childMembers = familyMembers.filter(m => isChildEntity(m.entity))
  // 构建去重后的成员列表：本人只取第一个，配偶只取第一个，孩子可以有多个
  const displayMembers = [
    ...(selfMember ? [selfMember] : []),
    ...(spouseMember ? [spouseMember] : []),
    ...childMembers
  ]

  const displayPolicies = getFilteredPolicies()
  const totalPolicies = policies.length
  const familyStatus = getFamilyStatus(displayMembers)
  const familyImage = getFamilyImage(displayMembers, selfMember?.gender || null)
  const maritalStatusOptions = getMaritalStatusOptions(gender)

  return (
    <div style={{ minHeight: '100vh', padding: '24px', background: '#f0f8fc' }}>
      {/* 顶部标题区域 */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px' }}>
          <h1 style={{ fontSize: '30px', fontWeight: 700, color: '#2A2A36', margin: 0 }}>
            我的家庭保单
          </h1>
          <p style={{ fontSize: '14px', color: '#6b7280', margin: 0, fontWeight: 400 }}>
            全方位保单管理，助力美好未来
          </p>
        </div>
        </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>

        {/* 家庭信息登记表单（展开时显示） */}
        {showFamilyForm && (
      <div style={{ 
            marginBottom: '24px',
            background: '#fff',
            borderRadius: '2.5rem',
            padding: '32px 40px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
            border: '1px solid #e5e7eb'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>
                家庭成员信息登记
              </h2>
              {displayMembers.length > 0 && (
                <button
                  onClick={() => setShowFamilyForm(false)}
                  style={{
                    padding: '6px 12px',
                    fontSize: '13px',
                    color: '#666',
                    background: '#f5f5f5',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  收起
                </button>
              )}
            </div>

            {/* 第一行：出生年份 + 性别 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginBottom: '24px' }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', fontSize: '20px', fontWeight: 600, color: '#1f2937', marginBottom: '12px' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#01BCD6" strokeWidth="2" style={{ marginRight: '12px' }}>
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                  出生年份
                </label>
                <Select value={birthYear} onChange={setBirthYear} style={{ width: '100%', height: '51px' }} size="large">
                  {years.map(year => <Select.Option key={year} value={year.toString()}>{year}年</Select.Option>)}
                </Select>
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', fontSize: '20px', fontWeight: 600, color: '#1f2937', marginBottom: '12px' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#01BCD6" strokeWidth="2" style={{ marginRight: '12px' }}>
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                  性别
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '32px', height: '51px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input type="radio" name="gender" value="男" checked={gender === '男'} onChange={(e) => setGender(e.target.value)} style={{ width: '20px', height: '20px', marginRight: '8px', accentColor: '#01BCD6' }} />
                    <span style={{ fontSize: '18px', fontWeight: 500 }}>男</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input type="radio" name="gender" value="女" checked={gender === '女'} onChange={(e) => setGender(e.target.value)} style={{ width: '20px', height: '20px', marginRight: '8px', accentColor: '#01BCD6' }} />
                    <span style={{ fontSize: '18px', fontWeight: 500 }}>女</span>
                  </label>
                </div>
              </div>
            </div>

            {/* 当前状态 - 四宫格图片选择 */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '20px', fontWeight: 600, color: '#1f2937', marginBottom: '12px' }}>当前状态</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                {maritalStatusOptions.map(option => (
                  <div
                    key={option.value}
                    onClick={() => setMaritalStatus(option.value)}
                    style={{
                      cursor: 'pointer',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      border: maritalStatus === option.value ? '2px solid #01BCD6' : '1px solid rgba(1, 188, 214, 0.3)',
                      background: maritalStatus === option.value ? 'linear-gradient(135deg, rgba(1, 188, 214, 0.1), rgba(1, 188, 214, 0.05))' : '#fafafa',
                      transition: 'all 0.3s',
                      transform: maritalStatus === option.value ? 'scale(1.02)' : 'scale(1)',
                      boxShadow: maritalStatus === option.value ? '0 4px 12px rgba(1, 188, 214, 0.2)' : '0 2px 4px rgba(0,0,0,0.05)',
                      position: 'relative'
                    }}
                  >
                    {maritalStatus === option.value && (
                      <div style={{ position: 'absolute', top: '8px', right: '8px', width: '20px', height: '20px', borderRadius: '50%', background: '#01BCD6', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      </div>
                    )}
                    <div style={{ aspectRatio: '4/2.5', overflow: 'hidden' }}>
                      <img src={option.image} alt={option.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={{ padding: '8px', borderTop: '1px solid rgba(1, 188, 214, 0.3)', textAlign: 'center' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>{option.label}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', color: '#6b7280', fontSize: '13px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                养娃指孩子未结束教育阶段，需支持至教育结束
              </div>
            </div>

            {/* 伴侣和孩子信息 */}
            {(needPartnerInfo || needChildInfo) && (
              <div style={{ display: 'grid', gridTemplateColumns: needPartnerInfo && needChildInfo ? '1fr 1fr' : '1fr', gap: '24px', marginBottom: '24px' }}>
                {needPartnerInfo && (
                  <div style={{ padding: '16px 20px', background: 'rgba(1, 188, 214, 0.05)', borderRadius: '2rem', border: '1px solid rgba(1, 188, 214, 0.4)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', fontSize: '16px', fontWeight: 600, color: '#1f2937', marginBottom: '12px' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e91e63" strokeWidth="2" style={{ marginRight: '12px' }}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                      伴侣出生年份
                    </label>
                    <Select value={partnerBirthYear || undefined} onChange={setPartnerBirthYear} placeholder="选择出生年份" style={{ width: '100%', height: '48px' }} size="large">
                      {years.map(year => <Select.Option key={year} value={year.toString()}>{year}年</Select.Option>)}
                    </Select>
                  </div>
                )}
                {needChildInfo && (
                  <div style={{ padding: '16px 20px', background: 'rgba(1, 188, 214, 0.05)', borderRadius: '2rem', border: '1px solid rgba(1, 188, 214, 0.4)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', fontSize: '16px', fontWeight: 600, color: '#1f2937' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2196f3" strokeWidth="2" style={{ marginRight: '12px' }}><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>
                        孩子出生年份
                      </label>
                      {children.length < 10 && (
                        <button onClick={addChild} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', fontSize: '13px', color: '#01BCD6', background: 'transparent', border: '1px solid rgba(1, 188, 214, 0.4)', borderRadius: '20px', cursor: 'pointer' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                          添加孩子
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                      {children.map((child, index) => (
                        <div key={child.id} style={{ position: 'relative' }}>
                          <Select value={child.birthYear || undefined} onChange={(value) => updateChildBirthYear(child.id, value)} placeholder="选择出生年份" style={{ width: '100%', height: '48px' }} size="large">
                            {childYears.map(year => <Select.Option key={year} value={year.toString()}>{year}年</Select.Option>)}
                          </Select>
                          {index > 0 && (
                            <button onClick={() => removeChild(child.id)} style={{ position: 'absolute', top: '-8px', right: '-8px', width: '24px', height: '24px', borderRadius: '50%', background: '#fff', border: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff4d4f' }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 操作按钮 */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                onClick={handleSaveFamilyInfo}
                disabled={saving || !maritalStatus}
                style={{
                  padding: '12px 48px',
                  fontSize: '16px',
                  fontWeight: 600,
                  color: '#fff',
                  background: (!maritalStatus || saving) ? '#ccc' : '#01BCD6',
                  border: 'none',
                  borderRadius: '24px',
                  cursor: (!maritalStatus || saving) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(1, 188, 214, 0.3)'
                }}
              >
                {saving ? '保存中...' : '完成录入'}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
              </button>
            </div>
          </div>
        )}

        {/* 家庭信息卡片（表单收起时显示） */}
        {!showFamilyForm && displayMembers.length > 0 && (
          <div style={{ 
            marginBottom: '24px',
            padding: '24px 32px',
            background: 'rgba(255, 255, 255, 0.5)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderRadius: '24px',
            border: '1px solid rgba(255, 255, 255, 0.8)',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06)',
            position: 'relative'
          }}>
            {/* 右上角：家庭成员信息修改按钮 */}
            <button
              onClick={() => setShowFamilyForm(true)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '24px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#01BCD6',
                background: 'transparent',
                border: '1px solid #01BCD6',
                borderRadius: '6px',
                cursor: 'pointer',
                zIndex: 10
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
              家庭成员信息修改
            </button>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '32px' }}>
              {/* 家庭图片 - 更大尺寸 */}
              <div 
                onClick={() => setFilteredMemberId(null)} 
                style={{ 
              display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  cursor: 'pointer',
                  padding: '8px',
                  borderRadius: '16px',
                  background: !filteredMemberId ? 'rgba(1, 188, 214, 0.08)' : 'transparent',
                  transition: 'all 0.3s'
                }}
              >
                <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: 500 }}>家庭</div>
                <div style={{ width: '180px', height: '112px', borderRadius: '12px', overflow: 'hidden', transition: 'all 0.3s' }}>
                  <img src={familyImage} alt="家庭" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).src = '/images/family-married-child.png' }} />
                </div>
                <div style={{ fontSize: '16px', fontWeight: 600, color: !filteredMemberId ? '#01BCD6' : '#333', marginTop: '8px' }}>{totalPolicies}份保单</div>
              </div>

              {/* 成员头像列表 */}
              {displayMembers.map((member, index) => {
                const isSelected = filteredMemberId === member.id
                // 直接使用 entity 作为显示名称（孩子已经存储为老大、老二等）
                const displayName = member.entity
                return (
                  <div
                    key={member.id} 
                    onClick={() => setFilteredMemberId(member.id)} 
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      cursor: 'pointer',
                      padding: '8px',
                      borderRadius: '16px',
                      background: isSelected ? 'rgba(1, 188, 214, 0.08)' : 'transparent',
                      transition: 'all 0.3s'
                    }}
                  >
                    <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: 500 }}>{displayName}</div>
                    <div style={{ width: '88px', height: '88px', borderRadius: '12px', overflow: 'hidden', transition: 'all 0.3s' }}>
                      <img src={getAvatarByGenderAndEntity(member.gender, member.entity)} alt={member.entity} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).src = '/images/self.png' }} />
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 600, color: isSelected ? '#01BCD6' : '#333', marginTop: '8px' }}>{getMemberPolicyCount(member.entity)}份</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

          {/* 保单卡片列表 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {displayPolicies.map(policy => {
              const endYear = policy.coverageEndYear || policy.policyInfo?.coverageEndYear
              const isActive = !endYear || endYear === '终身' || endYear === 'lifetime' || parseInt(String(endYear)) >= currentYear
              const isExpanded = String(expandedPolicyId) === String(policy.id)
              
              return (
              <div
                key={policy.id}
                id={`policy-card-${policy.id}`}
                style={{ 
                  position: 'relative', 
                  background: 'white', 
                  borderRadius: '12px', 
                  padding: '16px', 
                  border: '1px solid #f3f4f6', 
                  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', 
                  transition: 'all 0.3s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#01BCD6'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(1, 188, 214, 0.2)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e0e0e0'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)' }}
              >
                <div style={{ position: 'absolute', top: '-20px', left: '-20px', width: '55px', height: '55px', borderRadius: '50%', background: isActive ? 'rgba(22, 163, 74, 0.1)' : 'rgba(220, 38, 38, 0.1)', backdropFilter: 'blur(12px)', border: `0.5px solid ${isActive ? '#16a34a' : '#dc2626'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: isActive ? '#16a34a' : '#dc2626', fontSize: '15px', fontWeight: 800, boxShadow: '0 6px 16px rgba(0, 0, 0, 0.25)', zIndex: 10, transform: 'rotate(-15deg)' }}>
                  {isActive ? '有效' : '失效'}
                </div>
                <div style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid #01BCD6', marginTop: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{policy.productName}</h3>
                        <span style={{ background: '#f0f8fc', color: '#01BCD6', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>{POLICY_TYPE_MAP[policy.policyType] || policy.policyType}</span>
                      </div>
                      {policy.policyIdNumber && (
                        <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {policy.policyIdNumber}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0, marginLeft: '8px', marginTop: '2px' }}>
                      <span onClick={() => navigate(`/smart-input?editId=${policy.id}`)} style={{ cursor: 'pointer', padding: '4px' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#01BCD6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                      </span>
                      <span onClick={(e) => { e.stopPropagation(); handleDeletePolicy(Number(policy.id!)) }} style={{ cursor: 'pointer', padding: '4px' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '14px', color: '#666', lineHeight: '1.8' }}>
                  <div><strong>保险公司：</strong>{policy.insuranceCompany}</div>
                  <div><strong>被保险人：</strong>{policy.insuredPerson} ({policy.birthYear || policy.policyInfo?.birthYear}年出生)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                    <div><strong>投保开始：</strong>{policy.policyStartYear || policy.policyInfo?.policyStartYear}年</div>
                    <div><strong>保障结束：</strong>{(() => { const cey = policy.coverageEndYear ?? policy.policyInfo?.coverageEndYear; if (!cey || cey === 'lifetime') return '终身'; return `${cey}年` })()}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                    <div><strong>交费年限：</strong>{policy.paymentPeriod || policy.totalPaymentPeriod || '未填写'}年</div>
                    <div><strong>年交保费：</strong>¥{(policy.annualPremium || 0).toLocaleString()}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                    <div><strong>保障责任：</strong>{policy.coverages?.length || 0}项</div>
                    <div><strong>基本保额：</strong>{((policy.basicSumInsured || 0) / 10000).toFixed(0)}万元</div>
                  </div>
                </div>
                
                {/* 查看合同详情按钮 */}
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed #e5e7eb' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      const isExpanded = String(expandedPolicyId) === String(policy.id)
                      setExpandedPolicyId(isExpanded ? null : policy.id!)
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 16px',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: '#01BCD6',
                      background: String(expandedPolicyId) === String(policy.id) ? 'rgba(1, 188, 214, 0.1)' : 'transparent',
                      border: String(expandedPolicyId) === String(policy.id) ? '2px solid #01BCD6' : '1px solid rgba(1, 188, 214, 0.3)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (String(expandedPolicyId) !== String(policy.id)) {
                        e.currentTarget.style.background = 'rgba(1, 188, 214, 0.05)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (String(expandedPolicyId) !== String(policy.id)) {
                        e.currentTarget.style.background = 'transparent'
                      }
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <line x1="16" y1="13" x2="8" y2="13"></line>
                      <line x1="16" y1="17" x2="8" y2="17"></line>
                      <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                    {String(expandedPolicyId) === String(policy.id) ? '收起合同详情' : '查看合同详情'}
                    <svg 
                      width="14" 
                      height="14" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="2"
                      style={{
                        transform: String(expandedPolicyId) === String(policy.id) ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.3s'
                      }}
                    >
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>
                </div>
                
                {/* 详情展开区域 - 绝对定位浮层，智能判断左右展开方向 */}
                {expandedPolicyId !== null && String(expandedPolicyId) === String(policy.id) && (
                  <div 
                    ref={(el) => {
                      if (el) {
                        // 检测卡片位置，决定弹窗方向
                        const cardEl = document.getElementById(`policy-card-${policy.id}`)
                        if (cardEl) {
                          const rect = cardEl.getBoundingClientRect()
                          const distanceToRight = window.innerWidth - rect.right
                          
                          // 如果卡片距离右边小于400px，弹窗往左展开
                          if (distanceToRight < 400) {
                            el.style.left = 'auto'
                            el.style.right = '0'
                          } else {
                            el.style.left = '0'
                            el.style.right = 'auto'
                          }
                        }
                      }
                    }}
                    style={{
                      position: 'absolute',
                      top: '100%',
                      marginTop: '8px',
                      width: '750px',
                      maxWidth: '90vw',
                      borderRadius: '12px',
                      background: 'linear-gradient(135deg, #f0f9fc 0%, #e8f4f8 100%)',
                      border: '2px solid #01BCD6',
                      overflow: 'hidden',
                      boxShadow: '0 12px 40px rgba(1, 188, 214, 0.25)',
                      zIndex: 1000
                    }}
                  >
                    {/* 详情头部 */}
                    <div style={{
                      padding: '12px 24px',
                      background: 'linear-gradient(90deg, #01BCD6 0%, #00A3BD 100%)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px' }}>📋</span>
                        <span style={{ fontSize: '15px', fontWeight: 600, color: '#fff' }}>
                          {policy.productName} - {POLICY_TYPE_MAP[policy.policyType] || policy.policyType}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setExpandedPolicyId(null)
                        }}
                        style={{
                          padding: '4px 12px',
                          fontSize: '12px',
                          fontWeight: 500,
                          color: '#fff',
                          background: 'rgba(255, 255, 255, 0.2)',
                          border: '1px solid rgba(255, 255, 255, 0.4)',
                          borderRadius: '16px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        收起
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="18 15 12 9 6 15"></polyline>
                        </svg>
                      </button>
                    </div>
                    
                    {/* 详情内容 */}
                    <div style={{ padding: '20px' }}>
                      <PolicyDetailCard
                        mode="accordion"
                        policy={policy}
                        expanded={true}
                      />
                    </div>
                  </div>
                )}
              </div>
              )
            })}
          </div>

        {displayPolicies.length === 0 && !loading && !showFamilyForm && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#999' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
            <div style={{ fontSize: '16px' }}>{filteredMemberId ? '该成员暂无保单' : '暂无保单，点击左侧"保单智能录入"开始录入'}</div>
            </div>
          )}
      </div>
    </div>
  )
}

