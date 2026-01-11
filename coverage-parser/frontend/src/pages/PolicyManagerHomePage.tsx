import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal, message } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, DatabaseOutlined } from '@ant-design/icons'
import { getPolicies, removePolicy } from '@/services/api'
import type { Policy } from '@/types'

// 家庭成员图标配置
const FAMILY_MEMBERS = [
  { key: 'all', label: '家庭', icon: '/images/family.png', isImage: true, alwaysShow: true },
  { key: '本人', label: '本人', icon: '/images/self.png', isImage: true, alwaysShow: true },
  { key: '配偶', label: '配偶', icon: '/images/spouse.png', isImage: true, alwaysShow: false },
  { key: '子女1', label: '子女1', icon: '👶', isImage: false, alwaysShow: false },
  { key: '子女2', label: '子女2', icon: '👶', isImage: false, alwaysShow: false },
]

const POLICY_TYPE_MAP: Record<string, string> = {
  'critical_illness': '重疾险',
  'life': '人寿险',
  'accident': '意外险',
  'annuity': '年金险'
}

export default function PolicyManagerHomePage() {
  const navigate = useNavigate()
  const [policies, setPolicies] = useState<Policy[]>([])
  const [filteredMember, setFilteredMember] = useState<string | null>(null) // null表示选中"家庭"
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPolicies()
  }, [])

  const loadPolicies = async () => {
    try {
      setLoading(true)
      const data = await getPolicies(1) // TODO: userId
      setPolicies(data)
    } catch (error) {
      console.error('加载保单失败:', error)
      message.error('加载保单失败')
    } finally {
      setLoading(false)
    }
  }

  // 计算成员统计
  const getMemberStats = () => {
    const stats: Record<string, number> = {}
    let total = 0
    
    policies.forEach(policy => {
      total++
      const member = policy.insuredPerson || '未指定'
      stats[member] = (stats[member] || 0) + 1
    })
    
    return { stats, total }
  }

  // 获取显示的成员列表
  const getDisplayMembers = () => {
    const { stats } = getMemberStats()
    return FAMILY_MEMBERS.filter(member => 
      member.alwaysShow || stats[member.key]
    )
  }

  // 筛选保单
  const getFilteredPolicies = () => {
    if (!filteredMember) return policies
    return policies.filter(p => p.insuredPerson === filteredMember)
  }

  // 删除保单
  const handleDelete = async (id: number) => {
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
          loadPolicies()
        } catch (error) {
          message.error('删除失败')
        }
      }
    })
  }

  const { stats, total } = getMemberStats()
  const displayMembers = getDisplayMembers()
  const displayPolicies = getFilteredPolicies()

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', padding: '20px' }}>
      {/* HTML原版的container结构 */}
      <div style={{ 
        maxWidth: '1200px',
        margin: '0 auto',
        background: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
        overflow: 'hidden'
      }}>
        {/* 导航栏 */}
        <div style={{ 
          background: '#001529',
          padding: '0 30px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '64px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <h1 style={{ 
              fontSize: '20px',
              margin: 0,
              color: 'white',
              fontWeight: 500
            }}>
              保险解析助手
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              onClick={() => navigate('/coverage-library')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '4px',
                cursor: 'pointer',
                color: 'white',
                transition: 'background 0.3s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <DatabaseOutlined />
              <span>责任库</span>
            </div>
          </div>
        </div>

        {/* 页面标题 */}
        <div style={{ 
          background: 'white',
          color: '#333',
          padding: '30px 30px 20px 30px',
          textAlign: 'center',
          position: 'relative'
        }}>
          <h1 style={{ 
            fontSize: '28px',
            marginBottom: 0,
            color: '#333'
          }}>
            家庭保单管家
          </h1>
        </div>

        {/* 保单卡片容器 */}
        <div style={{ padding: '20px 30px 30px 30px' }}>
          {/* 家庭成员统计 */}
          <div style={{ marginBottom: '20px', padding: 0 }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center',
              gap: '8px',
              overflowX: 'auto',
              padding: '8px 0',
              background: 'transparent'
            }}>
              {displayMembers.map(member => {
                const count = member.key === 'all' ? total : (stats[member.key] || 0)
                const isSelected = member.key === 'all' ? !filteredMember : filteredMember === member.key
                
                return (
                  <div
                    key={member.key}
                    onClick={() => setFilteredMember(member.key === 'all' ? null : member.key)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      width: '120px',
                      padding: '0 3px',
                      border: 'none',
                      borderRadius: '0',
                      background: isSelected ? 'rgba(230, 247, 255, 1)' : 'transparent',
                      transition: 'all 0.3s',
                      cursor: 'pointer',
                      position: 'relative',
                      boxSizing: 'border-box',
                      boxShadow: isSelected ? '0 2px 8px rgba(1, 188, 214, 0.2)' : 'none'
                    }}
                    onMouseEnter={(e) => {
                      // 不显示边框，保持透明
                    }}
                    onMouseLeave={(e) => {
                      // 不显示边框，保持透明
                    }}
                  >
                    <div style={{ 
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '120px',
                      height: '120px',
                      flexShrink: 0
                    }}>
                      {member.isImage ? (
                        <img 
                          src={member.icon} 
                          alt={member.label}
                          style={{ 
                            width: '120px',
                            height: '120px',
                            objectFit: 'contain',
                            display: 'block',
                            imageRendering: 'auto'
                          }}
                          onError={(e) => console.error(`${member.label}图片加载失败`, e)}
                        />
                      ) : (
                        <div style={{ fontSize: '40px', lineHeight: '1' }}>{member.icon}</div>
                      )}
                      <div style={{
                        position: 'absolute',
                        top: '8px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        fontSize: '12px',
                        color: '#666',
                        textAlign: 'center',
                        lineHeight: '1',
                        whiteSpace: 'nowrap'
                      }}>
                        {member.label}
                      </div>
                      <div style={{
                        position: 'absolute',
                        bottom: '-2px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#333',
                        textAlign: 'center',
                        lineHeight: '1',
                        whiteSpace: 'nowrap'
                      }}>
                        {count}份
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 保单卡片列表 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '20px'
          }}>
            {/* 添加新合同卡片 */}
            <div
              onClick={() => navigate('/smart-input')}
              style={{
                background: 'white',
                borderRadius: '12px',
                padding: '40px 20px',
                border: '2px dashed #01BCD6',
                cursor: 'pointer',
                transition: 'all 0.3s',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '280px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#01BCD6'
                e.currentTarget.style.background = '#f0f8fc'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#01BCD6'
                e.currentTarget.style.background = 'white'
              }}
            >
              <PlusOutlined style={{ fontSize: '48px', color: '#01BCD6', marginBottom: '16px' }} />
              <div style={{ fontSize: '16px', fontWeight: 600, color: '#01BCD6' }}>
                添加新合同
              </div>
            </div>

            {/* 保单卡片 */}
            {displayPolicies.map(policy => (
              <div
                key={policy.id}
                style={{
                  background: 'white',
                  borderRadius: '12px',
                  padding: '20px',
                  border: '2px solid #e0e0e0',
                  transition: 'all 0.3s',
                  minHeight: '280px',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'default'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#01BCD6'
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(1, 188, 214, 0.2)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e0e0e0'
                  e.currentTarget.style.boxShadow = 'none'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                {/* 标题和类型标签 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#333', flex: 1 }}>
                    {policy.productName}
                  </h3>
                  <span style={{
                    background: '#f0f8fc',
                    color: '#01BCD6',
                    padding: '4px 12px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginLeft: '8px',
                    whiteSpace: 'nowrap'
                  }}>
                    {POLICY_TYPE_MAP[policy.policyType] || policy.policyType}
                  </span>
                </div>

                {/* 保单信息 */}
                <div style={{ flex: 1, fontSize: '14px', color: '#666', lineHeight: '1.8' }}>
                  <div><strong>保险公司：</strong>{policy.insuranceCompany}</div>
                  <div><strong>被保险人：</strong>{policy.insuredPerson} ({(policy.birthYear || policy.policyInfo?.birthYear) ? `${policy.birthYear || policy.policyInfo?.birthYear}年出生` : '出生年份未知'})</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                    <div><strong>投保开始：</strong>{
                      (() => {
                        const startYear = policy.policyStartYear || policy.policyInfo?.policyStartYear;
                        const birthYear = policy.birthYear || policy.policyInfo?.birthYear;
                        if (!startYear) return '未填写';
                        if (!birthYear) return `${startYear}年`;
                        const age = startYear - birthYear;
                        // 只显示合理的年龄（0-150岁之间）
                        if (age >= 0 && age <= 150) {
                          return `${startYear}年(${age}岁)`;
                        }
                        return `${startYear}年`;
                      })()
                    }</div>
                    <div><strong>保障结束：</strong>{
                      (() => {
                        const coverageEndYear = policy.coverageEndYear ?? policy.policyInfo?.coverageEndYear;
                        if (!coverageEndYear || coverageEndYear === 'lifetime') return '终身';
                        if (coverageEndYear === null || coverageEndYear === undefined) return '终身';
                        return `${coverageEndYear}年`;
                      })()
                    }</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                    <div><strong>交费年限：</strong>{
                      (() => {
                        const paymentPeriod = policy.totalPaymentPeriod ?? policy.paymentPeriod ?? policy.policyInfo?.totalPaymentPeriod;
                        if (!paymentPeriod || paymentPeriod === 'lifetime') return '终身';
                        if (paymentPeriod === null || paymentPeriod === undefined) return '未填写';
                        return `${paymentPeriod}年`;
                      })()
                    }</div>
                    <div><strong>年交保费：</strong>¥{(policy.annualPremium || policy.policyInfo?.annualPremium || 0).toLocaleString()}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                    <div><strong>已交年数：</strong>{
                      (() => {
                        const currentYear = new Date().getFullYear();
                        const startYear = policy.policyStartYear || policy.policyInfo?.policyStartYear || currentYear;
                        const paymentPeriod = policy.totalPaymentPeriod ?? policy.paymentPeriod ?? policy.policyInfo?.totalPaymentPeriod;
                        // 当年算作已交过，所以是 currentYear - startYear + 1
                        const paidYears = Math.max(0, currentYear - startYear + 1);
                        const maxYears = typeof paymentPeriod === 'number' ? paymentPeriod : 999;
                        return `${Math.min(paidYears, maxYears)}年`;
                      })()
                    }</div>
                    <div><strong>待交年数：</strong>{
                      (() => {
                        const paymentPeriod = policy.totalPaymentPeriod ?? policy.paymentPeriod ?? policy.policyInfo?.totalPaymentPeriod;
                        if (!paymentPeriod || paymentPeriod === 'lifetime') return '终身';
                        if (paymentPeriod === null || paymentPeriod === undefined) return '未填写';
                        const currentYear = new Date().getFullYear();
                        const startYear = policy.policyStartYear || policy.policyInfo?.policyStartYear || currentYear;
                        // 当年算作已交过，所以已交年数是 currentYear - startYear + 1
                        const paidYears = Math.max(0, currentYear - startYear + 1);
                        // 确保paymentPeriod转换为数字（处理字符串格式如"10年"）
                        let paymentPeriodNum: number;
                        if (typeof paymentPeriod === 'string') {
                          // 提取数字，如"10年" -> 10
                          const match = paymentPeriod.match(/\d+/);
                          paymentPeriodNum = match ? parseInt(match[0], 10) : NaN;
                        } else {
                          paymentPeriodNum = paymentPeriod;
                        }
                        if (isNaN(paymentPeriodNum) || paymentPeriodNum <= 0) return '未填写';
                        const remaining = Math.max(0, paymentPeriodNum - paidYears);
                        return `${remaining}年`;
                      })()
                    }</div>
                  </div>
                  <div><strong>基本保额：</strong>{((policy.basicSumInsured || policy.policyInfo?.basicSumInsured || 0) / 10000).toFixed(2)}万元</div>
                  <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #f0f0f0' }}>
                    <strong>保障责任：</strong>{policy.coverages?.length || 0}项
                  </div>
                </div>

                {/* 操作按钮 */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f0f0f0' }}>
                  <button
                    onClick={() => navigate(`/smart-input?editId=${policy.id}`)}
                    style={{
                      flex: 1,
                      padding: '8px 16px',
                      border: '1px solid #01BCD6',
                      background: 'white',
                      color: '#01BCD6',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 600,
                      transition: 'all 0.3s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#f0f8fc'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'white'
                    }}
                  >
                    <EditOutlined /> 编辑
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(policy.id!)
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 16px',
                      border: '1px solid #ff4d4f',
                      background: 'white',
                      color: '#ff4d4f',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 600,
                      transition: 'all 0.3s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#fff1f0'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'white'
                    }}
                  >
                    <DeleteOutlined /> 删除
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* 空状态 */}
          {displayPolicies.length === 0 && !loading && (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: '#999'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
              <div style={{ fontSize: '16px' }}>
                {filteredMember ? '该成员暂无保单' : '暂无保单，点击上方"添加新合同"开始录入'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
