import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { message, Select } from 'antd'
import { getFamilyMembers, createFamilyMember, updateFamilyMember, deleteFamilyMember } from '@/services/api'
import type { FamilyMember } from '@/services/api'

console.log('💎💎💎 FamilyEditPage 版本 1.0 - 参照zhichu1样式 💎💎💎')

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

export default function FamilyEditPage() {
  const navigate = useNavigate()
  const currentYear = new Date().getFullYear()
  
  // 表单状态
  const [birthYear, setBirthYear] = useState<string>('2000')
  const [gender, setGender] = useState<string>('女')
  const [maritalStatus, setMaritalStatus] = useState<string>('')
  const [partnerBirthYear, setPartnerBirthYear] = useState<string>('')
  const [children, setChildren] = useState<{ id: string; birthYear: string }[]>([])
  
  // 加载状态
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [existingMembers, setExistingMembers] = useState<FamilyMember[]>([])

  // 年份选项
  const years = Array.from({ length: 70 }, (_, i) => currentYear - 18 - i)
  const childYears = Array.from({ length: 30 }, (_, i) => currentYear - i)

  // 计算需要显示的字段
  const needPartnerInfo = maritalStatus === 'married-no-child' || maritalStatus === 'married-with-child'
  const needChildInfo = maritalStatus === 'single-with-child' || maritalStatus === 'married-with-child'

  // 加载现有家庭成员数据
  useEffect(() => {
    loadFamilyData()
  }, [])

  const loadFamilyData = async () => {
    try {
      setLoading(true)
      const members = await getFamilyMembers(1)
      setExistingMembers(members)
      
      // 从现有成员中提取数据
      const selfMember = members.find(m => m.entity === '本人')
      const spouseMember = members.find(m => m.entity === '配偶')
      const childMembers = members.filter(m => m.entity === '孩子')
      
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
      
      // 根据现有成员推断婚育状态
      if (spouseMember && childMembers.length > 0) {
        setMaritalStatus('married-with-child')
      } else if (spouseMember) {
        setMaritalStatus('married-no-child')
      } else if (childMembers.length > 0) {
        setMaritalStatus('single-with-child')
      } else if (selfMember) {
        setMaritalStatus('single-no-child')
      }
    } catch (error) {
      console.error('加载家庭数据失败:', error)
    } finally {
      setLoading(false)
    }
  }

  // 当婚育状态变化时，处理相关逻辑
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

  // 添加孩子
  const addChild = () => {
    if (children.length < 10) {
      setChildren([...children, { id: Date.now().toString(), birthYear: '' }])
    }
  }

  // 删除孩子
  const removeChild = (childId: string) => {
    if (children.length > 1) {
      setChildren(children.filter(c => c.id !== childId))
    }
  }

  // 更新孩子出生年份
  const updateChildBirthYear = (childId: string, value: string) => {
    setChildren(children.map(c => c.id === childId ? { ...c, birthYear: value } : c))
  }

  // 保存家庭信息
  const handleSave = async () => {
    // 验证
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

    try {
      setSaving(true)
      const userId = 1

      // 获取现有成员
      const selfMember = existingMembers.find(m => m.entity === '本人')
      const spouseMember = existingMembers.find(m => m.entity === '配偶')
      const childMembers = existingMembers.filter(m => m.entity === '孩子')

      // 1. 处理本人信息
      if (selfMember) {
        await updateFamilyMember(selfMember.id, {
          entity: '本人',
          birthYear: parseInt(birthYear),
          gender
        })
      } else {
        await createFamilyMember({
          userId,
          entity: '本人',
          birthYear: parseInt(birthYear),
          gender
        })
      }

      // 2. 处理配偶信息
      if (needPartnerInfo) {
        const partnerGender = gender === '男' ? '女' : '男'
        if (spouseMember) {
          await updateFamilyMember(spouseMember.id, {
            entity: '配偶',
            birthYear: parseInt(partnerBirthYear),
            gender: partnerGender
          })
        } else {
          await createFamilyMember({
            userId,
            entity: '配偶',
            birthYear: parseInt(partnerBirthYear),
            gender: partnerGender
          })
        }
      } else if (spouseMember) {
        // 不需要配偶但存在配偶记录，删除
        await deleteFamilyMember(spouseMember.id)
      }

      // 3. 处理孩子信息
      // 先删除多余的孩子
      for (let i = children.length; i < childMembers.length; i++) {
        await deleteFamilyMember(childMembers[i].id)
      }

      // 更新或创建孩子
      if (needChildInfo) {
        for (let i = 0; i < children.length; i++) {
          const child = children[i]
          if (i < childMembers.length) {
            // 更新现有孩子
            await updateFamilyMember(childMembers[i].id, {
              entity: '孩子',
              birthYear: parseInt(child.birthYear),
              gender: '男' // 默认，可以后续扩展
            })
          } else {
            // 创建新孩子
            await createFamilyMember({
              userId,
              entity: '孩子',
              birthYear: parseInt(child.birthYear),
              gender: '男'
            })
          }
        }
      } else {
        // 不需要孩子，删除所有孩子
        for (const child of childMembers) {
          await deleteFamilyMember(child.id)
        }
      }

      message.success('家庭信息保存成功')
      navigate('/my-policies')
    } catch (error: any) {
      console.error('保存失败:', error)
      message.error(error.response?.data?.error || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const maritalStatusOptions = getMaritalStatusOptions(gender)

  if (loading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#f0f8fc'
      }}>
        <div style={{ fontSize: '16px', color: '#666' }}>加载中...</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f8fc', padding: '24px' }}>
      {/* 背景装饰 */}
      <div style={{ position: 'fixed', inset: 0, opacity: 0.3, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{
          position: 'absolute', top: '40px', left: '40px',
          width: '160px', height: '160px', borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(1, 188, 214, 0.2), transparent)'
        }} />
        <div style={{
          position: 'absolute', top: '160px', right: '32px',
          width: '128px', height: '128px', borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(1, 188, 214, 0.2), transparent)'
        }} />
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        {/* 标题 */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1f2937', margin: 0 }}>
            家庭成员信息登记
          </h1>
          <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '8px' }}>
            请填写您和家庭成员的基本信息，以便更好地管理家庭保单
          </p>
        </div>

        {/* 主表单区域 - 参照zhichu1样式 */}
        <div style={{
          background: '#fff',
          borderRadius: '2.5rem',
          padding: '32px 40px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
          border: '1px solid #e5e7eb'
        }}>
          {/* 第一行：出生年份 + 性别 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginBottom: '24px' }}>
            {/* 出生年份 */}
            <div>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                fontSize: '20px',
                fontWeight: 600,
                color: '#1f2937',
                marginBottom: '12px'
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#01BCD6" strokeWidth="2" style={{ marginRight: '12px' }}>
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                出生年份
              </label>
              <Select
                value={birthYear}
                onChange={setBirthYear}
                style={{ width: '100%', height: '51px' }}
                size="large"
              >
                {years.map(year => (
                  <Select.Option key={year} value={year.toString()}>{year}年</Select.Option>
                ))}
              </Select>
            </div>

            {/* 性别 */}
            <div>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                fontSize: '20px',
                fontWeight: 600,
                color: '#1f2937',
                marginBottom: '12px'
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#01BCD6" strokeWidth="2" style={{ marginRight: '12px' }}>
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                性别
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '32px', height: '51px' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="gender"
                    value="男"
                    checked={gender === '男'}
                    onChange={(e) => setGender(e.target.value)}
                    style={{ 
                      width: '20px', 
                      height: '20px', 
                      marginRight: '8px',
                      accentColor: '#01BCD6'
                    }}
                  />
                  <span style={{ fontSize: '18px', fontWeight: 500 }}>男</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="gender"
                    value="女"
                    checked={gender === '女'}
                    onChange={(e) => setGender(e.target.value)}
                    style={{ 
                      width: '20px', 
                      height: '20px', 
                      marginRight: '8px',
                      accentColor: '#01BCD6'
                    }}
                  />
                  <span style={{ fontSize: '18px', fontWeight: 500 }}>女</span>
                </label>
              </div>
            </div>
          </div>

          {/* 当前状态 - 四宫格图片选择 */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              fontSize: '20px',
              fontWeight: 600,
              color: '#1f2937',
              marginBottom: '12px'
            }}>
              当前状态
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
              {maritalStatusOptions.map(option => (
                <div
                  key={option.value}
                  onClick={() => setMaritalStatus(option.value)}
                  style={{
                    cursor: 'pointer',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    border: maritalStatus === option.value 
                      ? '2px solid #01BCD6' 
                      : '1px solid rgba(1, 188, 214, 0.3)',
                    background: maritalStatus === option.value 
                      ? 'linear-gradient(135deg, rgba(1, 188, 214, 0.1), rgba(1, 188, 214, 0.05))' 
                      : '#fafafa',
                    transition: 'all 0.3s',
                    transform: maritalStatus === option.value ? 'scale(1.02)' : 'scale(1)',
                    boxShadow: maritalStatus === option.value 
                      ? '0 4px 12px rgba(1, 188, 214, 0.2)' 
                      : '0 2px 4px rgba(0,0,0,0.05)',
                    position: 'relative'
                  }}
                >
                  {/* 选中勾 */}
                  {maritalStatus === option.value && (
                    <div style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: '#01BCD6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 10
                    }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </div>
                  )}
                  <div style={{ aspectRatio: '4/2.5', overflow: 'hidden' }}>
                    <img
                      src={option.image}
                      alt={option.label}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                  <div style={{
                    padding: '8px',
                    borderTop: '1px solid rgba(1, 188, 214, 0.3)',
                    textAlign: 'center'
                  }}>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>
                      {option.label}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              marginTop: '12px',
              color: '#6b7280',
              fontSize: '13px'
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
              养娃指孩子未结束教育阶段，需支持至教育结束
            </div>
          </div>

          {/* 伴侣和孩子信息 */}
          {(needPartnerInfo || needChildInfo) && (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: needPartnerInfo && needChildInfo ? '1fr 1fr' : '1fr', 
              gap: '24px',
              marginBottom: '24px'
            }}>
              {/* 伴侣出生年份 */}
              {needPartnerInfo && (
                <div style={{
                  padding: '16px 20px',
                  background: 'rgba(1, 188, 214, 0.05)',
                  borderRadius: '2rem',
                  border: '1px solid rgba(1, 188, 214, 0.4)'
                }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: '#1f2937',
                    marginBottom: '12px'
                  }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e91e63" strokeWidth="2" style={{ marginRight: '12px' }}>
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                    伴侣出生年份
                  </label>
                  <Select
                    value={partnerBirthYear}
                    onChange={setPartnerBirthYear}
                    placeholder="选择出生年份"
                    style={{ width: '100%', height: '48px' }}
                    size="large"
                  >
                    {years.map(year => (
                      <Select.Option key={year} value={year.toString()}>{year}年</Select.Option>
                    ))}
                  </Select>
                </div>
              )}

              {/* 孩子出生年份 */}
              {needChildInfo && (
                <div style={{
                  padding: '16px 20px',
                  background: 'rgba(1, 188, 214, 0.05)',
                  borderRadius: '2rem',
                  border: '1px solid rgba(1, 188, 214, 0.4)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      fontSize: '16px',
                      fontWeight: 600,
                      color: '#1f2937'
                    }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2196f3" strokeWidth="2" style={{ marginRight: '12px' }}>
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                        <line x1="9" y1="9" x2="9.01" y2="9"></line>
                        <line x1="15" y1="9" x2="15.01" y2="9"></line>
                      </svg>
                      孩子出生年份
                    </label>
                    {children.length < 10 && (
                      <button
                        onClick={addChild}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '6px 12px',
                          fontSize: '13px',
                          color: '#01BCD6',
                          background: 'transparent',
                          border: '1px solid rgba(1, 188, 214, 0.4)',
                          borderRadius: '20px',
                          cursor: 'pointer'
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="12" y1="5" x2="12" y2="19"></line>
                          <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        添加孩子
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                    {children.map((child, index) => (
                      <div key={child.id} style={{ position: 'relative' }}>
                        <Select
                          value={child.birthYear || undefined}
                          onChange={(value) => updateChildBirthYear(child.id, value)}
                          placeholder="选择出生年份"
                          style={{ width: '100%', height: '48px' }}
                          size="large"
                        >
                          {childYears.map(year => (
                            <Select.Option key={year} value={year.toString()}>{year}年</Select.Option>
                          ))}
                        </Select>
                        {index > 0 && (
                          <button
                            onClick={() => removeChild(child.id)}
                            style={{
                              position: 'absolute',
                              top: '-8px',
                              right: '-8px',
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              background: '#fff',
                              border: 'none',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#ff4d4f'
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '32px' }}>
            <button
              onClick={() => navigate('/my-policies')}
              style={{
                padding: '12px 32px',
                fontSize: '16px',
                fontWeight: 600,
                color: '#666',
                background: '#f5f5f5',
                border: 'none',
                borderRadius: '24px',
                cursor: 'pointer'
              }}
            >
              取消
            </button>
            <button
              onClick={handleSave}
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
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}



