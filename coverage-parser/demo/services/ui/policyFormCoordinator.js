/**
 * 保单表单协调服务
 * 
 * 职责：协调保单表单的整个流程
 * - 表单验证
 * - 数据收集
 * - 保单创建/更新
 * - UI更新
 */

class PolicyFormCoordinator {
  /**
   * 完成保单填写
   */
  static async complete() {
    try {
      console.log('========== 开始完成合同填写 ==========');

      // 1. 收集表单数据
      const policyData = this._collectFormData();

      // 2. 检查是否需要重新计算金额
      const needsRecalculation = this._checkRecalculationNeeded(policyData);

      // 3. 如果需要，重新计算所有责任的金额
      if (needsRecalculation && appState.coverages.length > 0) {
        await this._recalculateAllCoverages(policyData);
      }

      // 4. 验证数据
      const validation = ValidationService.validatePolicyInput(policyData);
      if (!validation.valid) {
        alert('❌ ' + validation.message);
        return;
      }

      // 5. 创建保单对象
      const policy = PolicyManagerService.create(policyData);

      // 6. 保存到列表
      PolicyManagerService.save(appState.policies, policy);

      // 7. 持久化存储
      PolicyStorageService.save(appState.policies);

      // 8. 更新UI
      if (typeof showPolicyCards === 'function') {
        showPolicyCards();
      }

      showMessage('✅ 合同已保存', 'success');
      console.log('========== 合同填写完成 ✅ ==========');
    } catch (error) {
      console.error('========== 完成合同填写时发生错误 ==========');
      console.error('错误详情:', error);
      alert('保存合同失败: ' + (error.message || error.toString()));
    }
  }

  /**
   * 收集表单数据
   */
  static _collectFormData() {
    const insuranceCompanyEl = document.getElementById('insuranceCompany');
    const productNameEl = document.getElementById('productName');
    const policyTypeEl = document.getElementById('policyType');
    const insuredPersonEl = document.getElementById('insuredPerson');
    const birthYearEl = document.getElementById('birthYear');
    const policyStartYearEl = document.getElementById('policyStartYear');
    const coverageEndYearEl = document.getElementById('coverageEndYear');
    const totalPaymentPeriodEl = document.getElementById('totalPaymentPeriod');
    const annualPremiumEl = document.getElementById('annualPremium');
    const basicSumInsuredEl = document.getElementById('basicSumInsured');

    return {
      id: appState.editingPolicyId || Date.now().toString(),
      insuranceCompany: insuranceCompanyEl?.value.trim() || '',
      productName: productNameEl?.value.trim() || '',
      policyType: policyTypeEl?.value || appState.currentPolicyType || 'critical_illness',
      insuredPerson: insuredPersonEl?.value || '',
      birthYear: birthYearEl?.value ? parseInt(birthYearEl.value) : null,
      policyStartYear: policyStartYearEl?.value ? parseInt(policyStartYearEl.value) : null,
      coverageEndYear: coverageEndYearEl?.value === 'lifetime' ? 'lifetime' : (coverageEndYearEl?.value ? parseInt(coverageEndYearEl.value) : null),
      totalPaymentPeriod: totalPaymentPeriodEl?.value === 'lifetime' ? 'lifetime' : (totalPaymentPeriodEl?.value ? parseInt(totalPaymentPeriodEl.value) : null),
      annualPremium: annualPremiumEl?.value ? parseFloat(annualPremiumEl.value) : 0,
      basicSumInsured: basicSumInsuredEl?.value ? parseFloat(basicSumInsuredEl.value) * 10000 : 0,
      coverages: appState.coverages || []
    };
  }

  /**
   * 检查是否需要重新计算
   */
  static _checkRecalculationNeeded(newPolicyInfo) {
    if (!appState.editingPolicyId) {
      return false;
    }

    const existingPolicy = appState.policies.find(p => p.id === appState.editingPolicyId);
    if (!existingPolicy) {
      return false;
    }

    return (
      existingPolicy.birthYear !== newPolicyInfo.birthYear ||
      existingPolicy.policyStartYear !== newPolicyInfo.policyStartYear ||
      existingPolicy.coverageEndYear !== newPolicyInfo.coverageEndYear ||
      existingPolicy.totalPaymentPeriod !== newPolicyInfo.totalPaymentPeriod ||
      existingPolicy.annualPremium !== newPolicyInfo.annualPremium ||
      existingPolicy.basicSumInsured !== newPolicyInfo.basicSumInsured
    );
  }

  /**
   * 重新计算所有责任的金额
   */
  static async _recalculateAllCoverages(policyInfo) {
    console.log('🔄 policyInfo已变化，开始重新计算所有责任的赔付金额...');

    const completePolicyBtn = document.getElementById('completePolicyBtn');
    const originalText = completePolicyBtn ? completePolicyBtn.textContent : '';

    showMessage(`⏳ 检测到保单信息变化，正在重新计算${appState.coverages.length}个责任...`, 'info', 0);

    try {
      let successCount = 0;
      for (let i = 0; i < appState.coverages.length; i++) {
        const coverage = appState.coverages[i];

        if (completePolicyBtn) {
          completePolicyBtn.textContent = `⏳ 正在计算 (${i + 1}/${appState.coverages.length})...`;
          completePolicyBtn.disabled = true;
        }

        console.log(`🔄 [${i + 1}/${appState.coverages.length}] 重新计算责任: ${coverage.name}`);

        if (coverage.parseResult?.payoutAmount?.details?.tiers) {
          for (let j = 0; j < coverage.parseResult.payoutAmount.details.tiers.length; j++) {
            const tier = coverage.parseResult.payoutAmount.details.tiers[j];

            if (!tier.keyAmounts || tier.keyAmounts.length === 0) {
              continue;
            }

            try {
              const response = await fetch('http://localhost:3001/api/parse/recalculate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tier, policyInfo })
              });

              if (!response.ok) {
                console.error(`   ❌ 阶段${j + 1}重新计算失败: ${response.status}`);
                continue;
              }

              const result = await response.json();
              if (result.success && result.keyAmounts) {
                tier.keyAmounts = result.keyAmounts;
                if (result.keyAmounts.length > 0) {
                  tier.startAge = result.keyAmounts[0].age;
                  tier.endAge = result.keyAmounts[result.keyAmounts.length - 1].age;
                }
              }
            } catch (err) {
              console.error(`   ❌ 阶段${j + 1}重新计算网络错误:`, err);
            }
          }
          successCount++;
        }
      }

      console.log(`✅ 所有责任重新计算完成，成功更新${successCount}个责任`);
      showMessage(`✅ 已自动更新${successCount}个责任的金额数据`, 'success', 3000);
    } finally {
      if (completePolicyBtn) {
        completePolicyBtn.textContent = originalText;
        completePolicyBtn.disabled = false;
      }
    }
  }

  /**
   * 更新完成按钮状态
   */
  static updateCompleteButton() {
    const btn = document.getElementById('completePolicyBtn');
    if (!btn) return;

    const hasBasicInfo = 
      document.getElementById('insuranceCompany')?.value.trim() &&
      document.getElementById('productName')?.value.trim() &&
      document.getElementById('insuredPerson')?.value &&
      document.getElementById('birthYear')?.value &&
      document.getElementById('policyStartYear')?.value &&
      document.getElementById('coverageEndYear')?.value &&
      document.getElementById('totalPaymentPeriod')?.value &&
      document.getElementById('annualPremium')?.value &&
      document.getElementById('basicSumInsured')?.value;

    const hasCoverages = appState.coverages.length > 0;
    btn.disabled = !(hasBasicInfo && hasCoverages);
  }
}

// 全局访问
window.PolicyFormCoordinator = PolicyFormCoordinator;


































