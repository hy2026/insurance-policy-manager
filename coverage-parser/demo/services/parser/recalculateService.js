// ==================== 重新计算服务（职责：调用后端API重新计算金额）====================
class RecalculateService {
  /**
   * 重新计算指定阶段的金额
   * 注意：所有计算在后端完成
   */
  static async recalculateTier(tierIndex) {
    console.log(`🔄 [RecalculateService] 重新计算阶段${tierIndex + 1}`);

    // 1. 获取当前编辑的责任
    if (!window.currentAnalyzingCoverage || !window.currentAnalyzingCoverage.result) {
      this.showError('当前没有正在编辑的责任');
      return;
    }

    const payoutAmount = window.currentAnalyzingCoverage.result.payoutAmount;
    if (!payoutAmount || !payoutAmount.details || !payoutAmount.details.tiers) {
      this.showError('无效的赔付金额数据');
      return;
    }

    const tier = payoutAmount.details.tiers[tierIndex];
    if (!tier) {
      this.showError('找不到对应阶段');
      return;
    }

    // 2. 获取保单信息
    const policyInfo = this.getPolicyInfo();
    if (!policyInfo) {
      this.showError('请先填写保单基本信息（出生年份、投保年份、基本保额）');
      return;
    }

    // 3. 显示加载状态
    this.showLoading(tierIndex);

    try {
      // 4. 调用后端API重新计算
      console.log('📊 [RecalculateService] 发送请求到后端');
      console.log('   tier:', tier);
      console.log('   policyInfo:', policyInfo);

      const response = await fetch('http://localhost:4000/api/coverage/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier: tier,
          policyInfo: policyInfo
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [RecalculateService] 后端返回错误:', errorText);
        throw new Error(`计算失败: ${response.status}`);
      }

      const result = await response.json();
      console.log(`✅ [RecalculateService] 后端返回结果:`, result);

      // 5. 检查返回格式
      if (!result.success) {
        this.showError(result.message || '计算失败');
        return;
      }

      // 6. 更新tier数据
      if (result.keyAmounts && result.keyAmounts.length > 0) {
        tier.keyAmounts = result.keyAmounts;
        tier.startAge = result.keyAmounts[0].age;
        tier.endAge = result.keyAmounts[result.keyAmounts.length - 1].age;
        
        console.log(`✅ [RecalculateService] 已更新阶段${tierIndex + 1}的数据`);
        console.log(`   共${result.keyAmounts.length}条金额数据`);
        console.log(`   年龄范围: ${tier.startAge}岁-${tier.endAge}岁`);

        // 7. 重新渲染结果区域
        if (typeof displayResult === 'function') {
          displayResult(window.currentAnalyzingCoverage.result, window.currentAnalyzingCoverage.name);
        }

        this.showSuccess(`重新计算完成，已更新${result.keyAmounts.length}条金额数据`);
      } else {
        console.warn('⚠️ [RecalculateService] 返回的keyAmounts为空或不是数组:', result.keyAmounts);
        this.showWarning('后端返回数据格式异常');
      }

    } catch (error) {
      console.error('❌ [RecalculateService] 计算失败:', error);
      this.showError(`计算失败: ${error.message}`);
    } finally {
      this.hideLoading(tierIndex);
    }
  }

  /**
   * 获取保单信息
   */
  static getPolicyInfo() {
    const birthYearEl = document.getElementById('birthYear');
    const policyStartYearEl = document.getElementById('policyStartYear');
    const coverageEndYearEl = document.getElementById('coverageEndYear');
    const basicSumInsuredEl = document.getElementById('basicSumInsured');
    const annualPremiumEl = document.getElementById('annualPremium');
    const totalPaymentPeriodEl = document.getElementById('totalPaymentPeriod');

    if (!birthYearEl || !policyStartYearEl || !coverageEndYearEl || !basicSumInsuredEl) {
      return null;
    }

    const birthYear = parseInt(birthYearEl.value);
    const policyStartYear = parseInt(policyStartYearEl.value);
    const coverageEndYear = coverageEndYearEl.value === 'lifetime' ? 
      'lifetime' : parseInt(coverageEndYearEl.value);
    const basicSumInsured = parseFloat(basicSumInsuredEl.value) * 10000; // 转换为元

    if (!birthYear || !policyStartYear || !coverageEndYear || !basicSumInsured) {
      return null;
    }

    return {
      birthYear,
      policyStartYear,
      coverageEndYear,
      basicSumInsured,
      annualPremium: annualPremiumEl ? parseFloat(annualPremiumEl.value) : undefined,
      totalPaymentPeriod: totalPaymentPeriodEl ? parseInt(totalPaymentPeriodEl.value) : undefined
    };
  }

  /**
   * 显示加载状态
   */
  static showLoading(tierIndex) {
    const button = document.querySelector(`button[onclick="recalculateAmount(${tierIndex})"]`);
    if (button) {
      button.disabled = true;
      button.textContent = '计算中...';
    }
  }

  /**
   * 隐藏加载状态
   */
  static hideLoading(tierIndex) {
    const button = document.querySelector(`button[onclick="recalculateAmount(${tierIndex})"]`);
    if (button) {
      button.disabled = false;
      button.textContent = '重新计算';
    }
  }

  /**
   * 显示消息
   */
  static showSuccess(message) {
    if (typeof showMessage === 'function') {
      showMessage(`✅ ${message}`, 'success');
    } else {
      console.log(`✅ ${message}`);
    }
  }

  static showError(message) {
    if (typeof showMessage === 'function') {
      showMessage(`❌ ${message}`, 'error');
    } else {
      console.error(`❌ ${message}`);
    }
  }

  static showWarning(message) {
    if (typeof showMessage === 'function') {
      showMessage(`⚠️ ${message}`, 'warning');
    } else {
      console.warn(`⚠️ ${message}`);
    }
  }
}

// 兼容旧代码的全局函数
async function recalculateAmount(tierIndex) {
  return await RecalculateService.recalculateTier(tierIndex);
}



































