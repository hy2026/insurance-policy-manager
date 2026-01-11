/**
 * 理赔金额计算服务
 * 
 * 职责：
 * 1. 根据LLM解析的规则，结合保单信息，计算具体的理赔金额
 * 2. 支持多种计算类型：Max比较、复利/单利、已交保费等
 * 3. 生成每年的具体金额，供前端展示
 * 
 * 设计原则：
 * - 单一职责：只负责计算，不涉及LLM交互
 * - 可扩展：新增计算规则时，只需添加新方法
 * - 可测试：纯函数，易于单元测试
 */

export interface PolicyInfo {
  birthYear: number;           // 出生年份
  policyStartYear: number;     // 投保年份
  coverageEndYear: number | 'lifetime';  // 保障结束年份
  basicSumInsured: number;     // 基本保额（元）
  annualPremium?: number;      // 年缴保费（元）
  totalPaymentPeriod?: number; // 缴费期限（年）
}

export interface PayoutTier {
  period?: string;              // 阶段描述
  value?: number;               // 值
  unit?: string;                // 单位
  formula?: string;             // 公式
  formulaType?: string;         // 公式类型：max/compound/simple
  interestRate?: number;        // 利率
  ratio?: any;                  // 给付比例
  basis?: string;               // 基础
  [key: string]: any;
}

export interface CalculatedAmount {
  year: number;                 // 年份
  age: number;                  // 年龄
  amount: number;               // 金额（万元）
  selectedOption?: string;      // Max选中的选项
  isFixed?: boolean;            // 是否固定值
  endYear?: number | 'lifetime'; // 结束年份（仅固定值）
  endAge?: number | 'lifetime';  // 结束年龄（仅固定值）
}

export class PayoutCalculationService {
  /**
   * 计算理赔金额的主入口
   */
  calculatePayoutAmounts(tier: PayoutTier, policyInfo: PolicyInfo): CalculatedAmount[] {
    // 预处理：如果formula是文本，尝试识别并转换为可计算的格式
    if (typeof tier.formula === 'string' && !tier.formulaType) {
      const normalizedTier = this.normalizeFormulaFromText(tier, policyInfo);
      if (normalizedTier) {
        tier = normalizedTier;
      }
    }
    
    // 1. Max逻辑：逐年比较多个选项
    if (tier.formulaType === 'max') {
      return this.calculateMaxLogic(tier, policyInfo);
    }
    
    // 2. 已交保费：计算总保费（可能带比例）
    if (this.isPaidPremiumType(tier)) {
      return this.calculatePaidPremium(tier, policyInfo);
    }
    
    // 3. 复利/单利：计算每年的金额
    if (tier.formulaType === 'compound' || tier.formulaType === 'simple' || tier.interestRate) {
      return this.calculateCompoundOrSimple(tier, policyInfo);
    }
    
    // 4. 百分比类型：基本保额的X%
    if (tier.formulaType === 'percentage' || (typeof tier.formula === 'string' && tier.formula.includes('基本') && tier.formula.includes('%'))) {
      return this.calculatePercentage(tier, policyInfo);
    }
    
    // 5. 未识别类型：返回空数组
    console.warn(`⚠️ [PayoutCalculation] 未识别的计算类型，tier:`, JSON.stringify(tier, null, 2));
    return [];
  }
  
  /**
   * 从文本公式中识别计算类型
   */
  private normalizeFormulaFromText(tier: PayoutTier, policyInfo: PolicyInfo): PayoutTier | null {
    const formula = tier.formula as string;
    if (!formula) return null;
    
    // 1. 已交保费/保险费
    if (formula.includes('已交') || formula.includes('保险费') || formula.includes('保费')) {
      return {
        ...tier,
        formulaType: 'paid_premium',
        unit: 'paid_premium'
      };
    }
    
    // 2. 基本保额的百分比（如"基本保险金额的150%"、"基本保额×150%"、"基本保险金额的150%"）
    // 支持多种格式：的、×、*、空格等
    const percentagePatterns = [
      /基本[保险]*[金额额]*[的×*]?\s*(\d+(?:\.\d+)?)%/,  // "基本保险金额的150%"、"基本保额×150%"
      /基本[保险]*[金额额]*\s*[的×*]\s*(\d+(?:\.\d+)?)%/,  // "基本保险金额 × 150%"
      /(\d+(?:\.\d+)?)%\s*基本[保险]*[金额额]*/,  // "150%基本保险金额"
    ];
    
    for (const pattern of percentagePatterns) {
      const match = formula.match(pattern);
      if (match) {
        const percentage = parseFloat(match[1]);
        return {
          ...tier,
          formulaType: 'percentage',
          unit: 'percentage',
          value: percentage,
          formula: `基本保额×${percentage}%`
        };
      }
    }
    
    // 3. 基本保额（100%）
    if (formula.includes('基本保额') || formula.includes('基本保险金额') || formula.includes('保险金额')) {
      if (!formula.includes('%') && !formula.match(/\d+%/)) {
        return {
          ...tier,
          formulaType: 'percentage',
          unit: 'percentage',
          value: 100,
          formula: '基本保额×100%'
        };
      }
    }
    
    return null;
  }
  
  /**
   * 计算百分比类型（基本保额的X%）
   */
  private calculatePercentage(tier: PayoutTier, policyInfo: PolicyInfo): CalculatedAmount[] {
    const { birthYear, policyStartYear, coverageEndYear, basicSumInsured } = policyInfo;
    const currentAge = new Date().getFullYear() - birthYear;
    const policyStartAge = policyStartYear - birthYear;
    const basicSumInsuredWan = basicSumInsured / 10000;
    const percentage = tier.value || 100;
    const amount = basicSumInsuredWan * (percentage / 100);
    
    // 🎯 使用结构化字段确定年龄范围
    let startAge = Math.max(currentAge, policyStartAge);
    const endYear = coverageEndYear === 'lifetime' ? null : coverageEndYear;
    let endAge = endYear ? endYear - birthYear : 100;
    
    // 优先使用 policyYearRange
    const policyYearRange = (tier as any).policyYearRange;
    if (policyYearRange) {
      if (policyYearRange.start) {
        startAge = Math.max(currentAge, policyStartAge + (policyYearRange.start - 1));
      }
      if (policyYearRange.end) {
        endAge = policyStartAge + (policyYearRange.end - 1);
      } else if (policyYearRange.end === null) {
        endAge = endYear ? endYear - birthYear : 100;
      }
    }
    
    // 优先使用 ageCondition
    const ageCondition = (tier as any).ageCondition;
    if (ageCondition && ageCondition.limit) {
      const { limit, operator } = ageCondition;
      if (operator === '<') {
        endAge = Math.min(endAge, limit - 1);
      } else if (operator === '>=') {
        startAge = Math.max(startAge, limit);
      }
    }
    
    console.log(`📊 [Percentage] 年龄范围: ${startAge}岁～${endAge === 100 && !endYear ? '终身' : endAge + '岁'}`);
    
    // 生成每年的金额（固定值）
    const keyAmounts: CalculatedAmount[] = [];
    for (let age = startAge; age <= endAge; age++) {
      const year = birthYear + age;
      keyAmounts.push({
        year,
        age,
        amount: parseFloat(amount.toFixed(3)),
        isFixed: true
      });
    }
    
    console.log(`✅ [PayoutCalculation] 百分比计算完成: ${percentage}%, 金额=${amount}万, 共${keyAmounts.length}年`);
    return keyAmounts;
  }

  /**
   * ============================================
   * Max逻辑：逐年比较多个选项，每年选择最大值
   * ============================================
   */
  private calculateMaxLogic(tier: PayoutTier, policyInfo: PolicyInfo): CalculatedAmount[] {
    console.log(`🔍 [MaxLogic] 处理Max逻辑（逐年比较），formula: ${tier.formula}`);
    console.log(`🔍 [MaxLogic] policyInfo:`, JSON.stringify(policyInfo, null, 2));
    console.log(`🔍 [MaxLogic] tier.ageCondition:`, (tier as any).ageCondition);
    console.log(`🔍 [MaxLogic] tier.policyYearRange:`, (tier as any).policyYearRange);
    
    const { birthYear, policyStartYear, coverageEndYear, basicSumInsured, annualPremium, totalPaymentPeriod } = policyInfo;
    const currentAge = new Date().getFullYear() - birthYear;
    const policyStartAge = policyStartYear - birthYear;
    const basicSumInsuredWan = basicSumInsured / 10000;
    
    console.log(`🔍 [MaxLogic] 关键数据: basicSumInsured=${basicSumInsured}, basicSumInsuredWan=${basicSumInsuredWan}, annualPremium=${annualPremium}, totalPaymentPeriod=${totalPaymentPeriod}`);
    console.log(`🔍 [MaxLogic] 年龄信息: 当前年龄=${currentAge}岁, 投保年龄=${policyStartAge}岁`);
    
    // 🎯 第一步：使用结构化字段确定年龄范围（优先级最高）
    let startAge = Math.max(currentAge, policyStartAge);
    const endYear = coverageEndYear === 'lifetime' ? null : coverageEndYear;
    let endAge = endYear ? endYear - birthYear : 100;
    
    // 🎯 优先使用 policyYearRange（保单年度范围）
    const policyYearRange = (tier as any).policyYearRange;
    if (policyYearRange) {
      if (policyYearRange.start) {
        const rangeStartAge = policyStartAge + (policyYearRange.start - 1);
        startAge = Math.max(currentAge, rangeStartAge);
        console.log(`✅ [MaxLogic] 使用policyYearRange.start=${policyYearRange.start}，计算起始年龄=${rangeStartAge}岁（投保${policyStartAge}岁+第${policyYearRange.start}年-1）`);
      }
      if (policyYearRange.end) {
        const rangeEndAge = policyStartAge + (policyYearRange.end - 1);
        endAge = rangeEndAge;
        console.log(`✅ [MaxLogic] 使用policyYearRange.end=${policyYearRange.end}，计算结束年龄=${rangeEndAge}岁（投保${policyStartAge}岁+第${policyYearRange.end}年-1）`);
      } else if (policyYearRange.end === null) {
        // end为null表示到保障结束
        endAge = endYear ? endYear - birthYear : 100;
        console.log(`✅ [MaxLogic] policyYearRange.end=null，使用保障结束年龄=${endAge}岁`);
      }
    }
    
    // 🎯 其次使用 ageCondition（年龄条件）
    const ageCondition = (tier as any).ageCondition;
    if (ageCondition && ageCondition.limit) {
      const { limit, operator } = ageCondition;
      if (operator === '<') {
        // 未满X岁：startAge不变，endAge = limit - 1
        endAge = Math.min(endAge, limit - 1);
        console.log(`✅ [MaxLogic] 使用ageCondition（< ${limit}），结束年龄=${endAge}岁`);
      } else if (operator === '>=') {
        // 年满X岁：startAge = limit，endAge不变
        startAge = Math.max(startAge, limit);
        console.log(`✅ [MaxLogic] 使用ageCondition（>= ${limit}），起始年龄=${startAge}岁`);
      }
    }
    
    console.log(`📊 [MaxLogic] 最终年龄范围: ${startAge}岁～${endAge === 100 && !endYear ? '终身' : endAge + '岁'}`);
    
    // 🎯 第二步：解析period文本（仅作为兜底）
    if (tier.period && !policyYearRange && !ageCondition) {
      const periodLower = tier.period.toLowerCase();
      const paymentStartAge = policyStartYear - birthYear;
      const paymentPeriodYears = parseInt(String(totalPaymentPeriod || '1'));
      const paymentEndAge = paymentStartAge + paymentPeriodYears - 1; // 最后一次缴费的年龄
      
      console.log(`🔍 [MaxLogic] period原文: "${tier.period}", periodLower: "${periodLower}"`);
      console.log(`🔍 [MaxLogic] 缴费信息: 投保年龄${paymentStartAge}岁, 缴费期${paymentPeriodYears}年, 最后缴费年龄${paymentEndAge}岁`);
      
      // 判断是"交费期内"还是"交费期满后"
      // 🎯 检测"期内"或"满日前"的所有变体
      const isDuringPayment = 
        periodLower.includes('期内') || // "交费期内"、"分期交费期内"、"缴费期内"
        periodLower.includes('满日前') || periodLower.includes('满日零时之前') || // "交费期满日前"
        (periodLower.includes('交费期') && periodLower.includes('前')) ||
        (periodLower.includes('缴费期') && periodLower.includes('前'));
      
      console.log(`🎯 [MaxLogic] isDuringPayment=${isDuringPayment}, 检测条件: 期内=${periodLower.includes('期内')}, 满日前=${periodLower.includes('满日前')}`);
      
      if (isDuringPayment) {
        // 交费期内：从当前年龄到最后一次缴费的年龄
        startAge = Math.max(currentAge, paymentStartAge);
        endAge = paymentEndAge;
        console.log(`✅ [MaxLogic] 识别为【交费期内】，年龄范围: ${startAge}岁-${endAge}岁（从当前${currentAge}岁到最后缴费${paymentEndAge}岁）`);
      } else {
        // 🎯 只有不是"期内"时，才检测"期满后"（避免误判如"18周岁后且分期交费期内"）
        // 🎯 检测"期满后"或"满日后"的所有变体
        const isAfterPayment = 
          (periodLower.includes('期满') && periodLower.includes('后')) || // "交费期满后"、"分期交费期满后"
          periodLower.includes('满日后') || periodLower.includes('满日零时之后'); // "交费期满日后"
        
        console.log(`🎯 [MaxLogic] isAfterPayment=${isAfterPayment}, 检测条件: 期满=${periodLower.includes('期满')}, 后=${periodLower.includes('后')}, 满日后=${periodLower.includes('满日后')}`);
        
        if (isAfterPayment) {
          // 交费期满后：从缴费结束后的年龄到保障结束年龄
          startAge = Math.max(currentAge, paymentEndAge + 1);
          endAge = endYear ? endYear - birthYear : 100;
          console.log(`✅ [MaxLogic] 识别为【交费期满后】，年龄范围: ${startAge}岁-${endAge}岁（从缴费结束后${paymentEndAge + 1}岁到保障结束${endAge}岁）`);
        } else {
          console.warn(`⚠️ [MaxLogic] 未识别到期内/期满后标志，使用默认范围: ${startAge}岁-${endAge}岁`);
        }
      }
    }
    
    // 解析formula，提取各选项（优先使用formula，如果没有则使用value）
    const formulaStr = tier.formula || (typeof tier.value === 'string' ? tier.value : '');
    console.log(`🔍 [MaxLogic] 使用公式字符串: ${formulaStr}`);
    const options = this.parseMaxFormula(formulaStr);
    console.log(`🔍 [MaxLogic] 解析出 ${options.length} 个选项:`, options);
    
    // 过滤选项（排除现金价值、等待期、18岁前等）
    const filteredOptions = this.filterMaxOptions(options, tier, currentAge);
    
    if (filteredOptions.length === 0) {
      console.warn(`⚠️ [MaxLogic] 所有选项都被过滤，返回空数组`);
      return [];
    }
    
    // 🎯 逐年比较：对每一年，计算所有选项的值，选择最大的
    const allYears: CalculatedAmount[] = [];
    let lastWinner = '';
    let switchCount = 0;
    
    for (let age = startAge; age <= endAge; age++) {
      const year = birthYear + age;
      const n = age - policyStartAge;
      
      // 当前年度已交保费
      const yearsElapsed = Math.min(n + 1, totalPaymentPeriod || 0);
      const paidPremiumWan = annualPremium && totalPaymentPeriod 
        ? (annualPremium / 10000) * yearsElapsed
        : 0;
      
      let maxValueThisYear = -Infinity;
      let winnerOptionThisYear = '';
      
      // 遍历所有选项，计算当年的值
      for (const opt of filteredOptions) {
        const valueThisYear = this.calculateOptionValue(
          opt, 
          tier, 
          n, 
          age, 
          basicSumInsuredWan, 
          paidPremiumWan
        );
        
        if (valueThisYear > maxValueThisYear) {
          maxValueThisYear = valueThisYear;
          winnerOptionThisYear = opt;
        }
      }
      
      // 记录winner切换（仅首次）
      if (winnerOptionThisYear !== lastWinner) {
        lastWinner = winnerOptionThisYear;
        switchCount++;
      }
      
      allYears.push({
        year,
        age,
        amount: parseFloat(maxValueThisYear.toFixed(1)),
        selectedOption: winnerOptionThisYear
      });
    }
    
    console.log(`✅ [MaxLogic] 逐年比较完成，共${allYears.length}年，Winner切换${switchCount}次`);
    console.log(`   前3年: ${allYears.slice(0, 3).map(k => `${k.year}年:${k.amount}万`).join(', ')}`);
    console.log(`   后3年: ${allYears.slice(-3).map(k => `${k.year}年:${k.amount}万`).join(', ')}`);
    
    return allYears;
  }

  /**
   * 解析Max公式，提取各选项
   */
  private parseMaxFormula(formula: string): string[] {
    if (!formula) return [];
    
    // 移除"Max("和")"
    const inner = formula.replace(/^Max\s*\(/i, '').replace(/\)\s*$/, '');
    
    // 按逗号分割，但要考虑括号内的逗号
    const options: string[] = [];
    let current = '';
    let depth = 0;
    
    for (const char of inner) {
      if (char === '(') depth++;
      else if (char === ')') depth--;
      else if (char === ',' && depth === 0) {
        options.push(current.trim());
        current = '';
        continue;
      }
      current += char;
    }
    if (current.trim()) options.push(current.trim());
    
    return options;
  }

  /**
   * 过滤Max选项（排除现金价值、等待期、18岁前等）
   */
  private filterMaxOptions(options: string[], tier: PayoutTier, currentAge: number): string[] {
    return options.filter(opt => {
      // 1. 排除现金价值
      if (opt.includes('现金价值')) return false;
      
      // 2. 根据period判断是否排除
      if (tier.period && tier.period.includes('<18') && currentAge >= 18) return false;
      
      // 3. 排除等待期内的
      if (tier.period && tier.period.includes('等待期内')) return false;
      return true;
    });
  }

  /**
   * 计算单个选项在特定年份的值
   */
  private calculateOptionValue(
    option: string, 
    tier: PayoutTier, 
    n: number, 
    age: number, 
    basicSumInsuredWan: number, 
    paidPremiumWan: number
  ): number {
    // 1. 复利公式
    if (option.includes('复利') || option.includes('(1+') || option.includes('^')) {
      const rate = tier.interestRate || 2.5;
      return basicSumInsuredWan * Math.pow(1 + rate / 100, n);
    }
    
    // 2. 基本保额/保险金额
    if (option.includes('基本保险金额') || option.includes('基本保额') || option.includes('保险金额') || option.includes('保额')) {
      if (option.includes('(1+') || option.includes('^')) {
        const rate = tier.interestRate || 2.5;
        return basicSumInsuredWan * Math.pow(1 + rate / 100, n);
      }
      return basicSumInsuredWan;
    }
    
    // 3. 已交保费×给付比例
    if ((option.includes('保费') || option.includes('保险费')) && (option.includes('×') || option.includes('比例'))) {
      const ratio = tier.ratio ? this.getRatioByAge(tier.ratio, age) : 1.6;
      return paidPremiumWan * ratio;
    }
    
    // 4. 纯已交保费/保险费
    if (option.includes('保费') || option.includes('保险费') || option.includes('已交')) {
      return paidPremiumWan;
    }
    
    return 0;
  }

  /**
   * ============================================
   * 已交保费计算
   * ============================================
   */
  private isPaidPremiumType(tier: PayoutTier): boolean {
    const formula = tier.formula || '';
    const value = typeof tier.value === 'string' ? tier.value : '';
    const basis = tier.basis || '';
    const combinedText = `${formula} ${value} ${basis}`;
    
    // 支持多种表述：已交保险费、已支付的保险费、已交保费等
    return combinedText.includes('已交保险费') || 
           combinedText.includes('已支付的保险费') ||
           combinedText.includes('已交保费') || 
           combinedText.includes('累计已交') ||
           (combinedText.includes('保险费') && (combinedText.includes('已') || combinedText.includes('支付')));
  }

  private calculatePaidPremium(tier: PayoutTier, policyInfo: PolicyInfo): CalculatedAmount[] {
    const { birthYear, policyStartYear, coverageEndYear, annualPremium, totalPaymentPeriod } = policyInfo;
    const currentAge = new Date().getFullYear() - birthYear;
    
    // 计算总保费（万元）
    const totalPremium = annualPremium && totalPaymentPeriod 
      ? (annualPremium / 10000) * totalPaymentPeriod 
      : 0;
    
    // 如果有给付比例，乘以对应年龄的比例
    let finalAmount = totalPremium;
    if (tier.ratio) {
      const ratio = this.getRatioByAge(tier.ratio, currentAge);
      finalAmount = totalPremium * ratio;
    }
    
    // 返回固定值（覆盖整个保障期间）
    const startAge = policyStartYear - birthYear;
    const endYear = coverageEndYear === 'lifetime' ? 'lifetime' : coverageEndYear;
    
    return [{
      year: policyStartYear,
      age: startAge,
      endYear: endYear,
      endAge: endYear === 'lifetime' ? 'lifetime' : (endYear as number) - birthYear,
      amount: parseFloat(finalAmount.toFixed(1)),
      isFixed: true,
      selectedOption: tier.formula || '已交保费'
    }];
  }

  /**
   * ============================================
   * 复利/单利计算
   * ============================================
   */
  private calculateCompoundOrSimple(tier: PayoutTier, policyInfo: PolicyInfo): CalculatedAmount[] {
    const { birthYear, policyStartYear, coverageEndYear, basicSumInsured, totalPaymentPeriod } = policyInfo;
    
    const currentAge = new Date().getFullYear() - birthYear;
    let startAge = Math.max(currentAge, policyStartYear - birthYear); // 从当前年龄开始
    const endYear = coverageEndYear === 'lifetime' ? null : coverageEndYear;
    let endAge = endYear ? (endYear as number) - birthYear : 100;
    const basicSumInsuredWan = basicSumInsured / 10000;
    
    // 🎯 根据tier.period确定年龄范围（同Max逻辑）
    if (tier.period) {
      const periodLower = tier.period.toLowerCase();
      const paymentStartAge = policyStartYear - birthYear;
      const paymentPeriodYears = parseInt(String(totalPaymentPeriod || '1'));
      const paymentEndAge = paymentStartAge + paymentPeriodYears - 1;
      
      // 🎯 检测"期内"的所有变体（同Max逻辑）
      const isDuringPayment = 
        periodLower.includes('期内') ||
        periodLower.includes('满日前') || periodLower.includes('满日零时之前') ||
        (periodLower.includes('交费期') && periodLower.includes('前')) ||
        (periodLower.includes('缴费期') && periodLower.includes('前'));
      
      if (isDuringPayment) {
        startAge = Math.max(currentAge, paymentStartAge);
        endAge = paymentEndAge;
      } else {
        // 🎯 只有不是"期内"时，才检测"期满后"（避免误判）
        // 🎯 检测"期满后"的所有变体（同Max逻辑）
        const isAfterPayment = 
          periodLower.includes('期满') && periodLower.includes('后') ||
          periodLower.includes('满日后') || periodLower.includes('满日零时之后');
        
        if (isAfterPayment) {
          startAge = Math.max(currentAge, paymentEndAge + 1);
          endAge = endYear ? (endYear as number) - birthYear : 100;
        }
      }
    }
    
    const interestRate = tier.interestRate || 3.5;
    const formulaType = tier.formulaType === 'compound' ? 'compound' : 'simple';
    const policyStartAge = policyStartYear - birthYear; // 投保时的年龄（用于计算保单年度）
    
    // 生成每一年的金额
    const allYears: CalculatedAmount[] = [];
    for (let age = startAge; age <= endAge; age++) {
      const year = birthYear + age; // 🎯 修复：根据年龄计算年份
      const n = age - policyStartAge; // 保单年度-1（从投保年龄开始计算）
      let amount: number;
      
      if (formulaType === 'compound') {
        amount = basicSumInsuredWan * Math.pow(1 + interestRate / 100, n);
      } else {
        amount = basicSumInsuredWan * (1 + interestRate / 100 * n);
      }
      
      allYears.push({
        year,
        age,
        amount: parseFloat(amount.toFixed(1))
      });
    }
    
    console.log(`💰 [CompoundOrSimple] 计算完成，共${allYears.length}年，前5年: ${allYears.slice(0, 5).map(k => `${k.year}年(${k.age}岁):${k.amount}万`).join(', ')}`);
    
    return allYears;
  }

  /**
   * ============================================
   * 工具方法
   * ============================================
   */
  
  /**
   * 根据年龄获取给付比例
   */
  private getRatioByAge(ratio: any, age: number): number {
    if (typeof ratio === 'number') return ratio;
    if (typeof ratio === 'object') {
      // 支持多种格式：{"18-40": 1.6, "41-60": 1.5} 或 {"18-40岁": 1.6}
      for (const [key, value] of Object.entries(ratio)) {
        const match = key.match(/(\d+)-(\d+)/);
        if (match) {
          const min = parseInt(match[1]);
          const max = parseInt(match[2]);
          if (age >= min && age <= max) {
            return typeof value === 'number' ? value : parseFloat(value as string);
          }
        } else if (key.includes('+') || key.includes('以上')) {
          const min = parseInt(key.match(/(\d+)/)?.[1] || '0');
          if (age >= min) {
            return typeof value === 'number' ? value : parseFloat(value as string);
          }
        }
      }
    }
    return 1.0; // 默认100%
  }
}

