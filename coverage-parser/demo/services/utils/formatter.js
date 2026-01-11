// ==================== 数据格式化服务（职责：仅负责数据格式化）====================
class DataFormatterService {
  static formatCoverageForDisplay(coverage, policyInfo = null) {
    const typeNames = {
      'disease': '疾病责任',
      'death': '身故责任',
      'accident': '意外责任',
      'annuity': '年金责任',
      'survival': '生存责任'
    };
    return {
      name: coverage.name,
      typeName: typeNames[coverage.type] || coverage.type,
      payoutAmount: this.formatPayoutAmount(coverage.parseResult.payoutAmount, policyInfo),
      payoutCount: this.formatPayoutCount(coverage.parseResult.payoutCount)
    };
  }

  static formatPolicyForDisplay(policy) {
    const typeNames = {
      'annuity': '年金险',
      'critical_illness': '重疾险',
      'accident': '意外险',
      'life': '人寿险'
    };
    
    const currentYear = new Date().getFullYear();
    
    // 计算投保时年龄
    let policyStartAgeDisplay = '';
    if (policy.birthYear && policy.policyStartYear) {
      const age = parseInt(policy.policyStartYear) - parseInt(policy.birthYear);
      policyStartAgeDisplay = `(${age}岁)`;
    }
    
    // 计算保障结束年龄
    let coverageEndDisplay = '终身';
    if (policy.coverageEndYear && policy.coverageEndYear !== 'lifetime') {
      const endAge = parseInt(policy.coverageEndYear) - parseInt(policy.birthYear);
      coverageEndDisplay = `${policy.coverageEndYear}年(${endAge}岁)`;
    }
    
    // 计算已交年数（年初交费，投保当年算第1年）
    let paidYears = 0;
    if (policy.policyStartYear) {
      paidYears = Math.max(0, currentYear - parseInt(policy.policyStartYear) + 1);
    }
    
    // 计算交费年限
    let totalPaymentPeriod = '未填写';
    if (policy.totalPaymentPeriod) {
      if (policy.totalPaymentPeriod === 'lifetime') {
        totalPaymentPeriod = '终身';
      } else {
        // 提取数字（如"10年"或"10"）
        const yearMatch = policy.totalPaymentPeriod.toString().match(/\d+/);
        if (yearMatch) {
          totalPaymentPeriod = yearMatch[0] + '年';
        } else {
          totalPaymentPeriod = policy.totalPaymentPeriod;
        }
      }
    }
    
    // 计算待交年数
    let remainingYears = '未填写';
    if (policy.totalPaymentPeriod && policy.totalPaymentPeriod !== 'lifetime') {
      const yearMatch = policy.totalPaymentPeriod.toString().match(/\d+/);
      if (yearMatch) {
        const totalYears = parseInt(yearMatch[0]);
        const remaining = Math.max(0, totalYears - paidYears);
        remainingYears = remaining + '年';
      }
    } else if (policy.totalPaymentPeriod === 'lifetime') {
      remainingYears = '终身';
    }
    
    // 格式化年交保费
    let annualPremiumDisplay = '未填写';
    if (policy.annualPremium) {
      annualPremiumDisplay = '¥' + Number(policy.annualPremium).toLocaleString();
    }
    
    return {
      insuranceCompany: policy.insuranceCompany || '未填写',
      productName: policy.productName,
      typeName: typeNames[policy.policyType] || policy.policyType,
      insuredPerson: policy.insuredPerson || '未填写',
      birthYear: policy.birthYear ? policy.birthYear + '年出生' : '未填写',
      policyStartYear: policy.policyStartYear ? policy.policyStartYear + '年' + policyStartAgeDisplay : '未填写',
      coverageEndYear: coverageEndDisplay,
      basicSumInsured: (policy.basicSumInsured / 10000).toFixed(2) + '万元',
      coverageCount: policy.coverages.length,
      totalPaymentPeriod: totalPaymentPeriod,
      paidYears: paidYears + '年',
      remainingYears: remainingYears,
      annualPremium: annualPremiumDisplay
    };
  }

  static formatPayoutAmount(data, policyInfo = null) {
    if (!data || data.confidence === 0) return '未识别';
    
    // 如果有保单信息，按年龄分段显示实际金额
    if (policyInfo && policyInfo.birthYear && policyInfo.policyStartYear && policyInfo.basicSumInsured) {
      return this.formatPayoutAmountWithAge(data, policyInfo);
    }
    
    // 没有保单信息时，显示百分比
    if (data.type === 'tiered' && data.details?.tiers) {
      return data.details.tiers.map(t => `${t.period}: ${t.value}%`).join('；');
    }
    if (data.type === 'percentage') {
      return `${data.details?.percentage || 0}%基本保额`;
    }
    if (data.type === 'fixed') {
      return `${(data.details?.fixedAmount || 0) / 10000}万元`;
    }
    return '未识别';
  }

  /**
   * 根据年龄分段格式化赔付金额
   */
  static formatPayoutAmountWithAge(data, policyInfo) {
    const { birthYear, policyStartYear, coverageEndYear, basicSumInsured } = policyInfo;
    const startAge = parseInt(policyStartYear) - parseInt(birthYear);
    const endYear = coverageEndYear === 'lifetime' ? null : parseInt(coverageEndYear);
    const endAge = endYear ? endYear - parseInt(birthYear) : null;
    const basicSumInsuredWan = basicSumInsured / 10000; // 转换为万元

    if (data.type === 'tiered' && data.details?.tiers) {
      const ageSegments = [];
      let currentAge = startAge;
      
      for (let i = 0; i < data.details.tiers.length; i++) {
        const tier = data.details.tiers[i];
        
        // 如果tier有startAge和endAge（用户输入的数据），直接使用
        if (tier.startAge !== undefined && tier.endAge !== undefined) {
          const actualAmount = tier.amount !== undefined ? tier.amount.toFixed(1) : '0.0';
          ageSegments.push(`${tier.startAge}岁～${tier.endAge}岁 ${actualAmount}万`);
          continue;
        }
        
        // 如果tier有period字段（原始解析结果），根据period计算
        if (!tier.period) {
          // 如果既没有startAge/endAge也没有period，跳过这个tier
          continue;
        }
        
        const percentage = tier.value || 100;
        const actualAmount = (basicSumInsuredWan * percentage / 100).toFixed(1); // 保留1位小数
        
        // 解析保单年度
        let years = 0;
        let isAfterPeriod = false;
        
        if (tier.period.includes('前') && tier.period.includes('个保单年度')) {
          const match = tier.period.match(/前(\d+)个保单年度/);
          if (match) {
            years = parseInt(match[1]);
          }
        } else if (tier.period === '之后' || (tier.period.includes('第') && tier.period.includes('起'))) {
          // 之后的部分，到保障结束年龄
          isAfterPeriod = true;
          // 如果是"第N个保单年度起"，需要计算从第N年开始的年龄
          const periodMatch = tier.period.match(/第(\d+)个保单年度起/);
          if (periodMatch) {
            const startPolicyYear = parseInt(periodMatch[1]);
            // 第N个保单年度 = 投保年龄 + (N-1)
            currentAge = startAge + (startPolicyYear - 1);
          }
        }
        
        if (isAfterPeriod) {
          // 之后的部分，从当前年龄到保障结束年龄
          const segmentEndAge = endAge || 100;
          if (currentAge <= segmentEndAge) {
            ageSegments.push(`${currentAge}岁～${segmentEndAge}岁 ${actualAmount}万`);
          }
          break;
        } else if (years > 0) {
          // 计算年龄范围：前N个保单年度
          const segmentStartAge = currentAge;
          const segmentEndAge = Math.min(currentAge + years - 1, endAge || 100);
          
          if (segmentStartAge <= segmentEndAge) {
            ageSegments.push(`${segmentStartAge}岁～${segmentEndAge}岁 ${actualAmount}万`);
            currentAge = segmentEndAge + 1;
          }
        }
        
        if (endAge && currentAge > endAge) break;
      }
      
      return ageSegments.join('；');
    }
    
    if (data.type === 'percentage') {
      const percentage = data.details?.percentage || 0;
      const actualAmount = (basicSumInsuredWan * percentage / 100).toFixed(1);
      const endAge = endYear ? endYear - parseInt(birthYear) : 100;
      return `${startAge}岁～${endAge}岁 ${actualAmount}万`;
    }
    
    if (data.type === 'fixed') {
      const actualAmount = (data.details?.fixedAmount || 0) / 10000;
      const endAge = endYear ? endYear - parseInt(birthYear) : 100;
      return `${startAge}岁～${endAge}岁 ${actualAmount.toFixed(1)}万`;
    }
    
    return '未识别';
  }

  static formatPayoutCount(data) {
    if (!data || data.confidence === 0) return '未识别';
    if (data.type === 'single') {
      return '单次赔付（合同终止）';
    }
    if (data.type === 'multiple') {
      return data.maxCount ? `最多${data.maxCount}次` : '多次赔付（不限次数）';
    }
    return '未识别';
  }

  static formatGrouping(data) {
    if (!data || data.confidence === 0) return '未识别';
    return data.isGrouped ? (data.groupCount ? `分${data.groupCount}组` : '分组') : '不分组';
  }

  static formatIntervalPeriod(data) {
    if (!data || data.confidence === 0) return '未识别';
    if (!data.hasInterval) return '无间隔期';
    return data.days ? `间隔${data.days}天` : (data.years ? `间隔${data.years}年` : '有间隔期');
  }

  static formatWaitingPeriod(data) {
    if (!data || data.confidence === 0) return '未识别';
    return data.days ? `等待期${data.days}天` : '未识别';
  }

  static formatConditions(conditions) {
    if (!conditions || !Array.isArray(conditions) || conditions.length === 0) return '无';
    return conditions.map(c => c.description || c.type).join('；');
  }
}








