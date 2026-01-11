// ==================== 硬规则解析器（职责：协调各个字段解析器，组装解析结果）====================
class RuleBasedParser {
  constructor(coverageType = 'disease') {
    this.coverageType = coverageType;
  }

  // 解析条款（协调各个独立的字段解析器）
  parse(clauseText) {
    const result = {};

    // 使用独立的字段解析器服务
    result.payoutAmount = PayoutAmountParserService.parse(clauseText, this.coverageType);
    result.payoutCount = PayoutCountParserService.parse(clauseText, this.coverageType);
    result.intervalPeriod = IntervalPeriodParserService.parse(clauseText, this.coverageType);
    // 等待期字段已移除，不再识别
    result.grouping = GroupingParserService.parse(clauseText, this.coverageType);
    result.repeatablePayout = RepeatablePayoutParserService.parse(clauseText, this.coverageType);
    result.premiumWaiver = PremiumWaiverParserService.parse(clauseText, this.coverageType);
    result.conditions = ConditionsParserService.parse(clauseText, this.coverageType);

    // 计算整体置信度
    const confidences = Object.entries(result)
      .filter(([field]) => field !== 'conditions' && field !== 'overallConfidence')
      .map(([, r]) => {
        if (Array.isArray(r)) {
          return r.length > 0 ? r.reduce((sum, c) => sum + (c.confidence || 0), 0) / r.length : 0;
        }
        return r.confidence || 0;
      });
    result.overallConfidence = confidences.length > 0 
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length 
      : 0;

    return result;
  }
}








