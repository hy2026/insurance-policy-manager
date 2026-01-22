/**
 * 结果收集服务
 * 
 * 职责：从UI表单中收集用户修改后的解析结果
 */

class ResultCollectionService {
  /**
   * 收集用户修改后的解析结果
   * @param {Object} originalResult - 原始解析结果
   * @returns {Object} 更新后的解析结果
   */
  static collect(originalResult) {
    const result = JSON.parse(JSON.stringify(originalResult)); // 深拷贝

    // 1. 赔付金额（收集多阶段数据）
    this._collectPayoutAmount(result, originalResult);

    // 2. 赔付次数
    this._collectPayoutCount(result);

    // 3. 是否分组
    this._collectGrouping(result);

    // 4. 是否可以重复赔付
    this._collectRepeatablePayout(result);

    // 5. 间隔期
    this._collectIntervalPeriod(result);

    // 6. 是否豁免保费
    this._collectPremiumWaiver(result);

    return result;
  }

  /**
   * 收集赔付金额
   */
  static _collectPayoutAmount(result, originalResult) {
    const payoutAmountItem = document.getElementById('payoutAmountItem');
    if (!payoutAmountItem) return;

    const tiers = [];
    const tierInputs = payoutAmountItem.querySelectorAll('[data-tier]');
    const tierMap = {};

    // 按阶段分组收集数据
    tierInputs.forEach(input => {
      const tierIndex = input.getAttribute('data-tier');
      const field = input.getAttribute('data-field');

      if (!tierMap[tierIndex]) {
        tierMap[tierIndex] = {};
      }

      if (input.type === 'number') {
        tierMap[tierIndex][field] = input.value ? parseFloat(input.value) : null;
      } else if (input.tagName === 'SELECT') {
        tierMap[tierIndex][field] = input.value;
      }
    });

    // 转换为tiers数组（保留原始tier的完整数据）
    Object.keys(tierMap).sort((a, b) => parseInt(a) - parseInt(b)).forEach(tierIndex => {
      const tierData = tierMap[tierIndex];
      const index = parseInt(tierIndex);

      // 获取原始tier的完整数据
      const originalTier = originalResult.payoutAmount?.details?.tiers?.[index] || 
                          originalResult.payoutAmount?.details?.conditions?.[index] || {};

      // 合并：保留原始数据，只更新用户修改的字段
      const updatedTier = {
        ...originalTier,
        amount: tierData.amount !== null ? tierData.amount : originalTier.amount,
        startAge: tierData.startAge !== null ? tierData.startAge : originalTier.startAge,
        endAge: tierData.endAge !== null ? tierData.endAge : originalTier.endAge,
        increase: tierData.increase || originalTier.increase || 0,
        interestType: tierData.interestType || originalTier.interestType || 'simple'
      };

      tiers.push(updatedTier);
    });

    if (tiers.length > 0) {
      result.payoutAmount = {
        type: 'tiered',
        details: { tiers },
        confidence: result.payoutAmount?.confidence || 0.8,
        extractedText: result.payoutAmount?.extractedText || ''
      };
    } else if (result.payoutAmount && result.payoutAmount.type === 'tiered' && result.payoutAmount.details?.tiers) {
      // 如果用户没有修改输入框，直接保留原始tiers（包含所有字段）
      result.payoutAmount.details.tiers = result.payoutAmount.details.tiers.map(tier => {
        if (!tier.startAge && !tier.endAge && !tier.period) {
          return null;
        }
        const cleanedTier = { ...tier };
        if (tier.period === undefined) {
          delete cleanedTier.period;
        }
        return cleanedTier;
      }).filter(tier => tier !== null);

      if (result.payoutAmount.details.tiers.length === 0) {
        delete result.payoutAmount;
      }
    }
  }

  /**
   * 收集赔付次数
   */
  static _collectPayoutCount(result) {
    const payoutCountInput = document.getElementById('payoutCountInput');
    const count = payoutCountInput && payoutCountInput.value ? parseInt(payoutCountInput.value) : 1;
    result.payoutCount = {
      type: count === 1 ? 'single' : 'multiple',
      maxCount: count,
      terminateAfterPayout: count === 1,
      confidence: result.payoutCount?.confidence || 0.8,
      extractedText: result.payoutCount?.extractedText || ''
    };
  }

  /**
   * 收集分组信息
   */
  static _collectGrouping(result) {
    const groupingRadio = document.querySelector('input[name="groupingRadio"]:checked');
    const groupingValue = groupingRadio ? groupingRadio.value : 'not_grouped';
    const count = result.payoutCount?.maxCount || 1;

    if (groupingValue === 'not_applicable') {
      result.grouping = {
        isGrouped: false,
        confidence: 0.8,
        extractedText: result.grouping?.extractedText || '一次赔付不涉及'
      };
    } else {
      result.grouping = {
        isGrouped: groupingValue === 'grouped',
        confidence: result.grouping?.confidence || (groupingValue === 'not_grouped' && count >= 2 && !result.grouping ? 0 : 0.8),
        extractedText: result.grouping?.extractedText || ''
      };
    }
  }

  /**
   * 收集重复赔付信息
   */
  static _collectRepeatablePayout(result) {
    const repeatablePayoutRadio = document.querySelector('input[name="repeatablePayoutRadio"]:checked');
    const repeatableValue = repeatablePayoutRadio ? repeatablePayoutRadio.value : 'repeatable';
    const count = result.payoutCount?.maxCount || 1;

    if (repeatableValue === 'not_applicable') {
      result.repeatablePayout = {
        isRepeatable: false,
        confidence: 0.8,
        extractedText: result.repeatablePayout?.extractedText || '一次赔付不涉及'
      };
    } else {
      result.repeatablePayout = {
        isRepeatable: repeatableValue === 'repeatable',
        confidence: result.repeatablePayout?.confidence || (repeatableValue === 'repeatable' && count >= 2 && !result.repeatablePayout ? 0 : 0.8),
        extractedText: result.repeatablePayout?.extractedText || ''
      };
    }
  }

  /**
   * 收集间隔期
   */
  static _collectIntervalPeriod(result) {
    const intervalPeriodInput = document.getElementById('intervalPeriodInput');
    const days = intervalPeriodInput && intervalPeriodInput.value !== '' ? parseInt(intervalPeriodInput.value) || 0 : 0;
    result.intervalPeriod = {
      hasInterval: days > 0,
      days: days > 0 ? days : null,
      confidence: result.intervalPeriod?.confidence || 0.8,
      extractedText: result.intervalPeriod?.extractedText || ''
    };
  }

  /**
   * 收集豁免保费信息
   */
  static _collectPremiumWaiver(result) {
    const premiumWaiverRadio = document.querySelector('input[name="premiumWaiverRadio"]:checked');
    const waiverValue = premiumWaiverRadio ? premiumWaiverRadio.value : 'not_waived';
    result.premiumWaiver = {
      isWaived: waiverValue === 'waived',
      confidence: result.premiumWaiver?.confidence || 0.8,
      extractedText: result.premiumWaiver?.extractedText || ''
    };
  }
}

// 全局访问
window.ResultCollectionService = ResultCollectionService;


















































