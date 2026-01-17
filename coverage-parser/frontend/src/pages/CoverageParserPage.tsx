import { useState } from 'react'
import { Card, Form, Input, Select, Button, message, Spin, Divider, Space, Tag, Typography, Radio, Collapse, Modal, Row, Col } from 'antd'
import { ThunderboltOutlined, SaveOutlined, ClearOutlined } from '@ant-design/icons'
import { parseCoverage, saveCoveragesToLibrary } from '@/services/api'
import type { ParseResult, PolicyInfo, Coverage } from '@/types'
import ParseResultDisplay from '@/components/ParseResultDisplay'
import PolicyInfoForm from '@/components/PolicyInfoForm'
import CoverageList from '@/components/CoverageList'

const { TextArea } = Input
const { Title, Text } = Typography
const { Panel } = Collapse

export default function CoverageParserPage() {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [policyInfo, setPolicyInfo] = useState<PolicyInfo | null>(null)
  const [coverages, setCoverages] = useState<Coverage[]>([])
  const [editingIndex, setEditingIndex] = useState<number>(-1)
  const [editModalVisible, setEditModalVisible] = useState(false)

  // 解析条款
  const handleParse = async () => {
    try {
      const values = await form.validateFields()
      
      const { clauseText, coverageType, policyType, ...policyInfoFields } = values

      // 构建保单信息
      const policyInfo: PolicyInfo | undefined = policyInfoFields.birthYear ? {
        birthYear: policyInfoFields.birthYear,
        policyStartYear: policyInfoFields.policyStartYear,
        coverageEndYear: policyInfoFields.coverageEndYear || 'lifetime',
        basicSumInsured: policyInfoFields.basicSumInsured * 10000, // 转换为元
        annualPremium: policyInfoFields.annualPremium,
        totalPaymentPeriod: policyInfoFields.totalPaymentPeriod,
      } : undefined

      setLoading(true)
      message.loading({ content: '正在解析...', key: 'parse', duration: 0 })

      const result = await parseCoverage(clauseText, coverageType, policyInfo)
      
      // 检查是否不适用或保障期限已结束
      if (result.status === 'not_applicable') {
        message.warning({ 
          content: `此责任不适用：${result.reason || '条件不满足'}`, 
          key: 'parse',
          duration: 5
        })
      } else if (policyInfo && policyInfo.coverageEndYear !== 'lifetime') {
        const currentYear = new Date().getFullYear()
        if (currentYear > policyInfo.coverageEndYear) {
          message.warning({
            content: `⚠️ 合同已失效：保障期限已于${policyInfo.coverageEndYear}年结束（当前年份：${currentYear}年）`,
            key: 'parse',
            duration: 5
          })
        } else {
          message.success({ content: '解析成功！', key: 'parse' })
        }
      } else {
        message.success({ content: '解析成功！', key: 'parse' })
      }
      
      setParseResult(result)
      setPolicyInfo(policyInfo || null)
      
    } catch (error: any) {
      console.error('解析失败:', error)
      message.error({ content: error.message || '解析失败', key: 'parse' })
    } finally {
      setLoading(false)
    }
  }

  // 保存责任
  const handleSave = () => {
    if (!parseResult) {
      message.warning('请先解析条款')
      return
    }

    const values = form.getFieldsValue()
    
    const coverage: Coverage = {
      id: Date.now().toString(),
      name: values.coverageName || '未命名责任',
      type: values.coverageType,
      clause: values.clauseText,
      result: parseResult,
      policyType: values.policyType,
      createdAt: new Date(),
    }

    if (editingIndex >= 0) {
      // 更新现有责任
      const updated = [...coverages]
      updated[editingIndex] = coverage
      setCoverages(updated)
      message.success('责任已更新')
      setEditingIndex(-1)
    } else {
      // 新增责任前检查责任名称是否重复
      const duplicateIndex = coverages.findIndex(existing => 
        existing.name.trim() === coverage.name.trim()
      )
      
      if (duplicateIndex >= 0) {
        // 使用 Modal.confirm 询问用户是否要保存
        Modal.confirm({
          title: '责任名称重复',
          content: `已存在名称为"${coverage.name}"的责任，是否仍要保存？`,
          okText: '保存',
          cancelText: '取消',
          onOk: () => {
            setCoverages([...coverages, coverage])
            message.success('责任已保存')
            // 清空表单准备下一条
            handleClear()
          }
        })
        return
      }
      
      // 新增责任
      setCoverages([...coverages, coverage])
      message.success('责任已保存')
    }
    
    // 清空表单准备下一条
    handleClear()
  }

  // 编辑责任
  const handleEditCoverage = (coverage: Coverage, index: number) => {
    setEditingIndex(index)
    form.setFieldsValue({
      policyType: coverage.policyType,
      coverageType: coverage.type,
      coverageName: coverage.name,
      clauseText: coverage.clause,
    })
    setParseResult(coverage.result)
    setPolicyInfo(null)
    message.info('已加载责任数据，可以修改后重新保存')
  }

  // 删除责任
  const handleDeleteCoverage = (index: number) => {
    const updated = coverages.filter((_, i) => i !== index)
    setCoverages(updated)
    message.success('责任已删除')
    
    // 如果删除的是正在编辑的
    if (index === editingIndex) {
      setEditingIndex(-1)
      handleClear()
    }
  }

  // 保存到责任库（用于训练）
  const handleSaveToLibrary = async () => {
    if (coverages.length === 0) {
      message.warning('请先添加至少一项责任')
      return
    }

    try {
      const values = form.getFieldsValue()
      const { insuranceCompany, productName, policyType } = values

      if (!insuranceCompany || !productName) {
        message.error('请填写保险公司和产品名称')
        return
      }

      const hide = message.loading('正在保存到责任库...', 0)
      
      const result = await saveCoveragesToLibrary({
        insuranceCompany,
        productName,
        policyType: policyType || 'critical_illness',
        coverages
      })

      hide()
      message.success(`✅ 已保存${result.count}条责任到库，可用于训练`)
      
      // 清空当前责任列表
      setCoverages([])
    } catch (error: any) {
      console.error('保存到库失败:', error)
      message.error('保存失败：' + error.message)
    }
  }

  // 完成并导出
  const handleComplete = () => {
    if (coverages.length === 0) {
      message.warning('请先添加至少一项责任')
      return
    }
    
    setEditModalVisible(true)
  }

  // 清空表单
  const handleClear = () => {
    form.resetFields(['clauseText', 'coverageName'])
    setParseResult(null)
    setEditingIndex(-1)
  }

  // 清空所有责任
  const handleClearAll = () => {
    Modal.confirm({
      title: '确定清空所有责任吗？',
      content: '此操作不可恢复',
      okText: '确定',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        setCoverages([])
        message.success('已清空所有责任')
      },
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <Title level={3} style={{ margin: 0, color: '#5FC8D4' }}>
            💰 保险责任智能解析助手
          </Title>
          <Text type="secondary">输入保险条款，AI智能解析保障内容</Text>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* 左侧：输入区 */}
          <div>
            <Card title="📝 条款输入" bordered={false}>
              <Form
                form={form}
                layout="vertical"
                initialValues={{
                  policyType: 'critical_illness',
                  coverageType: 'disease',
                  coverageEndYear: 'lifetime',
                }}
              >
              {/* 保险公司和产品名称 */}
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="保险公司" name="insuranceCompany">
                    <Input placeholder="如：中国人寿" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="产品名称" name="productName">
                    <Input placeholder="如：国寿福（优享版）" />
                  </Form.Item>
                </Col>
              </Row>

              {/* 保单类型 */}
              <Form.Item label="保单类型" name="policyType" rules={[{ required: true }]}>
                <Select>
                  <Select.Option value="critical_illness">重疾险</Select.Option>
                  <Select.Option value="life">人寿险</Select.Option>
                  <Select.Option value="accident">意外险</Select.Option>
                  <Select.Option value="annuity">年金险</Select.Option>
                </Select>
              </Form.Item>

                {/* 责任类型 */}
                <Form.Item label="责任类型" name="coverageType" rules={[{ required: true }]}>
                  <Radio.Group>
                    <Radio.Button value="disease">疾病责任</Radio.Button>
                    <Radio.Button value="death">身故责任</Radio.Button>
                    <Radio.Button value="accident">意外责任</Radio.Button>
                    <Radio.Button value="annuity">年金责任</Radio.Button>
                  </Radio.Group>
                </Form.Item>

                {/* 责任名称 */}
                <Form.Item label="责任名称" name="coverageName">
                  <Input placeholder="例如：重大疾病保险金" />
                </Form.Item>

                {/* 条款文本 */}
                <Form.Item
                  label="条款文本"
                  name="clauseText"
                  rules={[{ required: true, message: '请输入条款文本' }]}
                >
                  <TextArea
                    rows={8}
                    placeholder="粘贴保险条款..."
                    style={{ fontFamily: 'monospace' }}
                  />
                </Form.Item>

                {/* 保单信息（折叠） */}
                <Collapse ghost>
                  <Panel header="📋 保单信息（可选，用于计算金额）" key="policyInfo">
                    <PolicyInfoForm />
                  </Panel>
                </Collapse>

                <Divider />

                {/* 操作按钮 */}
                <Space wrap>
                  <Button
                    type="primary"
                    icon={<ThunderboltOutlined />}
                    onClick={handleParse}
                    loading={loading}
                    size="large"
                  >
                    解析条款
                  </Button>
                  <Button
                    icon={<SaveOutlined />}
                    onClick={handleSave}
                    disabled={!parseResult}
                    type={editingIndex >= 0 ? 'primary' : 'default'}
                  >
                    {editingIndex >= 0 ? '更新责任' : '保存责任'}
                  </Button>
                  <Button
                    icon={<ClearOutlined />}
                    onClick={handleClear}
                  >
                    清空
                  </Button>
                  {coverages.length > 0 && (
                    <>
                      <Button
                        type="primary"
                        onClick={handleSaveToLibrary}
                        style={{ background: '#52c41a', borderColor: '#52c41a' }}
                      >
                        💾 保存到库 ({coverages.length})
                      </Button>
                      <Button
                        onClick={handleComplete}
                      >
                        导出数据
                      </Button>
                    </>
                  )}
                </Space>
              </Form>
            </Card>

            {/* 已保存责任列表 */}
            {coverages.length > 0 && (
              <Card 
                title={
                  <Space>
                    <span>📦 已保存责任</span>
                    <Tag color="blue">{coverages.length}项</Tag>
                  </Space>
                }
                extra={
                  <Button size="small" danger onClick={handleClearAll}>
                    清空全部
                  </Button>
                }
                style={{ marginTop: 16 }} 
                bordered={false}
              >
                <CoverageList
                  coverages={coverages}
                  onEdit={handleEditCoverage}
                  onDelete={handleDeleteCoverage}
                />
              </Card>
            )}
          </div>

          {/* 右侧：结果区 */}
          <div>
            <Card title="✨ 解析结果" bordered={false}>
              {loading ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                  <Spin size="large" />
                  <div style={{ marginTop: 16, color: '#999' }}>
                    AI正在分析条款...
                  </div>
                </div>
              ) : parseResult ? (
                <ParseResultDisplay result={parseResult} policyInfo={policyInfo} />
              ) : (
                <div style={{ textAlign: 'center', padding: '60px 0', color: '#999' }}>
                  解析结果将显示在这里<br /><br />
                  <small>点击左侧"解析条款"按钮开始</small>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>

      {/* 完成解析对话框 */}
      <Modal
        title="解析完成"
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setEditModalVisible(false)}>
            关闭
          </Button>,
          <Button
            key="export"
            type="primary"
            onClick={() => {
              const json = JSON.stringify(coverages, null, 2)
              const blob = new Blob([json], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `coverages_${Date.now()}.json`
              a.click()
              message.success('已导出JSON文件')
            }}
          >
            导出JSON
          </Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>已完成 <Text strong>{coverages.length}</Text> 项责任的解析</Text>
          <Divider />
          <Text type="secondary">建议操作：</Text>
          <ul>
            <li><Text strong>💾 保存到库</Text>：数据进入PostgreSQL数据库，用于LLM训练</li>
            <li><Text>导出JSON</Text>：本地备份</li>
            <li>前往"保单管理"页面创建完整保单</li>
          </ul>
        </Space>
      </Modal>
    </div>
  )
}

