// ==================== 是否豁免保费解析器（职责：仅负责疾病发生是否豁免保费字段的解析）====================
class PremiumWaiverParserService {
  /**
   * 解析疾病发生是否豁免保费
   * @param {string} clauseText - 条款文本
   * @param {string} coverageType - 责任类型
   * @returns {Object} 解析结果 { isWaived, confidence, extractedText }
   */
  static parse(clauseText, coverageType = 'disease') {
    const rules = this.getRules(coverageType);
    return this.applyRules(clauseText, rules);
  }

  static getRules(coverageType) {
    // 是否豁免保费规则主要适用于疾病责任
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

    return bestMatch || { isWaived: true, confidence: 0, extractedText: "未识别" };
  }

  static getDiseaseRules() {
    return [
      {
        name: "premium_waiver",
        // 更宽松：豁免保费、免交保费、保费豁免、豁免后续保费等
        pattern: /(?:豁免保费|免交保费|保费豁免|豁免后续保费|豁免保险费|免交后续保费|免交保险费|豁免|免交)/i,
        handler: (match, originalText) => {
          // 提取完整句子
          let extractedText = match[0];
          if (originalText && match.index !== undefined) {
            const matchStart = match.index;
            const matchEnd = match.index + match[0].length;
            extractedText = TextExtractorService.extractCompleteSentence(matchStart, matchEnd, originalText);
          }
          
          return {
            isWaived: true,
            confidence: 0.90,
            extractedText: extractedText
          };
        }
      },
      {
        name: "no_premium_waiver",
        // 更宽松：不豁免、不免交、不免除保费等
        pattern: /(?:不豁免|不免交|不免除保费|不免除保险费|不免交保费|不免交保险费)/i,
        handler: (match, originalText) => {
          // 提取完整句子
          let extractedText = match[0];
          if (originalText && match.index !== undefined) {
            const matchStart = match.index;
            const matchEnd = match.index + match[0].length;
            extractedText = TextExtractorService.extractCompleteSentence(matchStart, matchEnd, originalText);
          }
          
          return {
            isWaived: false,
            confidence: 0.90,
            extractedText: extractedText
          };
        }
      }
    ];
  }
}


