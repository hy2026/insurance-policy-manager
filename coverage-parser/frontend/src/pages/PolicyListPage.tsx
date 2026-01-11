import { useState } from 'react'
import { Card, Typography, Table, Button, Space, Tag, Modal, Form, Input, InputNumber, Select, Popconfirm, Empty, Statistic, Row, Col, Divider, Alert, message } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, UserOutlined, FileTextOutlined, CloudOutlined } from '@ant-design/icons'
import { usePolicies } from '@/hooks/usePolicies'
import type { Policy, Coverage, PolicyInfo, PayoutTier, KeyAmount } from '@/types'
import dayjs from 'dayjs'

const { Title, Text } = Typography

export default function PolicyListPage() {
  // 使用后端数据库（保险库和训练数据）
  const { policies, loading, addPolicy, editPolicy, removePolicy } = usePolicies()
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null)
  const [viewingPolicy, setViewingPolicy] = useState<Policy | null>(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [viewModalVisible, setViewModalVisible] = useState(false)
  const [form] = Form.useForm()

  // 打开新增/编辑对话框
  const handleAdd = () => {
    setEditingPolicy(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (policy: Policy) => {
    setEditingPolicy(policy)
    form.setFieldsValue({
      ...policy,
      birthYear: policy.policyInfo.birthYear,
      policyStartYear: policy.policyInfo.policyStartYear,
      coverageEndYear: policy.policyInfo.coverageEndYear,
      basicSumInsured: policy.policyInfo.basicSumInsured / 10000,
      annualPremium: policy.policyInfo.annualPremium,
      totalPaymentPeriod: policy.policyInfo.totalPaymentPeriod,
    })
    setModalVisible(true)
  }

  // 查看保单详情
  const handleView = (policy: Policy) => {
    setViewingPolicy(policy)
    setViewModalVisible(true)
  }

  // 重新计算责任的keyAmounts（当保障结束年份改变时）
  const recalculateCoverages = (coverages: Coverage[], newPolicyInfo: PolicyInfo, oldPolicyInfo?: PolicyInfo): Coverage[] => {
    // 如果保障结束年份没有改变，不需要重新计算
    if (oldPolicyInfo && oldPolicyInfo.coverageEndYear === newPolicyInfo.coverageEndYear) {
      return coverages
    }

    // 计算新的保障结束年龄
    const newCoverageEndAge = newPolicyInfo.coverageEndYear === 'lifetime' 
      ? 150 // 终身假设到150岁
      : newPolicyInfo.coverageEndYear - newPolicyInfo.birthYear

    const policyStartAge = newPolicyInfo.policyStartYear - newPolicyInfo.birthYear
    const basicSumInsuredWan = newPolicyInfo.basicSumInsured / 10000

    return coverages.map((coverage) => {
      if (!coverage.result?.payoutAmount?.details?.tiers) {
        return coverage
      }

      const recalculatedTiers = coverage.result.payoutAmount.details.tiers.map((tier: PayoutTier) => {
        if (!tier.startAge || !tier.endAge || !tier.formula) {
          return tier
        }

        const currentStartAge = parseInt(tier.startAge.toString())
        let currentEndAge = parseInt(tier.endAge.toString())
        
        // 如果结束年龄超过新的保障结束年龄，则限制为新的保障结束年龄
        if (currentEndAge > newCoverageEndAge) {
          currentEndAge = newCoverageEndAge
        }

        // 如果开始年龄超过新的保障结束年龄，则跳过这个tier
        if (currentStartAge > newCoverageEndAge) {
          return tier
        }

        const formula = tier.formula || ''
        const formulaType = tier.formulaType || 'fixed'
        const interestRate = parseFloat(tier.interestRate?.toString() || '0') / 100

        const newKeyAmounts: KeyAmount[] = []

        for (let age = currentStartAge; age <= currentEndAge; age++) {
          const year = newPolicyInfo.birthYear + age
          const n = age - policyStartAge
          let amount = 0

          if (formulaType === 'compound') {
            amount = basicSumInsuredWan * Math.pow(1 + interestRate, n)
          } else if (formulaType === 'simple') {
            amount = basicSumInsuredWan * (1 + interestRate * n)
          } else if (formulaType === 'fixed') {
            const percentMatch = formula.match(/(\d+(?:\.\d+)?)%/)
            const ratioMatch = formula.match(/×\s*(\d+(?:\.\d+)?)(?!%)/)

            if (percentMatch) {
              amount = basicSumInsuredWan * (parseFloat(percentMatch[1]) / 100)
            } else if (ratioMatch) {
              amount = basicSumInsuredWan * parseFloat(ratioMatch[1])
            } else {
              amount = basicSumInsuredWan
            }
          } else {
            amount = basicSumInsuredWan
          }

          newKeyAmounts.push({
            year,
            age,
            amount: parseFloat(amount.toFixed(3))
          })
        }

        return {
          ...tier,
          endAge: currentEndAge,
          keyAmounts: newKeyAmounts
        }
      })

      return {
        ...coverage,
        result: {
          ...coverage.result,
          payoutAmount: {
            ...coverage.result.payoutAmount,
            details: {
              ...coverage.result.payoutAmount.details,
              tiers: recalculatedTiers
            }
          }
        }
      }
    })
  }

  // 保存保单
  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      
      const newPolicyInfo: PolicyInfo = {
        birthYear: values.birthYear,
        policyStartYear: values.policyStartYear,
        coverageEndYear: values.coverageEndYear || 'lifetime',
        basicSumInsured: values.basicSumInsured * 10000,
        annualPremium: values.annualPremium,
        totalPaymentPeriod: values.totalPaymentPeriod,
      }

      // 检查保障结束年份是否改变，如果改变则重新计算所有责任
      let finalCoverages = editingPolicy?.coverages || []
      if (editingPolicy && editingPolicy.coverages.length > 0) {
        const oldPolicyInfo = editingPolicy.policyInfo
        if (oldPolicyInfo.coverageEndYear !== newPolicyInfo.coverageEndYear) {
          message.loading({ content: '检测到保障结束年份已修改，正在重新计算所有责任...', key: 'recalc', duration: 0 })
          finalCoverages = recalculateCoverages(editingPolicy.coverages, newPolicyInfo, oldPolicyInfo)
          message.success({ content: '所有责任重新计算完成', key: 'recalc', duration: 2 })
        }
      }
      
      const policyData: Policy = {
        id: editingPolicy?.id || Date.now().toString(),
        insuranceCompany: values.insuranceCompany,
        productName: values.productName,
        insuredPerson: values.insuredPerson,
        policyInfo: newPolicyInfo,
        coverages: finalCoverages,
        createdAt: editingPolicy?.createdAt || new Date(),
        updatedAt: new Date(),
      }

      // 调用后端API
      if (editingPolicy) {
        await editPolicy(editingPolicy.id!, policyData)
      } else {
        await addPolicy(policyData)
      }

      setModalVisible(false)
      form.resetFields()
      message.success('保单保存成功')
    } catch (error) {
      console.error('保存失败:', error)
      message.error('保存失败，请重试')
    }
  }

  // 删除保单
  const handleDelete = async (id: string) => {
    await removePolicy(id)
  }

  // 统计数据
  const stats = {
    total: policies.length,
    totalCoverages: policies.reduce((sum, p) => sum + p.coverages.length, 0),
    totalPremium: policies.reduce((sum, p) => sum + (p.policyInfo.annualPremium || 0), 0),
    totalInsured: policies.reduce((sum, p) => sum + p.policyInfo.basicSumInsured, 0) / 10000,
  }

  // 表格列定义
  const columns = [
    {
      title: '被保险人',
      dataIndex: 'insuredPerson',
      key: 'insuredPerson',
      render: (text: string) => (
        <Space>
          <UserOutlined />
          <Text strong>{text}</Text>
        </Space>
      ),
    },
    {
      title: '保险公司',
      dataIndex: 'insuranceCompany',
      key: 'insuranceCompany',
    },
    {
      title: '产品名称',
      dataIndex: 'productName',
      key: 'productName',
    },
    {
      title: '基本保额',
      key: 'basicSumInsured',
      render: (record: Policy) => (
        <Text>{(record.policyInfo.basicSumInsured / 10000).toFixed(0)}万</Text>
      ),
    },
    {
      title: '年交保费',
      key: 'annualPremium',
      render: (record: Policy) => (
        <Text>{record.policyInfo.annualPremium ? `${record.policyInfo.annualPremium}元` : '-'}</Text>
      ),
    },
    {
      title: '责任数量',
      key: 'coverages',
      render: (record: Policy) => (
        <Tag color="blue">{record.coverages.length}项</Tag>
      ),
    },
    {
      title: '创建时间',
      key: 'createdAt',
      render: (record: Policy) => (
        <Text type="secondary">
          {record.createdAt ? dayjs(record.createdAt).format('YYYY-MM-DD') : '-'}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (record: Policy) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleView(record)}
          >
            查看
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除该保单吗？"
            onConfirm={() => handleDelete(record.id!)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <Title level={3} style={{ margin: 0, color: '#5FC8D4' }}>
                📋 保单管理
              </Title>
              <Text type="secondary">管理客户保单信息</Text>
            </div>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAdd}
              size="large"
            >
              新增保单
            </Button>
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* 数据存储提示 */}
        <Alert
          message={
            <Space>
              <CloudOutlined style={{ color: '#52c41a' }} />
              <span><strong>客户保单管理</strong> - 数据保存到 insurance_policies_parsed 表，关联userId</span>
            </Space>
          }
          type="info"
          description="这里是客户真实保单，用于保险分析。如需标注纯合同用于训练，请使用【责任解析】页面。"
          style={{ marginBottom: 16 }}
          showIcon
          closable
        />
        {/* 统计卡片 */}
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card>
              <Statistic
                title="保单总数"
                value={stats.total}
                suffix="份"
                valueStyle={{ color: '#5FC8D4' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="责任总数"
                value={stats.totalCoverages}
                suffix="项"
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="总保费"
                value={stats.totalPremium}
                suffix="元/年"
                precision={0}
                valueStyle={{ color: '#fa8c16' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="总保额"
                value={stats.totalInsured}
                suffix="万"
                precision={0}
                valueStyle={{ color: '#f5222d' }}
              />
            </Card>
          </Col>
        </Row>

        {/* 保单列表 */}
        <Card>
          {policies.length === 0 ? (
            <Empty
              description="暂无保单数据"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            >
              <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                新增第一份保单
              </Button>
            </Empty>
          ) : (
            <Table
              dataSource={policies}
              columns={columns}
              rowKey="id"
              pagination={{ pageSize: 10 }}
            />
          )}
        </Card>
      </div>

      {/* 新增/编辑对话框 */}
      <Modal
        title={editingPolicy ? '编辑保单' : '新增保单'}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        width={700}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="被保险人" name="insuredPerson" rules={[{ required: true }]}>
                <Input placeholder="请输入被保险人姓名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="保险公司" name="insuranceCompany" rules={[{ required: true }]}>
                <Input placeholder="请输入保险公司" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="产品名称" name="productName" rules={[{ required: true }]}>
            <Input placeholder="请输入产品名称" />
          </Form.Item>

          <Divider orientation="left">保单信息</Divider>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="出生年份" name="birthYear" rules={[{ required: true }]}>
                <InputNumber placeholder="1990" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="投保年份" name="policyStartYear" rules={[{ required: true }]}>
                <InputNumber placeholder="2024" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="保障至" name="coverageEndYear" rules={[{ required: true }]}>
                <Select placeholder="选择保障期限">
                  <Select.Option value="lifetime">终身</Select.Option>
                  {Array.from({ length: 31 }, (_, i) => {
                    const year = new Date().getFullYear() + i
                    return <Select.Option key={year} value={year}>{year}年</Select.Option>
                  })}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="基本保额(万)" name="basicSumInsured" rules={[{ required: true }]}>
                <InputNumber placeholder="50" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="年交保费(元)" name="annualPremium">
                <InputNumber placeholder="5000" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="缴费期(年)" name="totalPaymentPeriod">
                <Select placeholder="选择缴费期">
                  <Select.Option value="1">趸交</Select.Option>
                  <Select.Option value="5">5年</Select.Option>
                  <Select.Option value="10">10年</Select.Option>
                  <Select.Option value="15">15年</Select.Option>
                  <Select.Option value="20">20年</Select.Option>
                  <Select.Option value="30">30年</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* 查看详情对话框 */}
      <Modal
        title="保单详情"
        open={viewModalVisible}
        onCancel={() => setViewModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setViewModalVisible(false)}>
            关闭
          </Button>
        ]}
        width={800}
      >
        {viewingPolicy && (
          <div>
            <Card size="small" style={{ marginBottom: 16 }}>
              <Row gutter={16}>
                <Col span={12}>
                  <Text strong>被保险人：</Text>
                  <Text>{viewingPolicy.insuredPerson}</Text>
                </Col>
                <Col span={12}>
                  <Text strong>保险公司：</Text>
                  <Text>{viewingPolicy.insuranceCompany}</Text>
                </Col>
              </Row>
              <Row gutter={16} style={{ marginTop: 12 }}>
                <Col span={12}>
                  <Text strong>产品名称：</Text>
                  <Text>{viewingPolicy.productName}</Text>
                </Col>
                <Col span={12}>
                  <Text strong>基本保额：</Text>
                  <Text>{(viewingPolicy.policyInfo.basicSumInsured / 10000).toFixed(0)}万</Text>
                </Col>
              </Row>
            </Card>

            <Title level={5}>责任列表 ({viewingPolicy.coverages.length}项)</Title>
            {viewingPolicy.coverages.length > 0 ? (
              viewingPolicy.coverages.map((coverage: Coverage, index: number) => (
                <Card key={index} size="small" style={{ marginBottom: 12 }}>
                  <Space>
                    <FileTextOutlined />
                    <Text strong>{coverage.name}</Text>
                    <Tag color="blue">{coverage.type}</Tag>
                    <Text type="secondary">
                      置信度: {(coverage.result.overallConfidence * 100).toFixed(0)}%
                    </Text>
                  </Space>
                </Card>
              ))
            ) : (
              <Empty description="暂无责任数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
