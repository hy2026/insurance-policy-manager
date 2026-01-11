// ==================== 保单管理服务（职责：仅负责保单数据CRUD）====================
class PolicyManagerService {
  /**
   * 创建保单对象
   * @param {Object} policyData - 保单数据
   * @returns {Object} 保单对象
   */
  static create(policyData) {
    return {
      id: policyData.id || Date.now().toString(),
      insuranceCompany: policyData.insuranceCompany,
      productName: policyData.productName,
      policyType: policyData.policyType,
      insuredPerson: policyData.insuredPerson,
      birthYear: policyData.birthYear,
      policyStartYear: policyData.policyStartYear,
      coverageEndYear: policyData.coverageEndYear,
      totalPaymentPeriod: policyData.totalPaymentPeriod,
      annualPremium: policyData.annualPremium,
      basicSumInsured: policyData.basicSumInsured,
      coverages: policyData.coverages || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * 保存保单到列表（如果已存在则更新，否则添加）
   * @param {Array} policies - 保单列表
   * @param {Object} policy - 要保存的保单
   * @returns {Array} 更新后的保单列表
   */
  static save(policies, policy) {
    const existingIndex = policies.findIndex(p => p.id === policy.id);
    if (existingIndex >= 0) {
      // 更新现有保单
      policies[existingIndex] = {
        ...policy,
        createdAt: policies[existingIndex].createdAt, // 保留创建时间
        updatedAt: new Date().toISOString()
      };
    } else {
      // 添加新保单
      policies.push(policy);
    }
    return policies;
  }

  /**
   * 删除保单
   * @param {Array} policies - 保单列表
   * @param {string} policyId - 保单ID
   * @returns {Array} 更新后的保单列表
   */
  static delete(policies, policyId) {
    const index = policies.findIndex(p => p.id === policyId);
    if (index >= 0) {
      policies.splice(index, 1);
    }
    return policies;
  }

  /**
   * 根据ID查找保单
   * @param {Array} policies - 保单列表
   * @param {string} policyId - 保单ID
   * @returns {Object|null} 保单对象或null
   */
  static findById(policies, policyId) {
    return policies.find(p => p.id === policyId) || null;
  }
}

