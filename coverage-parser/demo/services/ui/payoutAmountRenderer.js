// ==================== 赔付金额渲染服务（职责：负责赔付金额的展示逻辑）====================
class PayoutAmountRenderer {
  /**
   * 创建赔付金额显示组件
   * 注意：所有计算由后端完成，前端只负责展示
   */
  static createDisplay(data, policyInfo, fullResult = null) {
    console.log('🎨 [PayoutAmountRenderer] 开始创建赔付金额显示');
    
    if (!data || !data.details || !data.details.tiers) {
      console.warn('⚠️ [PayoutAmountRenderer] 数据缺失，无法显示');
      return this.createEmptyDisplay();
    }

    const div = document.createElement('div');
    div.className = 'result-item';
    div.id = 'payoutAmountItem';
    
    const confidence = data.confidence || 0;
    const confidenceClass = confidence >= 0.8 ? 'confidence-high' : 
                           confidence >= 0.5 ? 'confidence-medium' : 'confidence-low';
    const confidenceText = confidence >= 0.8 ? '高' : 
                          confidence >= 0.5 ? '中' : '低';
    
    // 原文片段
    const extractedTextHtml = this.createExtractedTextHtml(data.extractedText);
    
    // 渲染阶段
    const tiersHtml = this.renderTiers(data.details.tiers, policyInfo);
    
    div.innerHTML = `
      <div class="result-label">
        <span>💰 赔付金额</span>
        ${confidence > 0 ? `<span class="confidence-badge ${confidenceClass}">置信度: ${confidenceText} (${(confidence * 100).toFixed(0)}%)</span>` : ''}
      </div>
      ${extractedTextHtml}
      <div class="result-value">
        ${tiersHtml}
      </div>
    `;
    
    return div;
  }

  /**
   * 渲染阶段列表
   */
  static renderTiers(tiers, policyInfo) {
    if (!tiers || tiers.length === 0) {
      return '<p style="color: #999;">无阶段数据</p>';
    }

    // 过滤并格式化阶段
    const formattedTiers = tiers
      .filter(tier => {
        // 只显示有完整数据的阶段
        if (tier.keyAmounts && tier.keyAmounts.length > 0) return true;
        if (tier.amount !== undefined && tier.amount !== null) return true;
        console.warn('⚠️ [PayoutAmountRenderer] 跳过无效阶段:', tier);
        return false;
      })
      .map((tier, index) => this.formatTier(tier, policyInfo, index));

    if (formattedTiers.length === 0) {
      return `
        <p style="color: #f44336; padding: 10px; background: #ffebee; border-radius: 4px;">
          ❌ 后端未返回有效的阶段数据，无法显示<br>
          <small>请检查后端API是否正常运行</small>
        </p>
      `;
    }

    return formattedTiers.map((tier, index) => this.renderTier(tier, index)).join('');
  }

  /**
   * 格式化单个阶段（从后端数据中提取显示所需信息）
   */
  static formatTier(tier, policyInfo, index) {
    // ✅ 直接使用后端返回的数据，不做计算
    if (tier.keyAmounts && tier.keyAmounts.length > 0) {
      // 公式类型：有keyAmounts
      return {
        type: 'formula',
        startAge: tier.keyAmounts[0].age,
        endAge: tier.keyAmounts[tier.keyAmounts.length - 1].age,
        formula: tier.formula || '',
        formulaType: tier.formulaType || 'unknown',
        keyAmounts: tier.keyAmounts,
        period: tier.period
      };
    } else if (tier.amount !== undefined) {
      // 固定金额类型
      return {
        type: 'fixed',
        startAge: tier.startAge,
        endAge: tier.endAge,
        amount: parseFloat(tier.amount).toFixed(1),
        period: tier.period
      };
    } else {
      // 无效数据
      console.error('❌ [PayoutAmountRenderer] 阶段缺少必需数据:', tier);
      return {
        type: 'error',
        message: '数据不完整'
      };
    }
  }

  /**
   * 渲染单个阶段的HTML
   */
  static renderTier(tier, index) {
    if (tier.type === 'error') {
      return `
        <div class="tier-item" style="background: #ffebee; border-left: 3px solid #f44336;">
          <p style="color: #f44336;">❌ 阶段${index + 1}: ${tier.message}</p>
        </div>
      `;
    }

    if (tier.type === 'formula') {
      return this.renderFormulaTier(tier, index);
    } else {
      return this.renderFixedTier(tier, index);
    }
  }

  /**
   * 渲染公式类型阶段
   */
  static renderFormulaTier(tier, index) {
    const { startAge, endAge, formula, formulaType, keyAmounts, period } = tier;
    
    // 显示前5个节点作为示例
    const sampleNodes = keyAmounts.slice(0, 5);
    const sampleHtml = sampleNodes.map(node => 
      `<li>${node.year}年（${node.age}岁）: ${node.amount}万</li>`
    ).join('');
    
    const moreText = keyAmounts.length > 5 ? 
      `<li>... 共${keyAmounts.length}个年份节点</li>` : '';

    return `
      <div class="tier-item">
        <div style="font-weight: 600; margin-bottom: 8px;">
          📊 阶段${index + 1}: ${startAge}岁～${endAge}岁
          ${period ? `<span style="color: #666; font-size: 12px;">（${period}）</span>` : ''}
        </div>
        <div style="color: #1976d2; margin-bottom: 8px;">
          公式: ${formula}
        </div>
        <div style="font-size: 13px; color: #666;">
          <div style="margin-bottom: 4px;">关键节点示例:</div>
          <ul style="margin: 0; padding-left: 20px;">
            ${sampleHtml}
            ${moreText}
          </ul>
        </div>
      </div>
    `;
  }

  /**
   * 渲染固定金额阶段
   */
  static renderFixedTier(tier, index) {
    const { startAge, endAge, amount, period } = tier;
    
    return `
      <div class="tier-item">
        <div style="font-weight: 600; margin-bottom: 8px;">
          💵 阶段${index + 1}: ${startAge}岁～${endAge}岁
          ${period ? `<span style="color: #666; font-size: 12px;">（${period}）</span>` : ''}
        </div>
        <div style="color: #2e7d32; font-size: 18px; font-weight: 600;">
          ${amount}万元
        </div>
      </div>
    `;
  }

  /**
   * 创建空显示
   */
  static createEmptyDisplay() {
    const div = document.createElement('div');
    div.className = 'result-item';
    div.id = 'payoutAmountItem';
    div.innerHTML = `
      <div class="result-label">
        <span>💰 赔付金额</span>
      </div>
      <div class="result-value" style="color: #999;">
        暂无数据
      </div>
    `;
    return div;
  }

  /**
   * 创建原文片段HTML
   */
  static createExtractedTextHtml(extractedText) {
    if (!extractedText || extractedText.length === 0) {
      return '';
    }
    
    const texts = Array.isArray(extractedText) ? extractedText : [extractedText];
    const html = texts.map(text => 
      `<div class="extracted-snippet">${text}</div>`
    ).join('');
    
    return `
      <div class="extracted-text-container">
        <div class="extracted-text-label">📄 原文片段</div>
        ${html}
      </div>
    `;
  }
}

// 兼容旧代码的全局函数
function createPayoutAmountDisplay(data, policyInfo, fullResult = null) {
  return PayoutAmountRenderer.createDisplay(data, policyInfo, fullResult);
}
































