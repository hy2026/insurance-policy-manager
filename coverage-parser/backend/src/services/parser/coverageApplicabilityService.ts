/**
 * 责任适用性检查服务
 * 
 * 职责：
 * 1. 检查责任是否适用于当前保单信息
 * 2. 根据ageCondition、policyYearRange等条件判断
 * 3. 如果不适用，返回简化的结果（不解析，只显示不适用原因）
 */

export interface PolicyInfo {
  birthYear?: number;           // 被保险人出生年份
  policyStartYear?: number;     // 投保开始年份
  coverageEndYear?: number | 'lifetime';  // 保障结束年份
  basicSumInsured?: number;     // 基本保额（元）
  totalPaymentPeriod?: string; // 总缴费期限
  annualPremium?: number;       // 每年保费（元）
}

export interface PayoutTier {
  period?: string;
  waitingPeriodStatus?: 'during' | 'after';
  ageCondition?: {
    limit: number;
    operator: '<' | '>=' | '>' | '<=';
    type?: '投保时' | '确诊时';  // 新增：区分是投保时的年龄还是确诊时的年龄
  };
  policyYearRange?: {
    start: number | null;
    end: number | null;
  };
  [key: string]: any;
}

export interface ApplicabilityCheckResult {
  isApplicable: boolean;
  reason?: string;  // 如果不适用，说明原因
}

export class CoverageApplicabilityService {
  /**
   * 检查保障期限是否已结束
   * @param policyInfo 保单信息
   * @returns 是否已结束及原因
   */
  static checkCoverageExpired(policyInfo?: PolicyInfo): ApplicabilityCheckResult {
    if (!policyInfo || !policyInfo.coverageEndYear) {
      return { isApplicable: true };
    }

    const currentYear = new Date().getFullYear();
    
    // 检查保障期限是否已结束
    if (policyInfo.coverageEndYear !== 'lifetime') {
      if (currentYear > policyInfo.coverageEndYear) {
        return {
          isApplicable: false,
          reason: `保障期限已于${policyInfo.coverageEndYear}年结束（当前年份：${currentYear}年）`
        };
      }
    }

    return { isApplicable: true };
  }

  /**
   * 检查责任是否适用
   * @param tiers 赔付阶段数组
   * @param policyInfo 保单信息
   * @returns 适用性检查结果
   */
  static checkApplicability(
    tiers: PayoutTier[],
    policyInfo?: PolicyInfo
  ): ApplicabilityCheckResult {
    // 如果没有保单信息，无法判断，默认适用
    if (!policyInfo || !policyInfo.birthYear || !policyInfo.policyStartYear) {
      return { isApplicable: true };
    }

    // 首先检查保障期限是否已结束
    const expiredCheck = this.checkCoverageExpired(policyInfo);
    if (!expiredCheck.isApplicable) {
      return expiredCheck;
    }

    const birthYear = policyInfo.birthYear;
    const policyStartYear = policyInfo.policyStartYear;
    const currentYear = new Date().getFullYear();
    
    // 计算投保年龄
    const policyStartAge = policyStartYear - birthYear;

    // 检查每个tier的适用性
    for (const tier of tiers) {
      // 1. 检查年龄条件（ageCondition）
      if (tier.ageCondition) {
        const { limit, operator, type = '确诊时' } = tier.ageCondition;
        
        // 根据type判断使用哪个年龄
        let checkAge: number;
        if (type === '投保时') {
          checkAge = policyStartAge;
        } else {
          // 确诊时：使用当前年龄（或可以传入确诊年龄）
          checkAge = currentYear - birthYear;
        }

        // 判断年龄条件是否满足
        let ageConditionMet = false;
        switch (operator) {
          case '<':
            ageConditionMet = checkAge < limit;
            break;
          case '>=':
            ageConditionMet = checkAge >= limit;
            break;
          case '>':
            ageConditionMet = checkAge > limit;
            break;
          case '<=':
            ageConditionMet = checkAge <= limit;
            break;
        }

        if (!ageConditionMet) {
          const ageTypeText = type === '投保时' ? '投保年龄' : '确诊年龄';
          // 根据运算符和实际年龄生成正确的错误信息
          let operatorText = '';
          let requirementText = '';
          
          if (operator === '<') {
            // 要求 < limit，但实际 >= limit
            if (checkAge >= limit) {
              operatorText = '已满';
              requirementText = '未满';
            } else {
              // 这种情况理论上不会发生（因为ageConditionMet已经是false）
              operatorText = '未满';
              requirementText = '未满';
            }
          } else if (operator === '>=') {
            // 要求 >= limit，但实际 < limit
            if (checkAge < limit) {
              operatorText = '未满';
              requirementText = '已满';
            } else {
              operatorText = '已满';
              requirementText = '已满';
            }
          } else if (operator === '>') {
            // 要求 > limit，但实际 <= limit
            if (checkAge <= limit) {
              operatorText = '不超过';
              requirementText = '超过';
            } else {
              operatorText = '超过';
              requirementText = '超过';
            }
          } else if (operator === '<=') {
            // 要求 <= limit，但实际 > limit
            if (checkAge > limit) {
              operatorText = '超过';
              requirementText = '不超过';
            } else {
              operatorText = '不超过';
              requirementText = '不超过';
            }
          }
          
          return {
            isApplicable: false,
            reason: `${ageTypeText}${operatorText}${limit}周岁（要求：${ageTypeText}${requirementText}${limit}周岁）`
          };
        }
      }

      // 2. 检查保单年度范围（policyYearRange）
      if (tier.policyYearRange) {
        const { start, end } = tier.policyYearRange;
        const currentPolicyYear = currentYear - policyStartYear + 1; // 当前保单年度（从1开始）

        // 检查是否在范围内
        let inRange = true;
        if (start !== null && currentPolicyYear < start) {
          inRange = false;
        }
        if (end !== null && currentPolicyYear > end) {
          inRange = false;
        }

        if (!inRange) {
          const rangeText = end === null 
            ? `第${start}个保单年度起`
            : start === null
            ? `第${end}个保单年度前`
            : `第${start}-${end}个保单年度`;
          return {
            isApplicable: false,
            reason: `当前保单年度为第${currentPolicyYear}年，不在适用范围内（要求：${rangeText}）`
          };
        }
      }
    }

    // 所有条件都满足
    return { isApplicable: true };
  }

  /**
   * 创建不适用责任的简化结果
   * @param coverageName 责任名称
   * @param reason 不适用原因
   * @returns 简化的解析结果
   */
  static createNotApplicableResult(
    coverageName: string,
    reason: string
  ): any {
    return {
      naturalLanguageDescription: `此责任不适用：${reason}`,
      status: 'not_applicable',
      reason: reason,
      // 不包含payoutAmount等解析字段
    };
  }
}

