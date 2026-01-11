// ==================== 解析协调器（职责：协调硬规则解析和LLM解析）====================
class ParseCoordinatorService {
  /**
   * 解析条款（先使用硬规则，如果置信度低则建议使用LLM）
   * @param {string} clauseText - 条款文本
   * @param {string} coverageType - 责任类型
   * @returns {Promise<Object>} 解析结果
   */
  static async parse(clauseText, coverageType = 'disease') {
    // 使用硬规则解析
    const ruleParser = new RuleBasedParser(coverageType);
    const result = ruleParser.parse(clauseText);
    
    // 设置解析方法标记
    result.parseMethod = 'rule';
    
    return result;
  }

  /**
   * 判断是否应该使用LLM（基于关键字段置信度）
   * @param {Object} result - 解析结果
   * @param {string} clauseText - 原始条款文本（用于检测复杂条款）
   * @returns {boolean} 是否应该使用LLM
   */
  static shouldUseLLM(result, clauseText = '') {
    if (!result) {
      console.log('🔍 shouldUseLLM: result为空，必须使用LLM');
      return true;
    }
    
    // 【强制规则0】检测复杂条款关键词，如果包含复杂计算，强制使用LLM
    if (clauseText) {
      const complexKeywords = [
        '乘以', '到达年龄', '给付比例', '现金价值', '累计已交保险费',
        '趸交', '分期支付', '交费期满日', '保单周年日', '到达年龄',
        '1+', '1\\+', '\\(1\\+', '复利', '单利', '递增', '递减'
      ];
      const hasComplexKeywords = complexKeywords.some(keyword => {
        const regex = new RegExp(keyword, 'i');
        return regex.test(clauseText);
      });
      
      if (hasComplexKeywords) {
        console.log('🔍 ⚠️ 检测到复杂条款关键词，强制调用大模型');
        console.log('🔍 检测到的关键词:', complexKeywords.filter(keyword => {
          const regex = new RegExp(keyword, 'i');
          return regex.test(clauseText);
        }));
        return true;
      }
    }
    
    // 检查关键字段（赔付金额）的置信度
    const payoutAmount = result.payoutAmount;
    const payoutAmountConfidence = payoutAmount?.confidence || 0;
    const payoutAmountType = payoutAmount?.type;
    const payoutAmountExists = payoutAmount !== undefined && payoutAmount !== null;
    
    // 赔付金额高置信度阈值（0.8表示80%以上才认为是高置信度）
    const HIGH_CONFIDENCE_THRESHOLD = 0.8;
    
    console.log('🔍 shouldUseLLM检查:', {
      payoutAmountExists,
      payoutAmountConfidence,
      payoutAmountType,
      highConfidenceThreshold: HIGH_CONFIDENCE_THRESHOLD,
      payoutAmount: payoutAmount
    });
    
    // 【强制规则1】如果赔付金额不存在，必须使用LLM
    if (!payoutAmountExists) {
      console.log('🔍 ⚠️ 赔付金额不存在，必须调用大模型');
      return true;
    }
    
    // 【强制规则2】如果赔付金额置信度为0，必须使用LLM
    if (payoutAmountConfidence === 0) {
      console.log('🔍 ⚠️ 赔付金额置信度为0，必须调用大模型');
      return true;
    }
    
    // 【强制规则3】如果赔付金额type为unknown，必须使用LLM
    if (payoutAmountType === 'unknown') {
      console.log('🔍 ⚠️ 赔付金额type为unknown，必须调用大模型');
      return true;
    }
    
    // 【强制规则4】如果赔付金额置信度不高（低于阈值），必须使用LLM
    if (payoutAmountConfidence < HIGH_CONFIDENCE_THRESHOLD) {
      console.log(`🔍 ⚠️ 赔付金额置信度(${payoutAmountConfidence})低于阈值(${HIGH_CONFIDENCE_THRESHOLD})，必须调用大模型`);
      return true;
    }
    
    // 如果整体置信度低于0.6，建议使用LLM
    const overallConfidence = result.overallConfidence || 0;
    if (overallConfidence < 0.6) {
      console.log('🔍 整体置信度低于0.6，建议使用LLM');
      return true;
    }
    
    console.log('🔍 置信度足够高，无需使用LLM');
    return false;
  }
}


