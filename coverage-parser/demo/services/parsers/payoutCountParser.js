// ==================== 赔付次数解析器（职责：仅负责赔付次数字段的解析）====================
class PayoutCountParserService {
  /**
   * 解析赔付次数
   * @param {string} clauseText - 条款文本
   * @param {string} coverageType - 责任类型
   * @returns {Object} 解析结果 { type, maxCount, terminateAfterPayout, confidence, extractedText }
   */
  static parse(clauseText, coverageType = 'disease') {
    const rules = this.getRules(coverageType);
    return this.applyRules(clauseText, rules);
  }

  static getRules(coverageType) {
    switch(coverageType) {
      case 'disease':
        return this.getDiseaseRules();
      case 'death':
        return this.getDeathRules();
      case 'accident':
        return this.getAccidentRules();
      case 'annuity':
        return this.getAnnuityRules();
      default:
        return this.getDiseaseRules();
    }
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

    return bestMatch || { type: 'unknown', confidence: 0, extractedText: "未识别" };
  }

  static getDiseaseRules() {
    return [
      {
        name: "multiple_payout_with_limit",
        // 优先匹配：以N次为限、给付以N次为限、以N次为限等（更具体的模式）
        // 支持中文数字和阿拉伯数字，使用捕获组提取数字
        pattern: /(?:给付以|以|给付|支付|赔偿|理赔)\s*((?:一|1|二|2|三|3|四|4|五|5|六|6|七|7|八|8|九|9|十|10|\d+))\s*次\s*(?:为限|为限时|为限后|终止)/i,
        handler: (match, originalText) => {
          // 将中文数字转换为阿拉伯数字
          const chineseNumbers = {
            '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
            '六': 6, '七': 7, '八': 8, '九': 9, '十': 10
          };
          const matchedText = match[1];
          const count = chineseNumbers[matchedText] || parseInt(matchedText) || 1;
          
          // 提取完整句子
          let extractedText = match[0];
          if (originalText && match.index !== undefined) {
            const matchStart = match.index;
            const matchEnd = match.index + match[0].length;
            extractedText = TextExtractorService.extractCompleteSentence(matchStart, matchEnd, originalText);
          }
          
          return {
            type: count === 1 ? "single" : "multiple",
            maxCount: count,
            terminateAfterPayout: count === 1,
            confidence: 0.99, // 提高置信度，确保优先于 single_payout
            extractedText: extractedText
          };
        }
      },
      {
        name: "multiple_payout_with_count",
        // 更宽松：最多/至多/不超过 N次
        pattern: /(?:最多|至多|不超过|最多给付|最多支付|最多赔偿|最多理赔)\s*(\d+)\s*次/i,
        handler: (match, originalText) => {
          // 提取完整句子
          let extractedText = match[0];
          if (originalText && match.index !== undefined) {
            const matchStart = match.index;
            const matchEnd = match.index + match[0].length;
            extractedText = TextExtractorService.extractCompleteSentence(matchStart, matchEnd, originalText);
          }
          
          return {
            type: "multiple",
            maxCount: parseInt(match[1]),
            terminateAfterPayout: false,
            confidence: 0.95,
            extractedText: extractedText
          };
        }
      },
      {
        name: "single_payout",
        // 更宽松：一次、1次、以一次为限、合同终止等（但排除"以N次为限"的情况）
        // 使用负向前瞻，排除"以N次为限"的情况（支持中文数字和阿拉伯数字）
        pattern: /(?:一次|1次|壹次|单次|仅一次|以一次为限|给付以一次为限|本合同终止|合同终止|本合同解除|合同解除|保险责任终止|责任终止)(?!.*(?:给付以|以|给付|支付|赔偿|理赔)\s*(?:一|1|二|2|三|3|四|4|五|5|六|6|七|7|八|8|九|9|十|10|\d+)\s*次\s*(?:为限|为限时|为限后))/i,
        handler: (match, originalText) => {
          // 提取完整句子
          let extractedText = match[0];
          if (originalText && match.index !== undefined) {
            const matchStart = match.index;
            const matchEnd = match.index + match[0].length;
            extractedText = TextExtractorService.extractCompleteSentence(matchStart, matchEnd, originalText);
          }
          
          return {
            type: "single",
            maxCount: 1,
            terminateAfterPayout: true,
            confidence: 0.98,
            extractedText: extractedText
          };
        }
      },
      {
        name: "multiple_payout_unlimited",
        // 更宽松：多次、不限次数、可多次、合同继续有效等
        pattern: /(?:多次|不限次数|可多次|可重复|不限|无限制|本合同继续有效|合同继续有效|保险责任继续有效|责任继续有效)/i,
        handler: (match, originalText) => {
          // 提取完整句子
          let extractedText = match[0];
          if (originalText && match.index !== undefined) {
            const matchStart = match.index;
            const matchEnd = match.index + match[0].length;
            extractedText = TextExtractorService.extractCompleteSentence(matchStart, matchEnd, originalText);
          }
          
          return {
            type: "multiple",
            terminateAfterPayout: false,
            confidence: 0.85,
            extractedText: extractedText
          };
        }
      }
    ];
  }

  static getDeathRules() {
    return [
      {
        name: "single_payout",
        pattern: /(?:一次|1次|壹次|单次|仅一次|以一次为限)/i,
        handler: (match, originalText) => {
          // 提取完整句子
          let extractedText = match[0];
          if (originalText && match.index !== undefined) {
            const matchStart = match.index;
            const matchEnd = match.index + match[0].length;
            extractedText = TextExtractorService.extractCompleteSentence(matchStart, matchEnd, originalText);
          }
          
          return {
            type: "single",
            maxCount: 1,
            terminateAfterPayout: true,
            confidence: 0.98,
            extractedText: extractedText
          };
        }
      }
    ];
  }

  static getAccidentRules() {
    return [
      {
        name: "single_payout",
        pattern: /(?:一次|1次|壹次|单次|仅一次|以一次为限)/i,
        handler: (match, originalText) => {
          // 提取完整句子
          let extractedText = match[0];
          if (originalText && match.index !== undefined) {
            const matchStart = match.index;
            const matchEnd = match.index + match[0].length;
            extractedText = TextExtractorService.extractCompleteSentence(matchStart, matchEnd, originalText);
          }
          
          return {
            type: "single",
            maxCount: 1,
            terminateAfterPayout: true,
            confidence: 0.98,
            extractedText: extractedText
          };
        }
      }
    ];
  }

  static getAnnuityRules() {
    return [
      {
        name: "lifetime_payout",
        // 更宽松：终身、终身领取、终身给付等
        pattern: /(?:终身|终身领取|终身给付|终身支付|终身赔偿|终身保障)/i,
        handler: (match, originalText) => {
          // 提取完整句子
          let extractedText = match[0];
          if (originalText && match.index !== undefined) {
            const matchStart = match.index;
            const matchEnd = match.index + match[0].length;
            extractedText = TextExtractorService.extractCompleteSentence(matchStart, matchEnd, originalText);
          }
          
          return {
            type: "lifetime",
            terminateAfterPayout: false,
            confidence: 0.90,
            extractedText: extractedText
          };
        }
      }
    ];
  }

}








