// ==================== 赔付金额解析器（职责：仅负责赔付金额字段的解析）====================
class PayoutAmountParserService {
  /**
   * 解析赔付金额
   * @param {string} clauseText - 条款文本
   * @param {string} coverageType - 责任类型 (disease, death, accident, annuity, survival)
   * @returns {Object} 解析结果 { type, details, confidence, extractedText }
   */
  static parse(clauseText, coverageType = 'disease') {
    console.log('🔍 PayoutAmountParserService.parse 被调用:', { coverageType, textLength: clauseText.length });
    const rules = this.getRules(coverageType);
    
    // 🔥 应用学习到的规则
    if (typeof RuleStorageService !== 'undefined') {
      const learnedRules = RuleStorageService.getRulesByField('payoutAmount', coverageType);
      if (learnedRules && learnedRules.length > 0) {
        console.log(`📚 找到 ${learnedRules.length} 个学习到的赔付金额规则`);
        // 将学习到的规则转换为标准格式并添加到规则列表
        learnedRules.forEach(learnedRule => {
          const handler = RuleExtractionService.generateHandlerFromRuleData(learnedRule);
          if (handler) {
            rules.push({
              name: `learned_${learnedRule.ruleId}_${learnedRule.field}`,
              pattern: new RegExp(learnedRule.pattern, 'i'),
              handler: handler
            });
          }
        });
      }
    }
    
    const result = this.applyRules(clauseText, rules);
    console.log('🔍 PayoutAmountParserService.parse 返回结果:', result);
    return result;
  }

  /**
   * 获取对应责任类型的规则
   */
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

  /**
   * 应用规则列表，返回最佳匹配
   * 规则：如果有多个赔付金额，第一个是按已交保费给付的，直接跳过，识别下一个赔付内容
   */
  static applyRules(text, rules) {
    // 收集所有匹配的结果
    const allMatches = [];
    
    console.log(`🔍 [PayoutAmountParser] 开始应用规则，规则总数: ${rules.length}`);
    console.log(`🔍 [PayoutAmountParser] 条款文本长度: ${text.length}`);
    console.log(`🔍 [PayoutAmountParser] 条款文本前200字符: ${text.substring(0, 200)}`);

    for (const rule of rules) {
      const match = text.match(rule.pattern);
      if (match && rule.handler) {
        const result = rule.handler(match);
        console.log(`🔍 规则 ${rule.name}: 匹配 ✅, 置信度: ${result.confidence}, 类型: ${result.type}, 结果:`, result);
        console.log(`🔍 规则 ${rule.name}: 匹配文本: ${match[0].substring(0, 100)}`);
        if (result) {
          allMatches.push({
            rule: rule.name,
            result: result,
            matchIndex: match.index, // 记录匹配位置
            matchText: match[0]
          });
        }
      } else {
        // 记录未匹配的规则（仅记录前5个，避免日志过多）
        if (rules.indexOf(rule) < 5) {
          console.log(`🔍 规则 ${rule.name}: 未匹配 ❌`);
        }
      }
    }
    
    console.log(`🔍 [PayoutAmountParser] 匹配结果总数: ${allMatches.length}`);

    // 如果没有匹配，返回未识别
    if (allMatches.length === 0) {
      const finalResult = { type: 'unknown', confidence: 0, extractedText: "未识别" };
      console.log('🔍 PayoutAmountParserService.applyRules 最终结果: 未识别');
      return finalResult;
    }

    // 按匹配位置排序（从前往后）
    allMatches.sort((a, b) => a.matchIndex - b.matchIndex);

    // 规则：如果有多个赔付金额，第一个是按已交保费给付的，直接跳过，识别下一个赔付内容
    let bestMatch = null;
    let bestConfidence = 0;
    
    // 如果第一个匹配是按已交保费给付（paid_premium），且不是 tiered 类型，跳过它
    // 注意：tiered 类型是分阶段赔付，即使第一个阶段是按已交保费，也应该保留（因为它是完整的赔付方案）
    if (allMatches.length > 1 && 
        allMatches[0].result.type === 'paid_premium' && 
        allMatches[0].result.type !== 'tiered') {
      console.log('🔍 检测到第一个赔付是按已交保费给付（非分阶段），跳过，查找下一个赔付内容');
      // 从第二个开始查找
      for (let i = 1; i < allMatches.length; i++) {
        const match = allMatches[i];
        // 优先选择非 paid_premium 类型的结果
        if (match.result.type !== 'paid_premium' && match.result.confidence > bestConfidence) {
          bestConfidence = match.result.confidence;
          bestMatch = match.result;
        }
      }
      
      // 如果跳过第一个后，没有找到其他非 paid_premium 的结果，使用最佳匹配
      if (!bestMatch) {
        for (let i = 1; i < allMatches.length; i++) {
          const match = allMatches[i];
          if (match.result.confidence > bestConfidence) {
            bestConfidence = match.result.confidence;
            bestMatch = match.result;
          }
        }
      }
    } else {
      // 如果没有多个赔付，或者第一个不是按已交保费给付，或者第一个是 tiered 类型，使用最佳匹配
      for (const match of allMatches) {
        if (match.result.confidence > bestConfidence) {
          bestConfidence = match.result.confidence;
          bestMatch = match.result;
        }
      }
    }

    const finalResult = bestMatch || { type: 'unknown', confidence: 0, extractedText: "未识别" };
    console.log('🔍 PayoutAmountParserService.applyRules 最终结果:', finalResult);
    return finalResult;
  }

  /**
   * 疾病责任赔付金额规则
   */
  static getDiseaseRules() {
    return [
      {
        name: "tiered_percentage_direct_with_policy_year",
        // 匹配：任意数字%...第N个保单年度起...按基本保险金额（最宽松，允许中间任意字符）
        pattern: /(\d+(?:\.\d+)?)\s*%[^]*?第\s*(\d+)\s*(?:个)?(?:保单|保险|合同)?(?:年度|年|周年)?[起]?[^]*?按[^]*?(?:基本(?:保险|保障)?(?:金额|保额|保险金|保障金)|基本金额|保额)/i,
        handler: (match) => {
          const percent1 = parseFloat(match[1]);
          const startPolicyYear = parseInt(match[2]);
          // 第N个保单年度起，之前就是前(N-1)个保单年度
          const period1 = startPolicyYear - 1;
          const period2 = `第${startPolicyYear}个保单年度起`;
          const percent2 = 100; // "按基本保险金额" 表示 100%
          return {
            type: "tiered",
            details: {
              tiers: [
                { period: `前${period1}个保单年度`, value: percent1, unit: "percentage" },
                { period: period2, value: percent2, unit: "percentage" }
              ],
              base: "basicSumInsured"
            },
            confidence: 0.95,
            extractedText: match[0]
          };
        }
      },
      {
        name: "tiered_percentage_with_after",
        // 更宽松：前N年X%，之后Y%
        pattern: /(?:前|第|自|从)\s*(\d+)\s*(?:个)?(?:保单|保险|合同)?(?:年度|年|周年)?[^%]*?(?:基本(?:保险|保障)?(?:金额|保额|保险金|保障金)|基本金额|保额)?[^%]*?(?:的\s*)?(\d+(?:\.\d+)?)\s*%[^，,;；]*?[，,;；]?.*?(?:之后|以后|往后|此后|其后|之后)[^%]*?(?:基本(?:保险|保障)?(?:金额|保额|保险金|保障金)|基本金额|保额)?[^%]*?(?:的\s*)?(\d+(?:\.\d+)?)?\s*%?/i,
        handler: (match) => ({
          type: "tiered",
          details: {
            tiers: [
              { period: `前${match[1]}个保单年度`, value: parseFloat(match[2]), unit: "percentage" },
              { period: '之后', value: match[3] ? parseFloat(match[3]) : 100, unit: "percentage" }
            ],
            base: "basicSumInsured"
          },
          confidence: 0.90,
          extractedText: match[0]
        })
      },
      {
        name: "tiered_percentage_ultra_flexible",
        // 最宽松：前N年X%，第M年起Y%
        pattern: /(?:前|第|自|从)[^起]*?起[^第]*?(?:第)?\s*(\d+)\s*(?:个)?(?:保单|保险|合同)?(?:年度|年|周年)?[^%]*?(?:基本(?:保险|保障)?(?:金额|保额|保险金|保障金)|基本金额|保额)?[^%]*?(?:的\s*)?(\d+(?:\.\d+)?)\s*%[^，,;；]*?[，,;；]?.*?(?:第|自第|从第|至第|到第)\s*(\d+)\s*(?:个)?(?:保单|保险|合同)?(?:年度|年|周年)?[起]?[^%]*?(?:基本(?:保险|保障)?(?:金额|保额|保险金|保障金)|基本金额|保额)?[^%]*?(?:的\s*)?(\d+(?:\.\d+)?)?\s*%?/i,
        handler: (match) => {
          const period1 = match[1];
          const percent1 = parseFloat(match[2]);
          const period2 = `第${match[3]}个保单年度起`;
          const percent2 = match[4] ? parseFloat(match[4]) : 100;
          return {
            type: "tiered",
            details: {
              tiers: [
                { period: `前${period1}个保单年度`, value: percent1, unit: "percentage" },
                { period: period2, value: percent2, unit: "percentage" }
              ],
              base: "basicSumInsured"
            },
            confidence: 0.90,
            extractedText: match[0]
          };
        }
      },
      {
        name: "tiered_percentage_with_basic_amount",
        // 匹配：前N年X%，第M年起按基本保险金额（隐含100%）（更宽松）
        pattern: /(?:前|第|自|从)\s*(\d+)\s*(?:个)?(?:保单|保险|合同)?(?:年度|年|周年)?[^%]*?(?:基本(?:保险|保障)?(?:金额|保额|保险金|保障金)|基本金额|保额)?[^%]*?(?:的\s*)?(\d+(?:\.\d+)?)\s*%[^，,;；]*?[，,;；]?.*?(?:第|自第|从第|至第|到第)\s*(\d+)\s*(?:个)?(?:保单|保险|合同)?(?:年度|年|周年)?[起]?[^，,;；]*?(?:按|根据|依据|给付|支付|赔偿|理赔)?[^，,;；]*?(?:基本(?:保险|保障)?(?:金额|保额|保险金|保障金)|基本金额|保额)/i,
        handler: (match) => {
          const period1 = match[1];
          const percent1 = parseFloat(match[2]);
          const period2 = `第${match[3]}个保单年度起`;
          // "按基本保险金额" 表示 100%
          const percent2 = 100;
          return {
            type: "tiered",
            details: {
              tiers: [
                { period: `前${period1}个保单年度`, value: percent1, unit: "percentage" },
                { period: period2, value: percent2, unit: "percentage" }
              ],
              base: "basicSumInsured"
            },
            confidence: 0.95,
            extractedText: match[0]
          };
        }
      },
      {
        name: "tiered_percentage_reverse_order",
        // 更宽松：第N个保单年度X%，第M个保单年度起
        pattern: /第\s*(\d+)\s*(?:个)?(?:保单|保险|合同)?(?:年度|年|周年)?[末起]?[^基]*?(?:基本(?:保险|保障)?(?:金额|保额|保险金|保障金)|基本金额|保额)[^%]*?(?:的\s*)?(\d+(?:\.\d+)?)\s*%[^，,;；]*?[，,;；]?.*?第\s*(\d+)\s*(?:个)?(?:保单|保险|合同)?(?:年度|年|周年)?[起]?[^基]*?(?:基本(?:保险|保障)?(?:金额|保额|保险金|保障金)|基本金额|保额)/i,
        handler: (match) => ({
          type: "tiered",
          details: {
            tiers: [
              { period: `前${match[1]}个保单年度`, value: parseFloat(match[2]), unit: "percentage" },
              { period: `第${match[3]}个保单年度起`, value: 100, unit: "percentage" }
            ],
            base: "basicSumInsured"
          },
          confidence: 0.95,
          extractedText: match[0]
        })
      },
      {
        name: "tiered_percentage_standard_order",
        // 更宽松：第N个保单年度X%基本保险金额，第M个保单年度起Y%基本保险金额
        pattern: /第\s*(\d+)\s*(?:个)?(?:保单|保险|合同)?(?:年度|年|周年)?[末起]?[^%]*?(\d+(?:\.\d+)?)\s*%[^，,;；]*?(?:基本(?:保险|保障)?(?:金额|保额|保险金|保障金)|基本金额|保额)[^，,;；]*?[，,;；]?.*?第\s*(\d+)\s*(?:个)?(?:保单|保险|合同)?(?:年度|年|周年)?[起]?[^%]*?(\d+(?:\.\d+)?)\s*%[^，,;；]*?(?:基本(?:保险|保障)?(?:金额|保额|保险金|保障金)|基本金额|保额)/i,
        handler: (match) => ({
          type: "tiered",
          details: {
            tiers: [
              { period: `前${match[1]}个保单年度`, value: parseFloat(match[2]), unit: "percentage" },
              { period: `第${match[3]}个保单年度起`, value: parseFloat(match[4]), unit: "percentage" }
            ],
            base: "basicSumInsured"
          },
          confidence: 0.95,
          extractedText: match[0]
        })
      },
      {
        name: "tiered_percentage_with_base",
        // 更宽松：前N年X%基本保险金额，第M年起Y%基本保险金额
        pattern: /前\s*(\d+)[个]?(?:保单|保险|合同)?(?:年度|年|周年)+[末起]?[^%]*?(\d+(?:\.\d+)?)\s*%[^，,;；]*?(?:基本(?:保险|保障)?(?:金额|保额|保险金|保障金)|基本金额|保额)[^，,;；]*?[，,;；]?.*?第\s*(\d+)[个]?(?:保单|保险|合同)?(?:年度|年|周年)+[起]?[^%]*?(\d+(?:\.\d+)?)\s*%[^，,;；]*?(?:基本(?:保险|保障)?(?:金额|保额|保险金|保障金)|基本金额|保额)/i,
        handler: (match) => ({
          type: "tiered",
          details: {
            tiers: [
              { period: `前${match[1]}个保单年度`, value: parseFloat(match[2]), unit: "percentage" },
              { period: `第${match[3]}个保单年度起`, value: parseFloat(match[4]), unit: "percentage" }
            ],
            base: "basicSumInsured"
          },
          confidence: 0.95,
          extractedText: match[0]
        })
      },
      {
        name: "simple_percentage_standard",
        // 更宽松：X%基本保险金额（但排除包含"第N个保单年度"的情况，因为那应该是分层赔付，支持跨行匹配）
        pattern: /(\d+(?:\.\d+)?)\s*%[\s\S]*?(?:基本[\s\S]{0,100}?(?:保险|保障)?[\s\S]{0,100}?(?:金额|保额|保险金|保障金)|基本金额|保额)(?![\s\S]*?第\s*\d+\s*(?:个)?(?:保单|保险|合同)?(?:年度|年|周年))/i,
        handler: (match) => ({
          type: "percentage",
          details: {
            percentage: parseFloat(match[1]),
            base: "basicSumInsured"
          },
          confidence: 0.85,
          extractedText: match[0]
        })
      },
      {
        name: "simple_percentage_reverse",
        // 更宽松：基本保险金额的X%（支持跨行匹配，允许"基本保"和"险金额"之间有换行）
        pattern: /基本[\s\S]{0,100}?(?:保险|保障)?[\s\S]{0,100}?(?:金额|保额|保险金|保障金)[\s\S]*?(?:的\s*)?(\d+(?:\.\d+)?)\s*%/i,
        handler: (match) => ({
          type: "percentage",
          details: {
            percentage: parseFloat(match[1]),
            base: "basicSumInsured"
          },
          confidence: 0.85,
          extractedText: match[0]
        })
      },
      {
        name: "basic_amount_direct",
        // 匹配：按基本保额/按基本保险金额（表示100%，但排除包含百分比的情况）
        // 注意：如果包含百分比，应该由 simple_percentage_reverse 规则匹配
        pattern: /按[^，,;；。]*?(?:基本(?:保险|保障)?(?:金额|保额|保险金|保障金)|基本金额|保额)(?!.*\d+\s*%)[^，,;；。]*?(?:给付|支付|赔偿|理赔|给付保险金)/i,
        handler: (match) => ({
          type: "percentage",
          details: {
            percentage: 100,
            base: "basicSumInsured"
          },
          confidence: 0.90,
          extractedText: match[0]
        })
      },
      {
        name: "fixed_amount_wan",
        // 更宽松：X万元给付
        pattern: /(\d+(?:\.\d+)?)[万千]?元[^，,;；]*?(?:给付|支付|赔偿|理赔)/i,
        handler: (match) => ({
          type: "fixed",
          details: {
            fixedAmount: parseFloat(match[1]) * (match[0].includes('万') ? 10000 : 1),
            unit: "yuan"
          },
          confidence: 0.80,
          extractedText: match[0]
        })
      }
    ];
  }

  /**
   * 身故责任赔付金额规则
   */
  static getDeathRules() {
    return [
      {
        name: "tiered_waiting_period_death",
        // 匹配：等待期内按已交保费，等待期后按基本保额（分阶段赔付）
        // 匹配模式：...180日内...按已支付的保险费给付...180日后...按本合同保险金额给付
        // 重要：等待期内的保费返还不是真正的理赔，只返回等待期后的真正理赔！
        // 支持跨行匹配（使用[\s\S]代替[^，,;；。]）
        // 优化：更宽松的匹配，允许"在本合同有效期内"、"被保险人"等中间文字
        // 匹配模式：被保险人自...合同生效...180日内...按已支付的保险费给付...180日后...按本合同保险金额给付
        pattern: /(?:被保险人自|自|从|在)[\s\S]*?(?:合同生效|生效|复效|最后一次复效)[\s\S]*?(?:以较迟者为准)?[\s\S]*?(?:起|之日起)?[\s\S]*?(\d+)\s*日[内后][\s\S]*?按[\s\S]*?(?:已支付|已交|已缴纳|已缴付)(?:的)?(?:保险费|保费)[\s\S]*?(?:给付|支付|赔偿|理赔|给付保险金)[\s\S]*?(?:在本合同有效期内|自|从|在|被保险人)[\s\S]*?(?:合同生效|生效|复效|最后一次复效|遭受意外伤害)?[\s\S]*?(?:以较迟者为准)?[\s\S]*?(?:起|之日起)?[\s\S]*?\1\s*日[后][\s\S]*?按[\s\S]*?(?:本合同|本附加险合同)?(?:保险金额|基本(?:保险|保障)?(?:金额|保额|保险金|保障金)|基本金额|保额)[\s\S]*?(?:给付|支付|赔偿|理赔|给付保险金)/i,
        handler: (match) => {
          const waitingDays = parseInt(match[1]);
          // 重要：等待期内的保费返还不是真正的理赔，只返回等待期后的真正理赔！
          // 返回 percentage 类型，而不是 tiered 类型，因为等待期内的保费返还不应该显示
          
          // 提取等待期后的真正理赔文本
          const fullText = match[0];
          const afterWaitingPeriodMatch = fullText.match(/\d+\s*日[后][\s\S]*?按[\s\S]*?(?:本合同|本附加险合同)?(?:保险金额|基本(?:保险|保障)?(?:金额|保额|保险金|保障金)|基本金额|保额)[\s\S]*?(?:给付|支付|赔偿|理赔|给付保险金)/i);
          const extractedText = afterWaitingPeriodMatch ? afterWaitingPeriodMatch[0] : fullText;
          
          console.log(`🔍 [tiered_waiting_period_death] 检测到等待期内的保费返还，跳过，只返回等待期后的真正理赔`);
          
          return {
            type: "percentage",
            details: {
              percentage: 100,
              base: "basicSumInsured"
            },
            confidence: 0.95,
            extractedText: extractedText
          };
        }
      },
      {
        name: "basic_amount_direct_death",
        // 匹配：按本合同保险金额给付（表示100%基本保额）
        // 支持跨行匹配（使用[\s\S]代替[^，,;；。]）
        pattern: /按[\s\S]*?(?:本合同|本附加险合同)?(?:保险金额|基本(?:保险|保障)?(?:金额|保额|保险金|保障金)|基本金额|保额)[\s\S]*?(?:给付|支付|赔偿|理赔|给付保险金)/i,
        handler: (match) => ({
          type: "percentage",
          details: {
            percentage: 100,
            base: "basicSumInsured"
          },
          confidence: 0.90,
          extractedText: match[0]
        })
      },
      {
        name: "paid_premium_death",
        // 匹配：按已支付的保险费给付（按已交保费给付）
        // 支持跨行匹配（使用[\s\S]代替[^，,;；。]）
        pattern: /按[\s\S]*?(?:已支付|已交|已缴纳|已缴付)(?:的)?(?:保险费|保费)[\s\S]*?(?:给付|支付|赔偿|理赔|给付保险金)/i,
        handler: (match) => ({
          type: "paid_premium",
          details: {
            base: "paidPremium"
          },
          confidence: 0.90,
          extractedText: match[0]
        })
      },
      {
        name: "simple_percentage",
        pattern: /(\d+(?:\.\d+)?)%[^%]*?基本保额/i,
        handler: (match) => ({
          type: "percentage",
          details: {
            percentage: parseFloat(match[1]),
            base: "basicSumInsured"
          },
          confidence: 0.85,
          extractedText: match[0]
        })
      },
      {
        name: "fixed_amount",
        pattern: /(\d+(?:\.\d+)?)[万千]?元/i,
        handler: (match) => ({
          type: "fixed",
          details: {
            fixedAmount: parseFloat(match[1]) * (match[0].includes('万') ? 10000 : 1),
            unit: "yuan"
          },
          confidence: 0.80,
          extractedText: match[0]
        })
      }
    ];
  }

  /**
   * 意外责任赔付金额规则
   */
  static getAccidentRules() {
    return [
      {
        name: "simple_percentage",
        pattern: /(\d+(?:\.\d+)?)%[^%]*?基本保额/i,
        handler: (match) => ({
          type: "percentage",
          details: {
            percentage: parseFloat(match[1]),
            base: "basicSumInsured"
          },
          confidence: 0.85,
          extractedText: match[0]
        })
      }
    ];
  }

  /**
   * 年金责任赔付金额规则
   */
  static getAnnuityRules() {
    return [
      {
        name: "annuity_amount",
        pattern: /每年[^0-9]*?(\d+(?:\.\d+)?)[万千]?元/i,
        handler: (match) => ({
          type: "annuity",
          details: {
            amount: parseFloat(match[1]) * (match[0].includes('万') ? 10000 : 1),
            unit: "yuan_per_year"
          },
          confidence: 0.85,
          extractedText: match[0]
        })
      }
    ];
  }

  /**
   * 生存责任赔付金额规则
   */
}









