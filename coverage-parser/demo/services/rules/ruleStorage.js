// ==================== 规则存储服务（职责：管理学习到的规则）====================
class RuleStorageService {
  static STORAGE_KEY = 'learned_rules';

  /**
   * 保存学习到的规则
   * @param {Object} rules - 提取的规则对象
   */
  static saveRules(rules) {
    if (!rules || !rules.patterns || rules.patterns.length === 0) {
      console.warn('⚠️ 没有可保存的规则');
      return;
    }

    try {
      const existingRules = this.getAllRules();
      
      // 检查是否已存在相同的规则（基于pattern和field）
      const isDuplicate = existingRules.some(existingRule => {
        return existingRule.patterns.some(existingPattern => {
          return rules.patterns.some(newPattern => {
            return existingPattern.field === newPattern.field &&
                   existingPattern.pattern === newPattern.pattern;
          });
        });
      });

      if (isDuplicate) {
        console.log('ℹ️ 规则已存在，跳过保存');
        return;
      }

      // 添加规则ID和时间戳
      rules.id = Date.now().toString();
      rules.confirmedAt = new Date().toISOString();
      
      existingRules.push(rules);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(existingRules));
      
      console.log('✅ 规则已保存:', {
        id: rules.id,
        patternsCount: rules.patterns.length,
        coverageType: rules.coverageType
      });
    } catch (error) {
      console.error('❌ 保存规则失败:', error);
    }
  }

  /**
   * 获取所有学习到的规则
   * @returns {Array} 规则列表
   */
  static getAllRules() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('❌ 读取规则失败:', error);
      return [];
    }
  }

  /**
   * 根据责任类型获取规则
   * @param {string} coverageType - 责任类型
   * @returns {Array} 规则列表
   */
  static getRulesByType(coverageType) {
    const allRules = this.getAllRules();
    return allRules.filter(rule => rule.coverageType === coverageType);
  }

  /**
   * 根据字段获取规则
   * @param {string} field - 字段名（如 'payoutAmount'）
   * @param {string} coverageType - 责任类型
   * @returns {Array} 规则列表
   */
  static getRulesByField(field, coverageType) {
    const rules = this.getRulesByType(coverageType);
    const result = [];
    
    rules.forEach(rule => {
      rule.patterns.forEach(pattern => {
        if (pattern.field === field) {
          result.push({
            ...pattern,
            ruleId: rule.id,
            extractedAt: rule.extractedAt
          });
        }
      });
    });
    
    return result;
  }

  /**
   * 删除规则
   * @param {string} ruleId - 规则ID
   */
  static deleteRule(ruleId) {
    try {
      const allRules = this.getAllRules();
      const filtered = allRules.filter(rule => rule.id !== ruleId);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
      console.log('✅ 规则已删除:', ruleId);
    } catch (error) {
      console.error('❌ 删除规则失败:', error);
    }
  }

  /**
   * 清空所有规则
   */
  static clearAllRules() {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      console.log('✅ 所有规则已清空');
    } catch (error) {
      console.error('❌ 清空规则失败:', error);
    }
  }

  /**
   * 获取规则统计信息
   * @returns {Object} 统计信息
   */
  static getStats() {
    const allRules = this.getAllRules();
    const stats = {
      total: allRules.length,
      byType: {},
      byField: {}
    };

    allRules.forEach(rule => {
      // 按类型统计
      stats.byType[rule.coverageType] = (stats.byType[rule.coverageType] || 0) + 1;
      
      // 按字段统计
      rule.patterns.forEach(pattern => {
        stats.byField[pattern.field] = (stats.byField[pattern.field] || 0) + 1;
      });
    });

    return stats;
  }
}

