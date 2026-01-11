// ==================== 等待期解析器（职责：仅负责等待期字段的解析）====================
class WaitingPeriodParserService {
  /**
   * 解析等待期
   * @param {string} clauseText - 条款文本
   * @param {string} coverageType - 责任类型
   * @returns {Object} 解析结果 { days, confidence, extractedText }
   */
  static parse(clauseText, coverageType = 'disease') {
    const rules = this.getRules(coverageType);
    return this.applyRules(clauseText, rules);
  }

  static getRules(coverageType) {
    // 等待期规则通常对所有责任类型都适用
    return this.getCommonRules();
  }

  static applyRules(text, rules) {
    let bestMatch = null;
    let bestConfidence = 0;

    for (const rule of rules) {
      const match = text.match(rule.pattern);
      if (match && rule.handler) {
        const result = rule.handler(match);
        if (result && result.confidence > bestConfidence) {
          bestConfidence = result.confidence;
          bestMatch = result;
        }
      }
    }

    return bestMatch || { days: 0, confidence: 0, extractedText: "未识别" };
  }

  static getCommonRules() {
    return [
      {
        name: "waiting_period_days",
        // 更宽松：等待期/观察期 N天/日
        pattern: /(?:等待期|观察期|等待期间|观察期间|等待期限|观察期限)[^0-9]*?(\d+)\s*(?:天|日|日数|天数)/i,
        handler: (match) => ({
          days: parseInt(match[1]),
          confidence: 0.90,
          extractedText: match[0]
        })
      },
      {
        name: "waiting_period_months",
        // 新增：等待期/观察期 N个月
        pattern: /(?:等待期|观察期|等待期间|观察期间|等待期限|观察期限)[^0-9]*?(\d+)\s*(?:个月|月)/i,
        handler: (match) => ({
          days: parseInt(match[1]) * 30,
          months: parseInt(match[1]),
          confidence: 0.90,
          extractedText: match[0]
        })
      },
      {
        name: "waiting_period_years",
        // 新增：等待期/观察期 N年
        pattern: /(?:等待期|观察期|等待期间|观察期间|等待期限|观察期限)[^0-9]*?(\d+)\s*(?:年|周年|年度)/i,
        handler: (match) => ({
          days: parseInt(match[1]) * 365,
          years: parseInt(match[1]),
          confidence: 0.90,
          extractedText: match[0]
        })
      }
    ];
  }
}








