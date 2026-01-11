// ==================== 其他条件解析器（职责：仅负责其他条件字段的解析）====================
class ConditionsParserService {
  /**
   * 解析其他条件（返回数组）
   * @param {string} clauseText - 条款文本
   * @param {string} coverageType - 责任类型
   * @returns {Array} 解析结果数组 [{ type, description, minAge, maxAge, confidence, extractedText }]
   */
  static parse(clauseText, coverageType = 'disease') {
    const rules = this.getRules(coverageType);
    return this.applyRules(clauseText, rules);
  }

  static getRules(coverageType) {
    // 条件规则主要适用于疾病责任
    if (coverageType === 'disease') {
      return this.getDiseaseRules();
    }
    return [];
  }

  static applyRules(text, rules) {
    const conditions = [];
    for (const rule of rules) {
      const match = text.match(rule.pattern);
      if (match && rule.handler) {
        const result = rule.handler(match);
        if (result) {
          result.ruleName = rule.name;
          conditions.push(result);
        }
      }
    }
    return conditions.length > 0 ? conditions : [];
  }

  static getDiseaseRules() {
    return [
      {
        name: "first_diagnosis",
        // 更宽松：首次确诊、初次确诊、首次发生等
        pattern: /(?:首次确诊|初次确诊|首次发生|第一次确诊|第一次发生|初次发生)/i,
        handler: (match) => ({
          type: "firstDiagnosis",
          description: "必须是首次确诊",
          confidence: 0.90,
          extractedText: match[0]
        })
      },
      {
        name: "accident_no_waiting",
        // 更宽松：意外伤害/意外导致...无等待期/无观察期
        pattern: /(?:意外伤害|意外导致|因意外|意外事故)[^。]*?(?:无等待期|无观察期|不设等待期|不设观察期)/i,
        handler: (match) => ({
          type: "accidentNoWaiting",
          description: "意外伤害导致的重疾无等待期",
          confidence: 0.85,
          extractedText: match[0]
        })
      },
      {
        name: "age_limit",
        // 更宽松：N-M周岁、N至M周岁、N到M周岁等
        pattern: /(\d+)\s*[-至到～~]\s*(\d+)\s*(?:周岁|岁)/i,
        handler: (match) => ({
          type: "ageLimit",
          description: `年龄限制：${match[1]}-${match[2]}周岁`,
          minAge: parseInt(match[1]),
          maxAge: parseInt(match[2]),
          confidence: 0.90,
          extractedText: match[0]
        })
      }
    ];
  }
}








