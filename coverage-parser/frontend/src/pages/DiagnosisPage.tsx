import { Card } from 'antd'

export default function DiagnosisPage() {
  return (
    <div style={{ minHeight: '100vh', padding: '24px' }}>
      {/* 顶部标题区域 - 参考我家的保单 */}
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
            家庭保障体检
          </h1>
          <p style={{
            fontSize: '14px',
            color: '#6b7280',
            margin: 0,
            fontWeight: 400
          }}>
            全面分析家庭保障状况，提供专业建议
          </p>
        </div>
      </div>

      {/* 主内容区域 */}
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto'
      }}>
        <Card style={{
          background: 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRadius: '12px',
          border: 'none'
        }}>
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#999' }}>
            功能开发中，敬请期待...
          </div>
        </Card>
      </div>
    </div>
  )
}


