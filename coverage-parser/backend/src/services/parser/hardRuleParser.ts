// ==================== 硬规则解析器（快速识别常见模式）====================
/**
 * 硬规则解析器：使用正则表达式和模式匹配快速识别常见的保险条款模式
 * 目的：避免所有请求都调用大模型，节省token和时间
 */

export interface HardRuleResult {
  matched: boolean; // 是否匹配到硬规则
  confidence: number; // 匹配置信度
  result?: any; // 解析结果（如果matched=true）
  reason?: string; // 匹配原因或未匹配原因
}

export class HardRuleParser {
  /**
   * 尝试使用硬规则解析条款
   * @param clauseText 条款文本
   * @param coverageType 责任类型
   * @returns 硬规则解析结果
   */
  static parse(clauseText: string, coverageType: string): HardRuleResult {
    // 清理文本（去除多余空格、换行）
    const cleanText = clauseText.replace(/\s+/g, ' ').trim();

    // 注意：复杂度检测已在parseService中完成，这里只做简单模式匹配

    // 1. 识别"已交保险费"模式（最常见）
    const paidPremiumResult = this.matchPaidPremium(cleanText);
    if (paidPremiumResult.matched) {
      return paidPremiumResult;
    }

    // 2. 识别"基本保额的X%"模式
    const percentageResult = this.matchPercentage(cleanText);
    if (percentageResult.matched) {
      return percentageResult;
    }

    // 3. 识别"基本保额"模式（100%）
    const basicSumResult = this.matchBasicSum(cleanText);
    if (basicSumResult.matched) {
      return basicSumResult;
    }

    // 4. 识别复利公式模式
    const formulaResult = this.matchFormula(cleanText);
    if (formulaResult.matched) {
      return formulaResult;
    }

    // 未匹配到明确规则
    return {
      matched: false,
      confidence: 0,
      reason: '条款较复杂，需要大模型深度分析'
    };
  }

  /**
   * 匹配"已交保险费"模式
   */
  private static matchPaidPremium(text: string): HardRuleResult {
    const patterns = [
      /已交保险费/i,
      /累计已交保险费/i,
      /已支付的保险费/i,
      /根据本合同约定已支付的保险费/i,
      /您根据本合同约定已支付的保险费/i
    ];

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        // 提取原文片段
        const match = text.match(new RegExp(`.{0,50}${pattern.source}.{0,50}`, 'i'));
        const extractedText = match ? match[0] : text.substring(0, 100);

        return {
          matched: true,
          confidence: 0.9,
          reason: '匹配到"已交保险费"关键词',
          result: {
            payoutAmount: {
              type: 'paid_premium',
              details: {
                base: 'paidPremium'
              },
              confidence: 0.9,
              extractedText: extractedText
            },
            payoutCount: { type: 'single', confidence: 0.8 },
            overallConfidence: 0.85,
            naturalLanguageDescription: '按累计已交保险费给付保险金。',
            parseMethod: 'hard_rule'
          }
        };
      }
    }

    return { matched: false, confidence: 0 };
  }

  /**
   * 匹配"基本保额的X%"模式
   */
  private static matchPercentage(text: string): HardRuleResult {
    // 匹配"基本保额的XX%"或"基本保险金额的XX%"
    const pattern = /基本保[险额]*金?额?的?\s*(\d+(?:\.\d+)?)\s*%/i;
    const match = text.match(pattern);

    if (match) {
      const percentage = parseFloat(match[1]);
      const extractedText = text.substring(
        Math.max(0, match.index! - 50),
        Math.min(text.length, match.index! + match[0].length + 50)
      );

      return {
        matched: true,
        confidence: 0.95,
        reason: `匹配到"基本保额的${percentage}%"模式`,
        result: {
          payoutAmount: {
            type: 'percentage',
            details: {
              percentage: percentage,
              base: 'basicSumInsured'
            },
            confidence: 0.95,
            extractedText: extractedText
          },
          payoutCount: { type: 'single', confidence: 0.8 },
          overallConfidence: 0.9,
          naturalLanguageDescription: `按基本保额的${percentage}%给付保险金。`,
          parseMethod: 'hard_rule'
        }
      };
    }

    return { matched: false, confidence: 0 };
  }

  /**
   * 匹配"基本保额"模式（暗示100%）
   */
  private static matchBasicSum(text: string): HardRuleResult {
    // 匹配"给付基本保额"、"按基本保险金额给付"、"按本合同保险金额给付"等
    const patterns = [
      /给付\s*基本保[险额]*金?额?(?!的\s*\d)/i,
      /按\s*基本保[险额]*金?额?\s*给付(?!的\s*\d)/i,
      /按\s*本合同\s*保[险额]*金?额?\s*给付/i,  // 新增：按本合同保险金额给付
      /按\s*保[险额]*金?额?\s*给付(?!的\s*\d)/i,  // 新增：按保险金额给付（更宽松）
      /给付\s*保[险额]*金?额?(?!的\s*\d)/i  // 新增：给付保险金额
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const extractedText = text.substring(
          Math.max(0, match.index! - 50),
          Math.min(text.length, match.index! + match[0].length + 50)
        );

        return {
          matched: true,
          confidence: 0.85,
          reason: '匹配到"基本保额"关键词（暗示100%）',
          result: {
            payoutAmount: {
              type: 'percentage',
              details: {
                percentage: 100,
                base: 'basicSumInsured'
              },
              confidence: 0.85,
              extractedText: extractedText
            },
            payoutCount: { type: 'single', confidence: 0.8 },
            overallConfidence: 0.85,
            naturalLanguageDescription: '按基本保额的100%给付保险金。',
            parseMethod: 'hard_rule'
          }
        };
      }
    }

    return { matched: false, confidence: 0 };
  }

  /**
   * 匹配复利公式模式
   */
  private static matchFormula(text: string): HardRuleResult {
    // 匹配复利公式，例如：(1+3.5%)^n 或 1.035^n
    const patterns = [
      /\(1\s*\+\s*(\d+(?:\.\d+)?)\s*%\s*\)\s*\^\s*n/i,
      /(\d+(?:\.\d+)?)\s*\^\s*n/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        // 提取利率
        let interestRate = 3.5; // 默认3.5%
        if (match[1]) {
          interestRate = parseFloat(match[1]);
          if (interestRate > 1) {
            // 如果是1.035这种形式，转换为3.5
            interestRate = (interestRate - 1) * 100;
          }
        }

        const extractedText = text.substring(
          Math.max(0, match.index! - 50),
          Math.min(text.length, match.index! + match[0].length + 50)
        );

        return {
          matched: true,
          confidence: 0.9,
          reason: `匹配到复利公式（利率${interestRate}%）`,
          result: {
            payoutAmount: {
              type: 'tiered',
              details: {
                tiers: [{
                  period: '保单有效期',
                  value: `基本保额*(1+${interestRate}%)^n`,
                  unit: 'formula',
                  formulaType: 'compound',
                  interestRate: interestRate
                }]
              },
              confidence: 0.9,
              extractedText: extractedText
            },
            payoutCount: { type: 'single', confidence: 0.8 },
            overallConfidence: 0.85,
            naturalLanguageDescription: `按基本保额的复利公式计算（年利率${interestRate}%），随时间递增。`,
            parseMethod: 'hard_rule'
          }
        };
      }
    }

    return { matched: false, confidence: 0 };
  }

  /**
   * 提取等待期
   */

  /**
   * ============================================
   * 🎯 新增：解析其他字段（赔付次数、间隔期、分组、重复赔付、豁免保费）
   * ============================================
   */
  static parseAdditionalFields(text: string): {
    payoutCount?: any;
    intervalPeriod?: any;
    grouping?: any;
    repeatablePayout?: any;
    premiumWaiver?: any;
  } {
    const cleanText = text.replace(/\s+/g, ' ').trim();
    const result: any = {};

    // 1. 赔付次数
    result.payoutCount = this.extractPayoutCount(cleanText);
    
    // 2. 间隔期
    result.intervalPeriod = this.extractIntervalPeriod(cleanText);
    
    // 3. 是否分组
    result.grouping = this.extractGrouping(cleanText);
    
    // 4. 是否可重复赔付
    result.repeatablePayout = this.extractRepeatablePayout(cleanText);
    
    // 5. 豁免保费
    result.premiumWaiver = this.extractPremiumWaiver(cleanText);

    console.log('📋 [HardRuleParser] 解析其他字段结果:', result);
    return result;
  }

  /**
   * 提取赔付次数
   * ⚠️ 注意：优先级很重要！明确次数（"以X次为限"）应该优先于模糊的单次赔付
   */
  private static extractPayoutCount(text: string): any {
    // 1. 明确次数（优先级最高）："最多X次"、"可赔付X次"、"以X次为限"
    // 🔥 支持数字（3）和汉字（三）
    const countPatterns = [
      /以\s*([一二三四五六七八九十\d]+)\s*次\s*为\s*限/i,     // "以三次为限" 或 "以3次为限"
      /最多\s*[可]?\s*赔付?\s*([一二三四五六七八九十\d]+)\s*次/i,  // "最多赔付三次"
      /[可以]?\s*赔付\s*([一二三四五六七八九十\d]+)\s*次/i,      // "可赔付三次"
      /给付\s*([一二三四五六七八九十\d]+)\s*次/i,               // "给付三次"
      /累计\s*[最多]?\s*给付\s*([一二三四五六七八九十\d]+)\s*次/i, // "累计给付三次"
      /次数\s*达到\s*([一二三四五六七八九十\d]+)\s*次/i,         // "次数达到三次"
      /给付.*次数.*达到\s*([一二三四五六七八九十\d]+)/i           // "给付...次数达到三次"
    ];
    
    for (const pattern of countPatterns) {
      const match = text.match(pattern);
      if (match) {
        const count = this.parseChineseOrArabicNumber(match[1]);
        const extractedText = this.extractContextAround(text, match.index!, match[0].length);
        return {
          type: count === 1 ? 'single' : 'multiple',
          maxCount: count,
          confidence: 0.95,
          extractedText
        };
      }
    }

    // 2. 单次赔付（优先级较低，且更严格的匹配）
    const singlePatterns = [
      /单次\s*赔付/i,                                 // "单次赔付"
      /一次性\s*赔付/i,                               // "一次性赔付"
      /仅\s*[赔给]付\s*[一1]\s*次/i,                  // "仅赔付一次"、"仅给付一次"
      /[赔给]付\s*[一1]\s*次.*终止/i,                 // "赔付一次后终止"、"给付一次后终止"
      /[一1]\s*次性?\s*[赔给]付/i,                    // "一次赔付"、"一次性给付"
      /[赔给]付.*保险金.*[，,。、].*[本该]?合同终止/i,  // "给付保险金，本合同终止"
      /[本该]?合同终止/i                              // "本合同终止"（最宽松的规则）
    ];
    
    // ⚠️ 排除：如果文本中有"以X次为限"（X>1），则不应该匹配单次
    if (!/以\s*[二三四五六七八九十2-9]\s*次\s*为\s*限/i.test(text)) {
      for (const pattern of singlePatterns) {
        if (pattern.test(text)) {
          const match = text.match(pattern);
          const extractedText = match ? this.extractContextAround(text, match.index!, match[0].length) : '';
          return {
            type: 'single',
            maxCount: 1,
            confidence: 0.9,
            extractedText
          };
        }
      }
    }

    // 3. 多次赔付（没有明确次数）
    const multiplePatterns = [
      /多次\s*赔付/i,
      /可\s*重复\s*赔付/i,
      /不限\s*次数/i
    ];
    
    for (const pattern of multiplePatterns) {
      if (pattern.test(text)) {
        const match = text.match(pattern);
        const extractedText = match ? this.extractContextAround(text, match.index!, match[0].length) : '';
        return {
          type: 'multiple',
          maxCount: null, // 次数未明确
          confidence: 0.8,
          extractedText
        };
      }
    }

    // 未匹配到
    return null;
  }

  /**
   * 辅助方法：解析中文或阿拉伯数字
   */
  private static parseChineseOrArabicNumber(numStr: string): number {
    // 如果是阿拉伯数字，直接解析
    const arabicNum = parseInt(numStr);
    if (!isNaN(arabicNum)) {
      return arabicNum;
    }
    
    // 如果是中文数字，转换
    const chineseNumMap: { [key: string]: number } = {
      '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
      '六': 6, '七': 7, '八': 8, '九': 9, '十': 10
    };
    
    // 处理简单的中文数字
    if (chineseNumMap[numStr]) {
      return chineseNumMap[numStr];
    }
    
    // 处理"十X"、"X十"、"X十X"等复杂情况
    if (numStr.includes('十')) {
      if (numStr === '十') return 10;
      if (numStr.startsWith('十')) {
        // "十五" -> 15
        const lastChar = numStr[1];
        return 10 + (chineseNumMap[lastChar] || 0);
      }
      if (numStr.endsWith('十')) {
        // "二十" -> 20
        const firstChar = numStr[0];
        return (chineseNumMap[firstChar] || 1) * 10;
      }
      // "二十五" -> 25
      const parts = numStr.split('十');
      const tens = chineseNumMap[parts[0]] || 1;
      const ones = chineseNumMap[parts[1]] || 0;
      return tens * 10 + ones;
    }
    
    // 无法识别，返回1
    console.warn(`⚠️ [HardRuleParser] 无法解析数字: "${numStr}"，默认返回1`);
    return 1;
  }

  /**
   * 提取间隔期
   */
  private static extractIntervalPeriod(text: string): any {
    // ❌ 排除关键词：如果包含这些，直接返回null
    const excludePatterns = [
      /犹豫期/i,
      /等待期/i,
      /观察期/i,
      /宽限期/i,
      /复效期/i,
      /冷静期/i,
      /免赔期/i
    ];
    
    for (const pattern of excludePatterns) {
      if (pattern.test(text)) {
        return null; // 不提取
      }
    }

    // ✅ 匹配模式（按优先级排序）
    const patterns = [
      // 1. 明确的"间隔期"、"间隔"
      { 
        regex: /间隔期?\s*[为是需]?\s*(\d+)\s*(天|日|年|个月|月)/i,
        context: '间隔期'
      },
      { 
        regex: /(\d+)\s*(天|日|年|个月|月)\s*间隔期?/i,
        context: '间隔期'
      },
      
      // 2. "间隔天数" + 数字（支持"的"、空格等分隔符）
      {
        regex: /间隔.*?天数.*?(\d+)\s*(天|日)/i,  // 更宽松：支持"间隔的天数"
        context: '间隔天数'
      },
      {
        regex: /间隔.*?天数.*?达.*?(\d+)/i,  // 更宽松："间隔的天数达90日"
        context: '间隔天数达到'
      },
      
      // 3. "相邻两次间隔"、"间隔至少"（简化模式，优先级较高）
      {
        regex: /相邻.*?两.*?次.*?间隔.*?(至少)?\s*(\d+)\s*(天|日|年|个月|月)/i,
        context: '相邻两次间隔'
      },
      {
        regex: /间隔.*?至少.*?(\d+)\s*(天|日|年|个月|月)/i,
        context: '间隔至少'
      },
      
      // 4. "两次" + 动作 + 时间要求（支持各种分隔符）
      {
        regex: /[前后相两].*?两.*?[种次].*?[确诊赔付给付].*?[之间的].*?间隔.*?(\d+)\s*(天|日|年|个月|月)/i,
        context: '两次之间间隔'
      },
      {
        regex: /[前后].*?两.*?[种次].*?[确诊赔付给付].*?间隔.*?天数.*?(\d+)/i,
        context: '前后两次间隔天数'
      },
      
      // 5. "两次" + 时间要求（不含"间隔"词）
      {
        regex: /两.*?次.*?[确诊赔付给付].*?[需须应].*?(超过|满|达到|不少于)?\s*(\d+)\s*(天|日|年|个月|月)/i,
        context: '两次确诊/赔付'
      },
      
      // 6. "前后两次"
      {
        regex: /前后.*?两次.*?[需须应].*?(超过|满|达到)?\s*(\d+)\s*(天|日|年|个月|月)/i,
        context: '前后两次'
      },
      
      // 7. "相隔/相距/距离"
      {
        regex: /[相]?[隔距]\s*(\d+)\s*(天|日|年|个月|月)\s*(以上|以下)?/i,
        context: '相隔/相距'
      },
      
      // 8. "第一次" 与 "第二次"
      {
        regex: /第[二2]次.*?距[离]?.*?第[一1]次.*?[需须应].*?(超过|满|达到)?\s*(\d+)\s*(天|日|年|个月|月)/i,
        context: '第一次与第二次'
      },
      
      // 9. "上一次/前一次" + 距离
      {
        regex: /距.*?[上前].*?一次.*?(超过|满|达到)?\s*(\d+)\s*(天|日|年|个月|月)/i,
        context: '上一次'
      },
      
      // 10. "再次/下次" + 时间要求（但不包含"间隔"）
      {
        regex: /[再下].*?次.*?[需须应].*?(超过|满|达到)?\s*(\d+)\s*(天|日|年|个月|月)/i,
        context: '再次/下次'
      }
    ];

    for (const { regex, context } of patterns) {
      const match = text.match(regex);
      if (match) {
        // 提取数值（可能在不同位置）
        let value = 0;
        let unit = '';
        
        // 尝试从捕获组中提取数字和单位
        for (let i = 1; i < match.length; i++) {
          if (match[i] && /^\d+$/.test(match[i])) {
            value = parseInt(match[i]);
          }
          if (match[i] && /^(天|日|年|个月|月)$/.test(match[i])) {
            unit = match[i];
          }
        }
        
        // 如果没有找到单位，默认为"天"或"日"
        if (!unit && value > 0) {
          if (/日/.test(match[0])) {
            unit = '日';
          } else {
            unit = '天';
          }
        }
        
        if (value > 0) {
          // 转换为天数
          let days = value;
          if (unit.includes('年')) days = value * 365;
          else if (unit.includes('月')) days = value * 30;
          
          const extractedText = this.extractContextAround(
            text, match.index!, match[0].length, 100
          );
          
          return {
            hasInterval: days > 0,  // 🔥 前端期望的字段名
            days: days,             // 🔥 前端期望的字段名
            value,                  // 保留原有字段（向后兼容）
            unit,                   // 保留原有字段
            confidence: 0.9,
            extractedText
          };
        }
      }
    }

    return null;
  }

  /**
   * 提取是否分组
   */
  private static extractGrouping(text: string): any {
    // 1. 明确分组："分X组"
    const groupedPattern = /[分为]\s*([一二三四五六七八九十\d]+)\s*组/i;
    const groupedMatch = text.match(groupedPattern);
    if (groupedMatch) {
      const groupCount = this.parseChineseOrArabicNumber(groupedMatch[1]);
      const extractedText = this.extractContextAround(text, groupedMatch.index!, groupedMatch[0].length);
      return {
        isGrouped: true,   // 🔥 前端期望的字段名
        groupCount: groupCount,
        type: 'grouped',   // 保留原有字段
        confidence: 0.95,
        extractedText
      };
    }

    // 2. 明确不分组
    const notGroupedPatterns = [
      /不分组/i,
      /无需分组/i,
      /不进行分组/i
    ];
    
    for (const pattern of notGroupedPatterns) {
      if (pattern.test(text)) {
        const match = text.match(pattern);
        const extractedText = match ? this.extractContextAround(text, match.index!, match[0].length) : '';
        return {
          isGrouped: false,  // 🔥 前端期望的字段名
          type: 'not_grouped', // 保留原有字段
          confidence: 0.9,
          extractedText
        };
      }
    }

    return null;
  }

  /**
   * 提取是否可重复赔付
   */
  private static extractRepeatablePayout(text: string): any {
    // 1. 可以重复赔付
    const repeatablePatterns = [
      /可\s*重复\s*赔付/i,
      /可以\s*多次\s*赔付/i,
      /同一\s*[病种疾病]\s*可\s*[再次]?\s*赔付/i
    ];
    
    for (const pattern of repeatablePatterns) {
      if (pattern.test(text)) {
        const match = text.match(pattern);
        const extractedText = match ? this.extractContextAround(text, match.index!, match[0].length) : '';
        return {
          isRepeatable: true,  // 🔥 前端期望的字段名
          type: 'repeatable',  // 保留原有字段（向后兼容）
          confidence: 0.9,
          extractedText
        };
      }
    }

    // 2. 不可重复赔付（优化正则，修复bug）
    const notRepeatablePatterns = [
      /每种.{0,10}限赔\s*[一1]\s*次/i,              // "每种轻症限赔1次"（最常见格式）⭐️
      /每种.{0,10}限给付\s*[一1]\s*次/i,            // "每种轻症限给付一次"⭐️
      /每种.{0,10}只给付\s*[一1]\s*次/i,            // "每种轻症只给付一次"⭐️
      /每种.{0,10}仅给付\s*[一1]\s*次/i,            // "每种轻症仅给付一次"⭐️
      /每种.*?仅限.*?[给付赔付].*?[一1]\s*次/i,    // "每种轻症疾病仅限给付一次"
      /每[种个].*?[病种疾病].*?仅限.*?[一1]\s*次/i, // "每种疾病仅限一次"
      /每[种个].*?仅.*?[一1]\s*次/i,               // "每种仅限一次"
      /不可\s*重复\s*赔付/i,                         // "不可重复赔付"
      /同一\s*[病种疾病]\s*不可\s*[再次]?\s*赔付/i  // "同一病种不可再次赔付"
    ];
    
    for (const pattern of notRepeatablePatterns) {
      if (pattern.test(text)) {
        const match = text.match(pattern);
        const extractedText = match ? this.extractContextAround(text, match.index!, match[0].length) : '';
        return {
          isRepeatable: false,    // 🔥 前端期望的字段名
          type: 'not_repeatable', // 保留原有字段（向后兼容）
          confidence: 0.9,
          extractedText
        };
      }
    }

    return null;
  }

  /**
   * 提取豁免保费
   */
  private static extractPremiumWaiver(text: string): any {
    const patterns = [
      /豁免.*保[险]?费/i,
      /免[交缴]\s*[保险]?费/i,
      /保[险]?费\s*豁免/i,
      /不再\s*[交缴]\s*[保险]?费/i
    ];

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        const match = text.match(pattern);
        const extractedText = match ? this.extractContextAround(text, match.index!, match[0].length) : '';
        
        // 判断是否豁免
        const hasWaiver = !text.includes('不豁免') && !text.includes('无豁免');
        
        return {
          isWaived: hasWaiver,  // 🔥 前端期望的字段名
          type: hasWaiver ? 'waived' : 'not_waived',  // 保留原有字段
          confidence: 0.85,
          extractedText
        };
      }
    }

    return null;
  }

  /**
   * 辅助方法：提取匹配文本前后的上下文（用于extractedText）
   */
  private static extractContextAround(text: string, matchIndex: number, matchLength: number, contextLength: number = 50): string {
    const start = Math.max(0, matchIndex - contextLength);
    const end = Math.min(text.length, matchIndex + matchLength + contextLength);
    return text.substring(start, end).trim();
  }

  /**
   * 快速评估条款复杂度（用于决定是否需要调用大模型）
   * 策略：识别复杂特征，强制使用大模型处理
   */
  static assessComplexity(text: string): { needsLLM: boolean; reason: string; complexity: string } {
    const cleanText = text.replace(/\s+/g, ' ').trim();

    // 🔍 调试日志：打印原始文本和清理后的文本
    console.log('🔍 [assessComplexity] 原始文本长度:', text.length);
    console.log('🔍 [assessComplexity] 清理后文本长度:', cleanText.length);
    console.log('🔍 [assessComplexity] 文本前100字符:', cleanText.substring(0, 100));
    console.log('🔍 [assessComplexity] 是否包含"较大者":', cleanText.includes('较大者'));
    console.log('🔍 [assessComplexity] 是否包含"取大":', cleanText.includes('取大'));
    console.log('🔍 [assessComplexity] 是否包含复利公式(1+:', cleanText.includes('(1+'));
    console.log('🔍 [assessComplexity] 是否包含^符号:', cleanText.includes('^'));

    // 复杂度特征检测（优先级从高到低）
    
    // 1. 【高复杂度】比较逻辑：需要大模型数值对比和决策
    const comparisonPatterns = [
      /较大者|取大|孰大/i,
      /[两二三]项.*中.*[大高多]/i,
      /以.*[大高多].*为准/i,
      /按.*[大高多].*给付/i
    ];
    for (const pattern of comparisonPatterns) {
      if (pattern.test(cleanText)) {
        console.log('✅ [assessComplexity] 匹配到比较逻辑pattern:', pattern);
        return { 
          needsLLM: true, 
          reason: '包含比较逻辑（较大者/取大），需要数值对比和决策', 
          complexity: 'high' 
        };
      }
    }

    // 2. 【高复杂度】复利/单利计算：需要大模型解析公式
    const formulaPatterns = [
      /\(1\s*\+\s*\d+\.?\d*%?\s*\)\s*\^/i, // (1+3.5%)^n
      /\^\s*[（(]\s*保单/i, // ^(保单年度)
      /复利|单利/i,
      /按.*\d+\.?\d*%.*计算/i
    ];
    for (const pattern of formulaPatterns) {
      if (pattern.test(cleanText)) {
        console.log('✅ [assessComplexity] 匹配到复利/单利pattern:', pattern);
        return { 
          needsLLM: true, 
          reason: '包含复利/单利公式计算，需要解析公式结构', 
          complexity: 'high' 
        };
      }
    }
    console.log('⚠️ [assessComplexity] 未匹配到任何复杂度pattern');

    // 3. 【中复杂度】多阶段条款：需要大模型理解阶段划分
    const stageCounts = (cleanText.match(/第\s*\d+\s*[个年].*保单.*年度/g) || []).length;
    const ageBasedStages = (cleanText.match(/\d+\s*[周岁].*[至到～—-]\s*\d+\s*[周岁]/g) || []).length;
    if (stageCounts > 1 || ageBasedStages > 1) {
      return { 
        needsLLM: true, 
        reason: `包含多阶段条款（${stageCounts}个保单年度阶段 + ${ageBasedStages}个年龄阶段），需要理解阶段划分`, 
        complexity: 'medium' 
      };
    }

    // 4. 【中复杂度】复杂条件判断：需要大模型理解逻辑关系
    if (/如果.*则.*否则|满足.*条件|同时满足|[或且].*[且或]/i.test(cleanText)) {
      return { 
        needsLLM: true, 
        reason: '包含复杂条件判断（if-else逻辑），需要理解条件关系', 
        complexity: 'medium' 
      };
    }

    // 5. 【中复杂度】给付比例表：需要大模型提取结构化数据
    if (/给付比例/i.test(cleanText) && /\d+\s*[-—至到]\s*\d+\s*[周岁]/i.test(cleanText)) {
      return { 
        needsLLM: true, 
        reason: '包含年龄对应给付比例表，需要提取结构化数据', 
        complexity: 'medium' 
      };
    }

    // 6. 【低复杂度】但文本过长：可能包含未识别的复杂逻辑
    if (cleanText.length > 1000) {
      return { 
        needsLLM: true, 
        reason: '条款较长（>1000字），可能包含未识别的复杂逻辑', 
        complexity: 'medium' 
      };
    }

    // 7. 【极低复杂度】文本过短：可能不完整，谨慎处理
    if (cleanText.length < 50) {
      return { 
        needsLLM: false, 
        reason: '文本过短（<50字），可能只是简单描述或不完整片段，硬规则尝试匹配', 
        complexity: 'low' 
      };
    }

    // 8. 【简单条款】可以用硬规则处理
    return { 
      needsLLM: false, 
      reason: '条款简单，无复杂逻辑，硬规则可处理', 
      complexity: 'low' 
    };
  }
}

