const RecommendationPage = () => {
  return (
    <div style={{ 
      padding: '24px',
      maxWidth: '1400px',
      margin: '0 auto'
    }}>
      {/* 标题 */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ 
          fontSize: '30px', 
          fontWeight: 700, 
          color: '#1f2937',
          margin: '0 0 8px 0',
          lineHeight: '1.2'
        }}>
          精选好险专区
        </h1>
        <p style={{ 
          fontSize: '14px', 
          fontWeight: 400, 
          color: '#6b7280',
          margin: 0
        }}>
          为您精心挑选优质保险产品
        </p>
      </div>

      {/* 内容区域 - 暂时为空 */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.7)',
        backdropFilter: 'blur(12px)',
        borderRadius: '12px',
        padding: '48px',
        textAlign: 'center',
        color: '#9ca3af'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
        <div style={{ fontSize: '16px' }}>功能开发中，敬请期待...</div>
      </div>
    </div>
  );
};

export default RecommendationPage;

