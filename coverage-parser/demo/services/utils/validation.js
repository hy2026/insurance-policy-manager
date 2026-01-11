// ==================== 验证服务（职责：仅负责数据验证）====================
class ValidationService {
  static validateCoverageInput(coverageType, coverageName, clauseText) {
    if (!coverageType) {
      return { valid: false, message: '请选择责任类型' };
    }
    if (!coverageName) {
      return { valid: false, message: '请输入责任名称' };
    }
    if (!clauseText) {
      return { valid: false, message: '请输入保障责任条款' };
    }
    return { valid: true };
  }

  static validatePolicyInput(policyData) {
    const errors = [];
    
    // 验证必填字段（带*的字段）
    if (!policyData.insuranceCompany || !policyData.insuranceCompany.trim()) {
      errors.push('保险公司');
    }
    if (!policyData.productName || !policyData.productName.trim()) {
      errors.push('产品名称');
    }
    if (!policyData.insuredPerson) {
      errors.push('被保险人');
    }
    if (!policyData.birthYear) {
      errors.push('出生年份');
    }
    if (!policyData.policyStartYear) {
      errors.push('投保开始年份');
    }
    if (!policyData.coverageEndYear) {
      errors.push('保障结束年份');
    }
    if (!policyData.totalPaymentPeriod) {
      errors.push('总缴费期限');
    }
    if (!policyData.annualPremium || policyData.annualPremium <= 0) {
      errors.push('每年保费');
    }
    if (!policyData.basicSumInsured || policyData.basicSumInsured <= 0) {
      errors.push('基本保额');
    }
    
    // 验证责任数量
    if (!policyData.coverages || policyData.coverages.length === 0) {
      errors.push('保障责任（至少添加1个责任）');
    }
    
    // 如果有缺失字段，返回详细错误信息
    if (errors.length > 0) {
      return { 
        valid: false, 
        message: '请填写以下必填项：\n\n' + errors.map(e => `• ${e}`).join('\n')
      };
    }
    
    // 验证年龄合理性
    if (policyData.policyStartYear && policyData.birthYear) {
      const age = parseInt(policyData.policyStartYear) - parseInt(policyData.birthYear);
      if (age < 0 || age > 120) {
        return { 
          valid: false, 
          message: '投保年龄不合理（根据出生年份和投保开始年份计算为' + age + '岁）\n\n请检查出生年份和投保开始年份是否正确' 
        };
      }
    }
    
    return { valid: true };
  }
}








