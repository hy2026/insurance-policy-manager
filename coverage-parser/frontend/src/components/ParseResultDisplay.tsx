import { Descriptions, Tag, Typography, Table, Space, Badge } from 'antd'
import type { ParseResult, PolicyInfo, PayoutTier } from '@/types'

const { Text } = Typography

interface Props {
  result: ParseResult
  policyInfo: PolicyInfo | null
}

export default function ParseResultDisplay({ result, policyInfo }: Props) {
  // 检查保障期限是否已结束
  if (policyInfo && policyInfo.coverageEndYear !== 'lifetime') {
    const currentYear = new Date().getFullYear()
    if (currentYear > policyInfo.coverageEndYear) {
      return (
        <div style={{
          padding: 24,
          background: '#fff1f0',
          border: '2px solid #ff4d4f',
          borderRadius: 8,
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⛔</div>
          <Text strong style={{ fontSize: 18, color: '#cf1322', display: 'block', marginBottom: 8 }}>
            合同已失效
          </Text>
          <Text style={{ fontSize: 14, color: '#cf1322' }}>
            保障期限已于{policyInfo.coverageEndYear}年结束（当前年份：{currentYear}年）
          </Text>
        </div>
      )
    }
  }

  // 检查是否不适用
  if (result.status === 'not_applicable') {
    return (
      <div style={{
        padding: 24,
        background: '#fff3cd',
        border: '2px solid #ffc107',
        borderRadius: 8,
        textAlign: 'center'
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <Text strong style={{ fontSize: 18, color: '#856404', display: 'block', marginBottom: 8 }}>
          此责任不适用
        </Text>
        <Text style={{ fontSize: 14, color: '#856404' }}>
          {result.reason || result.naturalLanguageDescription || '条件不满足'}
        </Text>
      </div>
    )
  }

  // 置信度颜色
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'success'
    if (confidence >= 0.5) return 'warning'
    return 'error'
  }

  // 格式化置信度
  const formatConfidence = (confidence: number) => {
    return `${(confidence * 100).toFixed(0)}%`
  }

  // 渲染赔付金额
  const renderPayoutAmount = () => {
    const data = result.payoutAmount
    
    // 如果没有数据，显示未识别提示
    if (!data) {
      return (
        <div style={{ padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
          <Text type="secondary">原文未识别到赔付金额信息</Text>
        </div>
      )
    }

    // 分阶段显示
    if (data.details?.tiers && data.details.tiers.length > 0) {
      return (
        <div>
          {data.details.tiers.map((tier: PayoutTier, index: number) => (
            <div key={index} style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
              <Text strong>阶段{index + 1}: </Text>
              <Text>{tier.period}</Text>
              <br />
              
              {/* 公式类型 */}
              {tier.formula && (
                <>
                  <Text type="secondary">公式: </Text>
                  <Text code>{tier.formula}</Text>
                  <br />
                </>
              )}

              {/* 关键节点 */}
              {tier.keyAmounts && tier.keyAmounts.length > 0 && (
                <Table
                  size="small"
                  dataSource={tier.keyAmounts.slice(0, 5)}
                  rowKey={(record) => `${record.year}-${record.age}`}
                  pagination={false}
                  style={{ marginTop: 8 }}
                  columns={[
                    {
                      title: '年份',
                      dataIndex: 'year',
                      width: 80,
                    },
                    {
                      title: '年龄',
                      dataIndex: 'age',
                      width: 80,
                      render: (age) => `${age}岁`,
                    },
                    {
                      title: '金额',
                      dataIndex: 'amount',
                      render: (amount) => (
                        <Text strong style={{ color: '#01BCD6', fontSize: '16px', fontWeight: 700 }}>
                          {amount}万元
                        </Text>
                      ),
                    },
                  ]}
                />
              )}

              {/* 固定金额 */}
              {tier.amount && (
                <>
                  <Text strong style={{ fontSize: 18, color: '#01BCD6', fontWeight: 700 }}>
                    {tier.amount}万元
                  </Text>
                  <br />
                  <Text type="secondary">
                    {tier.startAge}岁～{tier.endAge}岁
                  </Text>
                </>
              )}
            </div>
          ))}
        </div>
      )
    }

    return <Text>{data.type}</Text>
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* 总体置信度 */}
      {result.overallConfidence !== undefined && (
      <div>
        <Badge
          status={getConfidenceColor(result.overallConfidence) as any}
          text={
            <Text strong>
              总体置信度: {formatConfidence(result.overallConfidence)}
            </Text>
          }
        />
        <Tag color="blue" style={{ marginLeft: 12 }}>
          {result.parseMethod === 'llm' ? 'AI解析' : '规则解析'}
        </Tag>
      </div>
      )}

      {/* 详细信息 */}
      <Descriptions column={1} bordered size="small">
        {/* 赔付金额 */}
        {result.payoutAmount && (
        <Descriptions.Item
          label={
            <Space>
              <span>💰 赔付金额</span>
              {result.payoutAmount?.confidence && (
                <Tag color={getConfidenceColor(result.payoutAmount.confidence)}>
                  {formatConfidence(result.payoutAmount.confidence)}
                </Tag>
              )}
            </Space>
          }
        >
          {renderPayoutAmount()}
        </Descriptions.Item>
        )}

        {/* 赔付次数 */}
        {result.payoutCount && (
        <Descriptions.Item
          label={
            <Space>
              <span>🔢 赔付次数</span>
              {result.payoutCount?.confidence && (
                <Tag color={getConfidenceColor(result.payoutCount.confidence)}>
                  {formatConfidence(result.payoutCount.confidence)}
                </Tag>
              )}
            </Space>
          }
        >
          <div>
            {result.payoutCount?.maxCount ? (
              <Text>最多{result.payoutCount.maxCount}次</Text>
            ) : result.payoutCount?.type === 'single' ? (
              <Text>单次赔付（合同终止）</Text>
            ) : (
              <Text type="secondary">不限次数</Text>
            )}
            
            {/* 原文片段 - 始终显示 */}
            <div style={{ marginTop: 8, padding: 8, background: '#f5f5f5', borderRadius: 4, borderLeft: '3px solid #d9d9d9' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>📄 原文片段：</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>
                {result.payoutCount?.extractedText || '原文未识别到相关内容'}
              </Text>
            </div>
          </div>
        </Descriptions.Item>
        )}

        {/* 间隔期 */}
        {result.intervalPeriod && (
        <Descriptions.Item
          label={
            <Space>
              <span>⏱️ 间隔期</span>
              {result.intervalPeriod?.confidence && (
                <Tag color={getConfidenceColor(result.intervalPeriod.confidence)}>
                  {formatConfidence(result.intervalPeriod.confidence)}
                </Tag>
              )}
            </Space>
          }
        >
          <div>
            {result.intervalPeriod?.hasInterval ? (
              <Text>{result.intervalPeriod.days}天</Text>
            ) : (
              <Text type="secondary">无间隔期</Text>
            )}
            
            {/* 原文片段 - 始终显示 */}
            <div style={{ marginTop: 8, padding: 8, background: '#f5f5f5', borderRadius: 4, borderLeft: '3px solid #d9d9d9' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>📄 原文片段：</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>
                {result.intervalPeriod?.extractedText || '原文未识别到相关内容'}
              </Text>
            </div>
          </div>
        </Descriptions.Item>
        )}

        {/* 分组 */}
        {result.grouping && (
        <Descriptions.Item
          label={
            <Space>
              <span>📊 分组</span>
              {result.grouping?.confidence && (
                <Tag color={getConfidenceColor(result.grouping.confidence)}>
                  {formatConfidence(result.grouping.confidence)}
                </Tag>
              )}
            </Space>
          }
        >
          <div>
            {result.grouping?.isGrouped ? (
              <Text>{result.grouping.groupCount}组</Text>
            ) : (
              <Text type="secondary">不分组</Text>
            )}
            
            {/* 原文片段 - 始终显示 */}
            <div style={{ marginTop: 8, padding: 8, background: '#f5f5f5', borderRadius: 4, borderLeft: '3px solid #d9d9d9' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>📄 原文片段：</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>
                {result.grouping?.extractedText || '原文未识别到相关内容'}
              </Text>
            </div>
          </div>
        </Descriptions.Item>
        )}

        {/* 重复赔付 */}
        {result.repeatablePayout && (
        <Descriptions.Item
          label={
            <Space>
              <span>🔄 重复赔付</span>
              {result.repeatablePayout?.confidence && (
                <Tag color={getConfidenceColor(result.repeatablePayout.confidence)}>
                  {formatConfidence(result.repeatablePayout.confidence)}
                </Tag>
              )}
            </Space>
          }
        >
          <div>
            {result.repeatablePayout ? (
              <Text>{result.repeatablePayout.isRepeatable ? '是' : '否'}</Text>
            ) : (
              <Text type="secondary">不支持重复赔付</Text>
            )}
            
            {/* 原文片段 - 始终显示 */}
            <div style={{ marginTop: 8, padding: 8, background: '#f5f5f5', borderRadius: 4, borderLeft: '3px solid #d9d9d9' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>📄 原文片段：</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>
                {result.repeatablePayout?.extractedText || '原文未识别到相关内容'}
              </Text>
            </div>
          </div>
        </Descriptions.Item>
        )}

        {/* 保费豁免 */}
        {result.premiumWaiver && (
        <Descriptions.Item
          label={
            <Space>
              <span>✋ 保费豁免</span>
              {result.premiumWaiver?.confidence && (
                <Tag color={getConfidenceColor(result.premiumWaiver.confidence)}>
                  {formatConfidence(result.premiumWaiver.confidence)}
                </Tag>
              )}
            </Space>
          }
        >
          <div>
            {result.premiumWaiver ? (
              <Text>{result.premiumWaiver.isWaived ? '是' : '否'}</Text>
            ) : (
              <Text type="secondary">不豁免保费</Text>
            )}
            
            {/* 原文片段 - 始终显示 */}
            <div style={{ marginTop: 8, padding: 8, background: '#f5f5f5', borderRadius: 4, borderLeft: '3px solid #d9d9d9' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>📄 原文片段：</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>
                {result.premiumWaiver?.extractedText || '原文未识别到相关内容'}
              </Text>
            </div>
          </div>
        </Descriptions.Item>
        )}

        {/* 特殊条件 */}
        {result.conditions && Array.isArray(result.conditions) && result.conditions.length > 0 && (
          <Descriptions.Item label="⚠️ 特殊条件">
            <Space direction="vertical">
              {result.conditions.map((condition, index) => (
                <div key={index}>
                  <Tag>{condition.type}</Tag>
                  <Text>{condition.description}</Text>
                </div>
              ))}
            </Space>
          </Descriptions.Item>
        )}
      </Descriptions>
    </Space>
  )
}



