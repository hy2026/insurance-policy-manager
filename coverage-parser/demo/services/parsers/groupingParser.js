// ==================== 重疾分组解析器（职责：仅负责重疾分组字段的解析）====================
class GroupingParserService {
  /**
   * 解析重疾分组
   * @param {string} clauseText - 条款文本
   * @param {string} coverageType - 责任类型
   * @returns {Object} 解析结果 { isGrouped, groupCount, confidence, extractedText }
   */
  static parse(clauseText, coverageType = 'disease') {
    const rules = this.getRules(coverageType);
    return this.applyRules(clauseText, rules);
  }

  static getRules(coverageType) {
    // 分组规则主要适用于疾病责任
    if (coverageType === 'disease') {
      return this.getDiseaseRules();
    }
    return [];
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

    return bestMatch || { isGrouped: false, confidence: 0, extractedText: "未识别" };
  }

  static getDiseaseRules() {
    return [
      {
        name: "no_grouping",
        // 更宽松：不分组、不设分组、无分组等
        pattern: /(?:不分组|不设分组|无分组|所有重大疾病共享|重大疾病不分组|疾病不分组)/i,
        handler: (match, originalText) => {
          // 提取完整句子
          let extractedText = match[0];
          if (originalText && match.index !== undefined) {
            const matchStart = match.index;
            const matchEnd = match.index + match[0].length;
            extractedText = TextExtractorService.extractCompleteSentence(matchStart, matchEnd, originalText);
          }
          
          return {
            isGrouped: false,
            confidence: 0.90,
            extractedText: extractedText
          };
        }
      },
      {
        name: "has_grouping_with_count",
        // 更宽松：分N组、分为N组、分成N组等
        pattern: /(?:分|分为|分成|划分为|划分为)\s*(\d+)\s*(?:组|个组|个分组)/i,
        handler: (match, originalText) => {
          const groupCount = parseInt(match[1]);
          
          // 提取完整句子
          let extractedText = match[0];
          if (originalText && match.index !== undefined) {
            const matchStart = match.index;
            const matchEnd = match.index + match[0].length;
            extractedText = TextExtractorService.extractCompleteSentence(matchStart, matchEnd, originalText);
          }
          
          return {
            isGrouped: true,
            groupCount: groupCount,
            confidence: 0.95,
            extractedText: extractedText
          };
        }
      },
      {
        name: "has_grouping_generic",
        // 更宽松：分组、设分组、有分组等
        pattern: /(?:分组|设分组|有分组|存在分组|进行分组)/i,
        handler: (match, originalText) => {
          // 提取完整句子
          let extractedText = match[0];
          if (originalText && match.index !== undefined) {
            const matchStart = match.index;
            const matchEnd = match.index + match[0].length;
            extractedText = TextExtractorService.extractCompleteSentence(matchStart, matchEnd, originalText);
          }
          
          return {
            isGrouped: true,
            confidence: 0.85,
            extractedText: extractedText
          };
        }
      }
    ];
  }
}








