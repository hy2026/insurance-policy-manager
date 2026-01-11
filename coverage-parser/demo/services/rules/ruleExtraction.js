// ==================== 规则提取服务（职责：从大模型解析结果中提取规则模式）====================
class RuleExtractionService {
  /**
   * 从解析结果中提取规则
   * @param {string} clauseText - 原始条款文本
   * @param {Object} parseResult - 解析结果
   * @param {string} coverageType - 责任类型
   * @returns {Object|null} 提取的规则，如果无法提取则返回null
   */
  static extractRules(clauseText, parseResult, coverageType = 'disease') {
    if (!parseResult || !clauseText) {
      return null;
    }

    const rules = {
      coverageType: coverageType,
      extractedAt: new Date().toISOString(),
      clauseText: clauseText.substring(0, 500), // 保存前500字符作为参考
      patterns: []
    };

    // 提取赔付金额规则
    if (parseResult.payoutAmount && parseResult.payoutAmount.confidence >= 0.8) {
      const payoutRule = this.extractPayoutAmountRule(clauseText, parseResult.payoutAmount);
      if (payoutRule) {
        rules.patterns.push(payoutRule);
      }
    }

    // 提取赔付次数规则
    if (parseResult.payoutCount && parseResult.payoutCount.confidence >= 0.8) {
      const countRule = this.extractPayoutCountRule(clauseText, parseResult.payoutCount);
      if (countRule) {
        rules.patterns.push(countRule);
      }
    }

    // 提取间隔期规则
    if (parseResult.intervalPeriod && parseResult.intervalPeriod.confidence >= 0.8) {
      const intervalRule = this.extractIntervalPeriodRule(clauseText, parseResult.intervalPeriod);
      if (intervalRule) {
        rules.patterns.push(intervalRule);
      }
    }

    // 提取是否分组规则
    if (parseResult.grouping && parseResult.grouping.confidence >= 0.8) {
      const groupingRule = this.extractGroupingRule(clauseText, parseResult.grouping);
      if (groupingRule) {
        rules.patterns.push(groupingRule);
      }
    }

    // 提取是否可重复赔付规则
    if (parseResult.repeatablePayout && parseResult.repeatablePayout.confidence >= 0.8) {
      const repeatableRule = this.extractRepeatablePayoutRule(clauseText, parseResult.repeatablePayout);
      if (repeatableRule) {
        rules.patterns.push(repeatableRule);
      }
    }

    // 提取保费豁免规则
    if (parseResult.premiumWaiver && parseResult.premiumWaiver.confidence >= 0.8) {
      const waiverRule = this.extractPremiumWaiverRule(clauseText, parseResult.premiumWaiver);
      if (waiverRule) {
        rules.patterns.push(waiverRule);
      }
    }

    // 如果没有提取到任何规则，返回null
    if (rules.patterns.length === 0) {
      return null;
    }

    return rules;
  }

  /**
   * 提取赔付金额规则
   */
  static extractPayoutAmountRule(clauseText, payoutAmount) {
    if (!payoutAmount.extractedText) {
      return null;
    }

    const extractedText = payoutAmount.extractedText;
    
    // 构建正则表达式模式（转义特殊字符）
    let pattern = this.escapeRegex(extractedText);
    
    // 将数字替换为通配符
    pattern = pattern.replace(/\d+(?:\.\d+)?/g, '\\d+(?:\\.\\d+)?');
    
    // 将百分比替换为通配符
    pattern = pattern.replace(/%/g, '%?');
    
    // 允许中间有任意字符（跨行匹配）
    pattern = pattern.replace(/\s+/g, '[\\s\\S]*?');
    
    return {
      field: 'payoutAmount',
      type: payoutAmount.type,
      pattern: pattern,
      // 存储规则数据，而不是handler函数（函数无法序列化）
      ruleData: {
        type: payoutAmount.type,
        details: payoutAmount.details,
        confidence: payoutAmount.confidence
      },
      confidence: payoutAmount.confidence,
      extractedText: extractedText
    };
  }

  /**
   * 提取赔付次数规则
   */
  static extractPayoutCountRule(clauseText, payoutCount) {
    if (!payoutCount.extractedText) {
      return null;
    }

    const extractedText = payoutCount.extractedText;
    let pattern = this.escapeRegex(extractedText);
    
    // 将数字替换为通配符
    pattern = pattern.replace(/\d+/g, '\\d+');
    
    // 允许中间有任意字符
    pattern = pattern.replace(/\s+/g, '[\\s\\S]*?');
    
    return {
      field: 'payoutCount',
      type: payoutCount.type,
      pattern: pattern,
      ruleData: {
        type: payoutCount.type,
        maxCount: payoutCount.maxCount,
        terminateAfterPayout: payoutCount.terminateAfterPayout,
        confidence: payoutCount.confidence
      },
      confidence: payoutCount.confidence,
      extractedText: extractedText
    };
  }

  /**
   * 提取间隔期规则
   */
  static extractIntervalPeriodRule(clauseText, intervalPeriod) {
    if (!intervalPeriod.extractedText || !intervalPeriod.days) {
      return null;
    }

    const extractedText = intervalPeriod.extractedText;
    let pattern = this.escapeRegex(extractedText);
    
    // 将数字替换为通配符
    pattern = pattern.replace(/\d+/g, '\\d+');
    
    // 允许中间有任意字符
    pattern = pattern.replace(/\s+/g, '[\\s\\S]*?');
    
    return {
      field: 'intervalPeriod',
      pattern: pattern,
      ruleData: {
        hasInterval: intervalPeriod.hasInterval,
        days: intervalPeriod.days,
        confidence: intervalPeriod.confidence
      },
      confidence: intervalPeriod.confidence,
      extractedText: extractedText
    };
  }

  /**
   * 提取是否分组规则
   */
  static extractGroupingRule(clauseText, grouping) {
    if (!grouping.extractedText) {
      return null;
    }

    const extractedText = grouping.extractedText;
    let pattern = this.escapeRegex(extractedText);
    pattern = pattern.replace(/\s+/g, '[\\s\\S]*?');
    
    return {
      field: 'grouping',
      pattern: pattern,
      ruleData: {
        isGrouped: grouping.isGrouped,
        groupCount: grouping.groupCount,
        confidence: grouping.confidence
      },
      confidence: grouping.confidence,
      extractedText: extractedText
    };
  }

  /**
   * 提取是否可重复赔付规则
   */
  static extractRepeatablePayoutRule(clauseText, repeatablePayout) {
    if (!repeatablePayout.extractedText) {
      return null;
    }

    const extractedText = repeatablePayout.extractedText;
    let pattern = this.escapeRegex(extractedText);
    pattern = pattern.replace(/\s+/g, '[\\s\\S]*?');
    
    return {
      field: 'repeatablePayout',
      pattern: pattern,
      ruleData: {
        isRepeatable: repeatablePayout.isRepeatable,
        confidence: repeatablePayout.confidence
      },
      confidence: repeatablePayout.confidence,
      extractedText: extractedText
    };
  }

  /**
   * 提取保费豁免规则
   */
  static extractPremiumWaiverRule(clauseText, premiumWaiver) {
    if (!premiumWaiver.extractedText) {
      return null;
    }

    const extractedText = premiumWaiver.extractedText;
    let pattern = this.escapeRegex(extractedText);
    pattern = pattern.replace(/\s+/g, '[\\s\\S]*?');
    
    return {
      field: 'premiumWaiver',
      pattern: pattern,
      ruleData: {
        isWaived: premiumWaiver.isWaived,
        confidence: premiumWaiver.confidence
      },
      confidence: premiumWaiver.confidence,
      extractedText: extractedText
    };
  }

  /**
   * 转义正则表达式特殊字符
   */
  static escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 从规则数据生成handler函数
   */
  static generateHandlerFromRuleData(ruleData) {
    if (!ruleData || !ruleData.ruleData) {
      return null;
    }

    const field = ruleData.field;
    const data = ruleData.ruleData;

    if (field === 'payoutAmount') {
      return (match) => {
        return {
          type: data.type,
          details: JSON.parse(JSON.stringify(data.details)), // 深拷贝
          confidence: data.confidence * 0.9, // 学习到的规则置信度稍低
          extractedText: match[0]
        };
      };
    } else if (field === 'payoutCount') {
      return (match) => {
        return {
          type: data.type,
          maxCount: data.maxCount,
          terminateAfterPayout: data.terminateAfterPayout,
          confidence: data.confidence * 0.9,
          extractedText: match[0]
        };
      };
    } else if (field === 'intervalPeriod') {
      return (match) => {
        return {
          hasInterval: data.hasInterval,
          days: data.days,
          confidence: data.confidence * 0.9,
          extractedText: match[0]
        };
      };
    } else if (field === 'grouping') {
      return (match) => {
        return {
          isGrouped: data.isGrouped,
          groupCount: data.groupCount,
          confidence: data.confidence * 0.9,
          extractedText: match[0]
        };
      };
    } else if (field === 'repeatablePayout') {
      return (match) => {
        return {
          isRepeatable: data.isRepeatable,
          confidence: data.confidence * 0.9,
          extractedText: match[0]
        };
      };
    } else if (field === 'premiumWaiver') {
      return (match) => {
        return {
          isWaived: data.isWaived,
          confidence: data.confidence * 0.9,
          extractedText: match[0]
        };
      };
    }

    return null;
  }
}

