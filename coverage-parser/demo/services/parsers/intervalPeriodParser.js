// ==================== 间隔期解析器（职责：仅负责间隔期字段的解析）====================
class IntervalPeriodParserService {
  /**
   * 解析间隔期
   * @param {string} clauseText - 条款文本
   * @param {string} coverageType - 责任类型
   * @returns {Object} 解析结果 { hasInterval, days, years, confidence, extractedText }
   */
  static parse(clauseText, coverageType = 'disease') {
    const rules = this.getRules(coverageType);
    return this.applyRules(clauseText, rules);
  }

  static getRules(coverageType) {
    // 间隔期规则通常对所有责任类型都适用
    return this.getCommonRules();
  }

  static applyRules(text, rules) {
    let bestMatch = null;
    let bestConfidence = 0;

    for (const rule of rules) {
      const match = text.match(rule.pattern);
      if (match && rule.handler) {
        // 传递原始文本给handler，以便提取完整句子
        const result = rule.handler(match, text);
        if (result && result.confidence > bestConfidence) {
          bestConfidence = result.confidence;
          bestMatch = result;
        }
      }
    }

    return bestMatch || { hasInterval: false, confidence: 0, extractedText: "未识别" };
  }

  static getCommonRules() {
    return [
      {
        name: "no_interval",
        // 更宽松：无间隔期、不设间隔期、无间隔要求等
        pattern: /(?:无间隔期|不设间隔期|无间隔要求|无间隔|不设间隔|无间隔时间|无间隔期间)/i,
        handler: (match, originalText) => {
          // 提取完整句子
          let extractedText = match[0];
          if (originalText && match.index !== undefined) {
            const matchStart = match.index;
            const matchEnd = match.index + match[0].length;
            extractedText = TextExtractorService.extractCompleteSentence(matchStart, matchEnd, originalText);
          }
          
          return {
            hasInterval: false,
            confidence: 0.95,
            extractedText: extractedText
          };
        }
      },
      {
        name: "interval_days",
        // 更宽松：间隔N天/日
        pattern: /间隔[^0-9]*?(\d+)\s*(?:天|日|日数|天数)/i,
        handler: (match, originalText) => {
          // 提取完整句子
          let extractedText = match[0];
          if (originalText && match.index !== undefined) {
            const matchStart = match.index;
            const matchEnd = match.index + match[0].length;
            extractedText = TextExtractorService.extractCompleteSentence(matchStart, matchEnd, originalText);
          }
          
          return {
            hasInterval: true,
            days: parseInt(match[1]),
            confidence: 0.90,
            extractedText: extractedText
          };
        }
      },
      {
        name: "interval_years",
        // 更宽松：间隔N年
        pattern: /间隔[^0-9]*?(\d+)\s*(?:年|周年|年度)/i,
        handler: (match, originalText) => {
          // 提取完整句子
          let extractedText = match[0];
          if (originalText && match.index !== undefined) {
            const matchStart = match.index;
            const matchEnd = match.index + match[0].length;
            extractedText = TextExtractorService.extractCompleteSentence(matchStart, matchEnd, originalText);
          }
          
          return {
            hasInterval: true,
            days: parseInt(match[1]) * 365,
            years: parseInt(match[1]),
            confidence: 0.90,
            extractedText: extractedText
          };
        }
      },
      {
        name: "interval_months",
        // 新增：间隔N个月
        pattern: /间隔[^0-9]*?(\d+)\s*(?:个月|月)/i,
        handler: (match, originalText) => {
          // 提取完整句子
          let extractedText = match[0];
          if (originalText && match.index !== undefined) {
            const matchStart = match.index;
            const matchEnd = match.index + match[0].length;
            extractedText = TextExtractorService.extractCompleteSentence(matchStart, matchEnd, originalText);
          }
          
          return {
            hasInterval: true,
            days: parseInt(match[1]) * 30,
            months: parseInt(match[1]),
            confidence: 0.90,
            extractedText: extractedText
          };
        }
      }
    ];
  }
}








