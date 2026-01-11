// ==================== UI渲染服务（职责：仅负责UI渲染）====================
class UIRenderService {
  static renderCoverageList(coverages, policyInfo = null) {
    if (coverages.length === 0) {
      return '<p style="color: #999; text-align: center; padding: 20px; font-size: 14px;">暂无责任，请先添加责任</p>';
    }
    
    return coverages.map((coverage, index) => {
      const formatted = DataFormatterService.formatCoverageForDisplay(coverage, policyInfo);
      return `
        <div style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; margin-bottom: 12px; background: #fafafa;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div>
              <span style="font-weight: 600; color: #333; font-size: 14px;">${formatted.name}</span>
              <span style="margin-left: 8px; padding: 2px 8px; background: #B3EBEF; color: #333; border-radius: 4px; font-size: 12px;">${formatted.typeName}</span>
            </div>
            <div style="display: flex; gap: 8px;">
              <button onclick="editCoverage(${index})" style="padding: 4px 12px; background: #01BCD6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">编辑</button>
              <button onclick="deleteCoverage(${index})" style="padding: 4px 12px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">删除</button>
            </div>
          </div>
          <div style="color: #666; font-size: 12px; margin-top: 8px;">
            <div>赔付金额: ${formatted.payoutAmount}</div>
            <div>赔付次数: ${formatted.payoutCount}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  static renderPolicyCards(policies) {
    if (policies.length === 0) {
      return '<p style="color: #999; text-align: center; padding: 40px;">暂无合同</p>';
    }
    
    return policies.map(policy => {
      const formatted = DataFormatterService.formatPolicyForDisplay(policy);
      return `
        <div style="border: 1px solid #e0e0e0; border-radius: 12px; padding: 20px; background: white; transition: all 0.3s; box-shadow: 0 2px 4px rgba(0,0,0,0.1); display: flex; flex-direction: column;" onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.15)'" onmouseout="this.style.boxShadow='0 2px 4px rgba(0,0,0,0.1)'">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h3 style="font-size: 16px; font-weight: 600; color: #333; margin: 0;">${formatted.productName}</h3>
            <span style="padding: 4px 12px; background: #B3EBEF; color: #333; border-radius: 4px; font-size: 12px;">${formatted.typeName}</span>
          </div>
          <div style="color: #666; font-size: 13px; line-height: 1.8; flex: 1;">
            <div>保险公司: ${formatted.insuranceCompany}</div>
            <div>被保险人: ${formatted.insuredPerson}（${formatted.birthYear}）</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0 20px;">
              <div>投保开始: ${formatted.policyStartYear}</div>
              <div>保障结束: ${formatted.coverageEndYear}</div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0 20px;">
              <div>交费年限: ${formatted.totalPaymentPeriod}</div>
              <div>年交保费: ${formatted.annualPremium}</div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0 20px;">
              <div>已交年数: ${formatted.paidYears}</div>
              <div>待交年数: ${formatted.remainingYears}</div>
            </div>
            <div>基本保额: ${formatted.basicSumInsured}</div>
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e0e0e0; margin-bottom: 4px;">
              <strong>保障责任: ${formatted.coverageCount}项</strong>
            </div>
          </div>
          <div style="display: flex; gap: 8px; justify-content: center; margin-top: 4px;">
            <button onclick="event.stopPropagation(); editPolicy('${policy.id}')" style="padding: 6px 12px; background: transparent; color: #01BCD6; border: 1.5px solid #01BCD6; border-radius: 6px; cursor: pointer; font-size: 12px; transition: all 0.3s; font-weight: 500; min-width: 60px; display: flex; align-items: center; justify-content: center; gap: 4px;" onmouseover="this.style.background='#e6f7fa'; this.style.borderColor='#00a8c5'; this.style.color='#00a8c5'" onmouseout="this.style.background='transparent'; this.style.borderColor='#01BCD6'; this.style.color='#01BCD6'">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
              <span>编辑</span>
            </button>
            <button onclick="event.stopPropagation(); deletePolicy('${policy.id}')" style="padding: 6px 12px; background: transparent; color: #ef4444; border: 1.5px solid #ef4444; border-radius: 6px; cursor: pointer; font-size: 12px; transition: all 0.3s; font-weight: 500; min-width: 60px; display: flex; align-items: center; justify-content: center; gap: 4px;" onmouseover="this.style.background='#fee2e2'; this.style.borderColor='#dc2626'; this.style.color='#dc2626'" onmouseout="this.style.background='transparent'; this.style.borderColor='#ef4444'; this.style.color='#ef4444'">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span>删除</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }
}








