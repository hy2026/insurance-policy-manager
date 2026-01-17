import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal, message } from 'antd'
import { getPolicies, removePolicy } from '@/services/api'
import type { Policy } from '@/types'

console.log('💎💎💎 版本 7.0 - 印章优化（上移+字小+强化毛玻璃+多重阴影）💎💎💎')

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
    <div style={{ minHeight: '100vh', padding: '24px' }}>
      {/* 顶部标题区域 - 参考zhichu1 */}
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
            我家的保单
          </h1>
          <p style={{
            fontSize: '14px',
            color: '#6b7280',
            margin: 0,
            fontWeight: 400
          }}>
            全方位保单管理，助力美好未来
          </p>
        </div>
        </div>

        {/* 保单卡片容器 */}
      <div style={{ 
        maxWidth: '1400px',
        margin: '0 auto'
      }}>
          {/* 家庭成员统计卡片 */}
          <div style={{ 
            marginBottom: '24px',
            background: 'rgba(255, 255, 255, 0.7)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderRadius: '16px',
            padding: '16px 24px',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.7)'
          }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'flex-end',
              gap: '48px',
              overflowX: 'auto'
            }}>
              {displayMembers.map(member => {
                const count = member.key === 'all' ? total : (stats[member.key] || 0)
                const isSelected = member.key === 'all' ? !filteredMember : filteredMember === member.key
                const isFamily = member.key === 'all'
                const imgSize = isFamily ? 120 : 90
                
                return (
                  <div
                    key={member.key}
                    onClick={() => setFilteredMember(member.key === 'all' ? null : member.key)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      width: `${imgSize}px`,
                      padding: '0',
                      border: 'none',
                      borderRadius: '0',
                      background: 'transparent',
                      transition: 'all 0.3s',
                      cursor: 'pointer',
                      position: 'relative'
                    }}
                  >
                    {/* 标签在图片上方 */}
                    <div style={{
                      fontSize: isFamily ? '14px' : '12px',
                      color: '#6b7280',
                      marginBottom: '8px',
                      textAlign: 'center'
                    }}>
                      {member.label}
                    </div>
                    
                    {/* 图片 */}
                    <div style={{ 
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: `${imgSize}px`,
                      height: `${imgSize}px`,
                      flexShrink: 0
                    }}>
                      {member.isImage ? (
                        <div style={{
                          width: `${imgSize}px`,
                          height: `${imgSize}px`,
                          borderRadius: isFamily ? '16px' : '12px',
                          overflow: 'hidden'
                        }}>
                        <img 
                          src={member.icon} 
                          alt={member.label}
                          style={{ 
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              display: 'block'
                          }}
                          onError={(e) => console.error(`${member.label}图片加载失败`, e)}
                        />
                        </div>
                      ) : (
                        <div style={{ 
                          fontSize: isFamily ? '50px' : '35px', 
                          lineHeight: '1',
                          width: `${imgSize}px`,
                          height: `${imgSize}px`,
                          borderRadius: isFamily ? '16px' : '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>{member.icon}</div>
                      )}
                      </div>
                    
                    {/* 数字在图片下方 */}
                      <div style={{
                      fontSize: isFamily ? '18px' : '16px',
                        fontWeight: 600,
                      color: isSelected ? '#01BCD6' : '#333',
                      marginTop: '8px',
                      textAlign: 'center'
                      }}>
                        {count}份
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
            {/* 保单卡片 */}
            {displayPolicies.map(policy => {
              const currentYear = new Date().getFullYear()
              const endYear = policy.coverageEndYear || policy.policyInfo?.coverageEndYear
              const isActive = !endYear || endYear === '终身' || parseInt(endYear) >= currentYear
              
              return (
              <div
                key={policy.id}
                style={{
                  position: 'relative',
                  background: 'white',
                  borderRadius: '12px',
                  padding: '16px',
                  border: '1px solid #f3f4f6',
                  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
                  transition: 'all 0.3s',
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
                {/* 左上角圆形印章 - 叠加盖章效果 */}
                <div style={{
                  position: 'absolute',
                  top: '-20px',
                  left: '-20px',
                  width: '55px',
                  height: '55px',
                  borderRadius: '50%',
                  background: isActive ? 'rgba(22, 163, 74, 0.1)' : 'rgba(220, 38, 38, 0.1)',
                  backdropFilter: 'blur(12px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(12px) saturate(180%)',
                  border: `0.5px solid ${isActive ? '#16a34a' : '#dc2626'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isActive ? '#16a34a' : '#dc2626',
                  fontSize: '15px',
                  fontWeight: 800,
                  boxShadow: '0 6px 16px rgba(0, 0, 0, 0.25), inset 0 2px 4px rgba(255, 255, 255, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.2)',
                  zIndex: 10,
                  transform: 'rotate(-15deg)',
                  letterSpacing: '1px'
                }}>
                  {isActive ? '有效' : '失效'}
                </div>

                {/* 标题栏：保险名称 + 类型标签 */}
                <div style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid #01BCD6', marginTop: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    {/* 左侧：保险名称 + 类型标签 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#333' }}>
                        {policy.productName}
                      </h3>
                      <span style={{
                        background: '#f0f8fc',
                        color: '#01BCD6',
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        lineHeight: '1.5',
                        display: 'inline-block'
                      }}>
                        {POLICY_TYPE_MAP[policy.policyType] || policy.policyType}
                      </span>
                    </div>
                    
                    {/* 右侧：编辑删除图标按钮，与标签底部对齐 */}
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <span
                        onClick={() => navigate(`/smart-input?editId=${policy.id}`)}
                        style={{
                          cursor: 'pointer',
                          fontSize: '18px',
                          color: '#01BCD6',
                          transition: 'all 0.3s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#00a8bd'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '#01BCD6'
                        }}
                      >
                        ✏️
                      </span>
                      <span
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(policy.id!)
                        }}
                        style={{
                          cursor: 'pointer',
                          fontSize: '18px',
                          color: '#ff4d4f',
                          transition: 'all 0.3s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#d43f3f'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '#ff4d4f'
                        }}
                      >
                        🗑️
                      </span>
                    </div>
                  </div>
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                    <div><strong>保障责任：</strong>{policy.coverages?.length || 0}项</div>
                  <div><strong>基本保额：</strong>{((policy.basicSumInsured || policy.policyInfo?.basicSumInsured || 0) / 10000).toFixed(2)}万元</div>
                  </div>
                </div>
              </div>
              )
            })}
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
                {filteredMember ? '该成员暂无保单' : '暂无保单，点击左侧"保单智能录入"开始录入'}
              </div>
            </div>
          )}
      </div>
    </div>
  )
}
