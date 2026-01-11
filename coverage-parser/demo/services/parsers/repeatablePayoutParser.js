// ==================== 是否可以重复赔付解析器（职责：仅负责是否可以重复赔付字段的解析）====================
class RepeatablePayoutParserService {
  /**
   * 解析是否可以重复赔付
   * @param {string} clauseText - 条款文本
   * @param {string} coverageType - 责任类型
   * @returns {Object} 解析结果 { isRepeatable, confidence, extractedText }
   */
  static parse(clauseText, coverageType = 'disease') {
    const rules = this.getRules(coverageType);
    return this.applyRules(clauseText, rules);
  }

  static getRules(coverageType) {
    // 是否可以重复赔付规则主要适用于疾病责任
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
        // 传递原始文本和匹配信息给handler，以便提取更完整的上下文
        const result = rule.handler(match, text);
        if (result && result.confidence > bestConfidence) {
          bestConfidence = result.confidence;
          bestMatch = result;
        }
      }
    }

    return bestMatch || { isRepeatable: true, confidence: 0, extractedText: "未识别" };
  }

  static getDiseaseRules() {
    return [
      {
        name: "not_repeatable_each_disease",
        // 最优先匹配：每种疾病仅限一次/每种仅限给付一次等，说明同一种疾病不能重复赔付
        pattern: /每种[^仅]*?(?:疾病|病)[^仅]*?仅限[^一]*?(?:给付|支付|赔偿|理赔)?[^一]*?一次|每种[^一]*?仅限[^一]*?(?:给付|支付|赔偿|理赔)[^一]*?一次/i,
        handler: (match, originalText) => {
          // 提取完整句子
          let extractedText = match[0];
          if (originalText && match.index !== undefined) {
            const matchStart = match.index;
            const matchEnd = match.index + match[0].length;
            extractedText = TextExtractorService.extractCompleteSentence(matchStart, matchEnd, originalText);
          }
          
          return {
            isRepeatable: false,
            confidence: 0.98,
            extractedText: extractedText
          };
        }
      },
      {
        name: "repeatable_with_limit",
        // 优先匹配：以N次为限（N>1），说明可以重复赔付，但有次数限制
        // 支持中文数字和阿拉伯数字，使用捕获组提取数字
        pattern: /(?:给付以|以|给付|支付|赔偿|理赔)\s*((?:一|1|二|2|三|3|四|4|五|5|六|6|七|7|八|8|九|9|十|10|\d+))\s*次\s*(?:为限|为限时|为限后)/i,
        handler: (match, originalText) => {
          // 将中文数字转换为阿拉伯数字
          const chineseNumbers = {
            '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
            '六': 6, '七': 7, '八': 8, '九': 9, '十': 10
          };
          const matchedText = match[1];
          const count = chineseNumbers[matchedText] || parseInt(matchedText) || 1;
          
          // 检查是否有"每种仅限一次"的限制（同一种疾病不能重复）
          const hasEachLimit = /每种[^仅]*?(?:疾病|病)[^仅]*?仅限[^一]*?(?:给付|支付|赔偿|理赔)?[^一]*?一次|每种[^一]*?仅限[^一]*?(?:给付|支付|赔偿|理赔)[^一]*?一次/i.test(originalText);
          
          // 提取完整句子（如果存在"每种仅限一次"的限制，需要包含相关句子）
          let extractedText = match[0];
          if (originalText && match.index !== undefined) {
            const matchStart = match.index;
            const matchEnd = match.index + match[0].length;
            extractedText = TextExtractorService.extractCompleteSentence(matchStart, matchEnd, originalText, hasEachLimit);
          }
          
          // 如果次数大于1，且没有"每种仅限一次"的限制，说明可以重复赔付
          // 如果有"每种仅限一次"的限制，说明同一种疾病不能重复赔付
          if (count > 1 && !hasEachLimit) {
            return {
              isRepeatable: true,
              confidence: 0.95,
              extractedText: extractedText
            };
          }
          // 如果次数等于1，或者有"每种仅限一次"的限制，说明不可重复
          return {
            isRepeatable: false,
            confidence: hasEachLimit ? 0.98 : 0.95,
            extractedText: extractedText
          };
        }
      },
      {
        name: "repeatable_payout",
        // 更宽松：可重复、可多次、不限次数、多次赔付等
        pattern: /(?:可重复|可多次|不限次数|多次赔付|多次给付|多次理赔|可重复赔付|可重复给付|可重复理赔)/i,
        handler: (match, originalText) => {
          // 提取完整句子
          let extractedText = match[0];
          if (originalText && match.index !== undefined) {
            const matchStart = match.index;
            const matchEnd = match.index + match[0].length;
            extractedText = TextExtractorService.extractCompleteSentence(matchStart, matchEnd, originalText);
          }
          
          return {
            isRepeatable: true,
            confidence: 0.90,
            extractedText: extractedText
          };
        }
      },
      {
        name: "not_repeatable",
        // 更宽松：不可重复、仅一次、以一次为限、单次赔付等
        // 注意：不包含"合同终止"，因为合同终止可能只是某个场景下的终止，不代表整体不可重复
        pattern: /(?:不可重复|不重复|仅一次|以一次为限|单次赔付)/i,
        handler: (match, originalText) => {
          // 提取完整句子
          let extractedText = match[0];
          if (originalText && match.index !== undefined) {
            const matchStart = match.index;
            const matchEnd = match.index + match[0].length;
            extractedText = TextExtractorService.extractCompleteSentence(matchStart, matchEnd, originalText);
          }
          
          return {
            isRepeatable: false,
            confidence: 0.90,
            extractedText: extractedText
          };
        }
      }
    ];
  }
}


