// ==================== 保单信息助手（职责：获取和验证保单信息）====================
class PolicyInfoHelper {
  /**
   * 获取当前页面的保单信息
   * @returns {Object|null} 保单信息对象，如果信息不完整则返回null
   */
  static get() {
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
      basicSumInsured, // 单位：元
      annualPremium: annualPremiumEl ? parseFloat(annualPremiumEl.value) : undefined,
      totalPaymentPeriod: totalPaymentPeriodEl ? totalPaymentPeriodEl.value : undefined
    };
  }

  /**
   * 验证保单信息是否完整
   * @param {Object} policyInfo - 保单信息对象
   * @returns {Object} { valid: boolean, message: string }
   */
  static validate(policyInfo) {
    if (!policyInfo) {
      return {
        valid: false,
        message: '请先填写保单基本信息（出生年份、投保开始年份、基本保额）'
      };
    }

    const { birthYear, policyStartYear, coverageEndYear, basicSumInsured } = policyInfo;

    if (!birthYear || !policyStartYear || !coverageEndYear || !basicSumInsured) {
      return {
        valid: false,
        message: '保单信息不完整，请检查必填项'
      };
    }

    // 验证投保年龄
    const policyStartAge = policyStartYear - birthYear;
    const currentYear = new Date().getFullYear();
    const currentAge = currentYear - birthYear;

    if (policyStartAge > currentAge) {
      return {
        valid: false,
        message: `投保年份设置有误！当前年龄：${currentAge}岁，投保年龄：${policyStartAge}岁（未来年龄！）`
      };
    }

    if (policyStartAge < 0 || policyStartAge > 100) {
      return {
        valid: false,
        message: `投保年龄不合理（${policyStartAge}岁），请检查出生年份和投保开始年份`
      };
    }

    return {
      valid: true,
      message: 'OK'
    };
  }

  /**
   * 计算当前投保年龄
   * @param {Object} policyInfo - 保单信息对象
   * @returns {number} 投保年龄
   */
  static calculatePolicyStartAge(policyInfo) {
    if (!policyInfo || !policyInfo.birthYear || !policyInfo.policyStartYear) {
      return null;
    }
    return policyInfo.policyStartYear - policyInfo.birthYear;
  }

  /**
   * 计算保障结束年龄
   * @param {Object} policyInfo - 保单信息对象
   * @returns {number} 结束年龄（终身保障返回100）
   */
  static calculateCoverageEndAge(policyInfo) {
    if (!policyInfo || !policyInfo.birthYear) {
      return null;
    }
    
    if (policyInfo.coverageEndYear === 'lifetime') {
      return 100;
    }
    
    return policyInfo.coverageEndYear - policyInfo.birthYear;
  }
}

// 兼容旧代码的全局函数
function getPolicyInfo() {
  return PolicyInfoHelper.get();
}

































