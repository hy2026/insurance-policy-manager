// ==================== 解析服务（职责：协调硬规则和大模型解析）====================
import { LLMServiceFactory } from './llm/LLMServiceFactory';
import { ILLMService } from './llm/interface/ILLMService';
import { HardRuleParser } from './hardRuleParser';
import { cacheService } from './cacheService';
import { CoverageApplicabilityService } from './coverageApplicabilityService';

interface PolicyInfo {
  birthYear?: number;           // 被保险人出生年份
  policyStartYear?: number;     // 投保开始年份
  coverageEndYear?: number | 'lifetime';  // 保障结束年份
  basicSumInsured?: number;     // 基本保额（万元）
  totalPaymentPeriod?: string; // 总缴费期限（如"20年"、"终身缴费"）
  annualPremium?: number;       // 每年保费（元）
  paymentMethod?: string;      // 缴费方式（如"趸交"、"分期支付"）
}

interface ParseRequest {
  clauseText: string;
  coverageType: string;
  policyInfo?: PolicyInfo;
}

interface ParseResponse {
  success: boolean;
  result?: any;
  message?: string;
  fromCache?: boolean;
  parseMethod?: string;
  rawResponse?: any;
}

export class ParseService {
  private llmService: ILLMService;

  constructor() {
    this.llmService = LLMServiceFactory.getInstance();
  }

  /**
   * 解析保险条款
   * @param request 解析请求
   * @returns 解析结果
   */
  async parse(request: ParseRequest): Promise<ParseResponse> {
    const { clauseText, coverageType, policyInfo } = request;

    // 参数验证
    if (!clauseText || !clauseText.trim()) {
      return {
        success: false,
        message: '条款文本不能为空'
      };
    }

    if (!coverageType) {
      return {
        success: false,
        message: '责任类型不能为空'
      };
    }

    try {
      // ⏱️ 开始总计时
      const parseStartTime = Date.now();
      const startTimeStr = new Date().toISOString();
      console.log(`\n${'='.repeat(80)}`);
      console.log(`🚀 [ParseService] 开始解析 - ${startTimeStr}`);
      console.log(`📋 [ParseService] 责任类型: ${coverageType} | 条款长度: ${clauseText.length}字符`);
      
      // 🎯 先检查缓存（如果条款文本完全相同，直接复用）
      const cachedResult = cacheService.get(clauseText, coverageType);
      if (cachedResult) {
        console.log('✅ [ParseService] 缓存命中！直接复用解析结果（节省API调用）');
        const hardRuleFields = HardRuleParser.parseAdditionalFields(clauseText);
        return {
          success: true,
          result: {
            ...cachedResult,
            ...hardRuleFields
          },
          fromCache: true,
          parseMethod: 'cache',
          message: '从缓存获取解析结果'
        };
      }
      
      // 🎯 缓存未命中，并行执行：大模型解析赔付金额 + 硬规则解析其他字段
      console.log('🚀 [ParseService] 缓存未命中，开始解析：大模型（赔付金额）+ 硬规则（其他字段）');
      
      const [llmResult, hardRuleFields] = await Promise.all([
        // 大模型：解析赔付金额（慢，30-60秒）
        this.llmService.parse(clauseText, coverageType, policyInfo),
        // 硬规则：解析其他字段（快，<10ms）
        Promise.resolve(HardRuleParser.parseAdditionalFields(clauseText))
      ]);
      
      const parseEndTime = Date.now();
      const totalDuration = ((parseEndTime - parseStartTime) / 1000).toFixed(2);
      const endTimeStr = new Date().toISOString();
      
      console.log('✅ [ParseService] 大模型解析完成');
      console.log('✅ [ParseService] 硬规则解析完成');
      
      // 🔍 详细日志：检查大模型返回的数据结构
      console.log('\n🔍 [ParseService] ========== 大模型返回结果检查 ==========');
      console.log('📊 [ParseService] llmResult类型:', typeof llmResult);
      console.log('📊 [ParseService] llmResult键:', Object.keys(llmResult || {}));
      console.log('📊 [ParseService] payoutAmount存在:', !!llmResult?.payoutAmount);
      console.log('📊 [ParseService] payoutAmount类型:', typeof llmResult?.payoutAmount);
      if (llmResult?.payoutAmount) {
        console.log('📊 [ParseService] payoutAmount键:', Object.keys(llmResult.payoutAmount));
        console.log('📊 [ParseService] payoutAmount.details存在:', !!llmResult.payoutAmount.details);
        if (llmResult.payoutAmount.details) {
          console.log('📊 [ParseService] payoutAmount.details键:', Object.keys(llmResult.payoutAmount.details));
          console.log('📊 [ParseService] tiers存在:', !!llmResult.payoutAmount.details.tiers);
          console.log('📊 [ParseService] tiers长度:', llmResult.payoutAmount.details.tiers?.length || 0);
        }
      }
      console.log('📊 [ParseService] 完整llmResult:', JSON.stringify(llmResult, null, 2));
      console.log('🔍 [ParseService] ============================================\n');
      
      console.log(`⏱️ [ParseService] 总耗时: ${totalDuration}秒`);
      console.log(`✅ [ParseService] 解析完成 - ${endTimeStr}`);
      console.log(`${'='.repeat(80)}\n`);
      
      // 🎯 规范化payoutAmount结构：确保tiers在details中（zhipuService已经处理，这里做二次检查）
      let normalizedPayoutAmount = llmResult.payoutAmount;
      if (normalizedPayoutAmount) {
        // 如果tiers直接在payoutAmount下，移动到details中（兜底逻辑）
        if (normalizedPayoutAmount.tiers && !normalizedPayoutAmount.details) {
          normalizedPayoutAmount = {
            ...normalizedPayoutAmount,
            details: {
              tiers: normalizedPayoutAmount.tiers
            }
          };
          // 移除顶层的tiers
          delete normalizedPayoutAmount.tiers;
          console.log('📝 [ParseService] 兜底：已将payoutAmount.tiers包装到payoutAmount.details.tiers中');
        } else if (normalizedPayoutAmount.tiers && normalizedPayoutAmount.details) {
          // 如果两者都存在，优先使用details中的
          if (!normalizedPayoutAmount.details.tiers && !normalizedPayoutAmount.details.conditions) {
            normalizedPayoutAmount.details.tiers = normalizedPayoutAmount.tiers;
          }
          delete normalizedPayoutAmount.tiers;
          console.log('📝 [ParseService] 兜底：已将payoutAmount.tiers合并到payoutAmount.details.tiers中');
        }
      }
      
      // 🎯 检查责任适用性（如果有保单信息且解析结果包含tiers）
      if (policyInfo && normalizedPayoutAmount?.details?.tiers) {
        const applicabilityCheck = CoverageApplicabilityService.checkApplicability(
          normalizedPayoutAmount.details.tiers,
          policyInfo
        );

        if (!applicabilityCheck.isApplicable) {
          console.log(`⚠️ [ParseService] 责任不适用: ${applicabilityCheck.reason}`);
          // 返回不适用结果，不包含解析字段
          return {
            success: true,
            result: CoverageApplicabilityService.createNotApplicableResult(
              '责任',
              applicabilityCheck.reason || '条件不满足'
            ),
            fromCache: false,
            parseMethod: 'applicability_check',
            message: `此责任不适用：${applicabilityCheck.reason}`
          };
        }
      }

      // 🎯 如果是不适用结果，直接返回，不合并硬规则字段
      if (llmResult.status === 'not_applicable') {
        return {
          success: true,
          result: llmResult,
          fromCache: false,
          parseMethod: 'applicability_check',
          message: llmResult.reason || '此责任不适用'
        };
      }
      
      // 🎯 合并结果：硬规则字段优先（如果有值），否则保留大模型结果
      // ⚠️ 使用 ?? null 确保字段始终存在（前端需要显示默认值）
      const mergedResult = {
        ...llmResult,
        payoutAmount: normalizedPayoutAmount,
        // 赔付次数：优先使用硬规则
        payoutCount: hardRuleFields.payoutCount || llmResult.payoutCount || null,
        // 间隔期：优先使用硬规则，确保字段存在
        intervalPeriod: hardRuleFields.intervalPeriod || llmResult.intervalPeriod || null,
        // 分组：优先使用硬规则，确保字段存在
        grouping: hardRuleFields.grouping || llmResult.grouping || null,
        // 重复赔付：优先使用硬规则，确保字段存在
        repeatablePayout: hardRuleFields.repeatablePayout || llmResult.repeatablePayout || null,
        // 豁免保费：优先使用硬规则，确保字段存在
        premiumWaiver: hardRuleFields.premiumWaiver || llmResult.premiumWaiver || null,
        // 标记哪些字段来自硬规则
        parseMethodDetails: {
          payoutAmount: 'llm',
          payoutCount: hardRuleFields.payoutCount ? 'hard_rule' : 'llm',
          intervalPeriod: hardRuleFields.intervalPeriod ? 'hard_rule' : 'none',
          grouping: hardRuleFields.grouping ? 'hard_rule' : 'none',
          repeatablePayout: hardRuleFields.repeatablePayout ? 'hard_rule' : 'none',
          premiumWaiver: hardRuleFields.premiumWaiver ? 'hard_rule' : 'none'
        }
      };
      
      // 💾 保存到缓存（24小时有效期）
      // 注意：如果条款文本完全相同（包括比例），会复用缓存
      // 如果比例改了（文本不同），hash不同，会重新解析 ✅
      cacheService.set(clauseText, coverageType, mergedResult, 24 * 60 * 60 * 1000);
      console.log('💾 [ParseService] 解析结果已保存到缓存（24小时有效）');
      
      return {
        success: true,
        result: mergedResult,
        fromCache: false,
        parseMethod: 'hybrid', // 混合模式
        rawResponse: llmResult.rawLLMResponse || null
      };
    } catch (error: any) {
      const errorTime = new Date().toISOString();
      const errorType = error.response?.status ? `HTTP ${error.response.status}` : error.code || 'Unknown';
      const errorMessage = error.response?.data?.error?.message || error.message || '未知错误';
      
      console.error(`\n${'='.repeat(80)}`);
      console.error(`❌ [ParseService] 解析失败 - ${errorTime}`);
      console.error(`❌ [ParseService] 错误类型: ${errorType}`);
      console.error(`❌ [ParseService] 错误信息: ${errorMessage}`);
      if (error.response?.data) {
        console.error(`❌ [ParseService] 错误详情:`, JSON.stringify(error.response.data, null, 2));
      }
      console.error(`${'='.repeat(80)}\n`);
      
      // 降级逻辑：大模型失败，尝试返回硬规则部分识别结果
      const isTimeoutOrNetworkError = 
        error.message?.includes('timeout') || 
        error.message?.includes('无法连接') ||
        error.message?.includes('ECONNABORTED') ||
        error.message?.includes('ECONNREFUSED') ||
        error.message?.includes('ENOTFOUND') ||
        error.message?.includes('ETIMEDOUT');
      
      const isRateLimitError = 
        error.message?.includes('并发') ||
        error.message?.includes('429') ||
        error.message?.includes('rate limit') ||
        error.message?.includes('Too Many Requests');
      
      // 超时、网络错误或限流错误都尝试硬规则降级
      if (isTimeoutOrNetworkError || isRateLimitError) {
        const errorType = isRateLimitError ? '并发限制' : '超时';
        console.warn(`⚠️ [ParseService] 大模型${errorType}，尝试硬规则降级`);
        const hardRuleResult = HardRuleParser.parse(clauseText, coverageType);
        if (hardRuleResult.matched) {
          console.log('✅ [ParseService] 硬规则降级成功');
          return {
            success: true,
            result: hardRuleResult.result,
            parseMethod: 'hard_rule_fallback',
            message: isRateLimitError 
              ? '⚠️ API并发限制，已使用规则解析（结果可能不完整，建议稍后重试）' 
              : '⚠️ 大模型超时，已使用规则解析（结果可能不完整）'
          };
        }
        
        return {
          success: false,
          message: isRateLimitError 
            ? 'API并发数过高，请等待几秒后重试，或手动输入赔付信息' 
            : '大模型调用超时，请稍后重试或手动输入',
          parseMethod: isRateLimitError ? 'rate_limit' : 'timeout'
        };
      }
      
      return {
        success: false,
        message: error.message || '解析失败，请稍后重试'
      };
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{ status: string; cache: any }> {
    const cacheStats = cacheService.getStats();
    return {
      status: 'ok',
      cache: cacheStats
    };
  }

  /**
   * 清除所有缓存
   */
  clearCache(): { success: boolean; message: string } {
    try {
      cacheService.clear();
      console.log('🗑️ [ParseService] 缓存已清空');
      return {
        success: true,
        message: '缓存已清空'
      };
    } catch (error: any) {
      console.error('❌ [ParseService] 清空缓存失败:', error);
      return {
        success: false,
        message: error.message || '清空缓存失败'
      };
    }
  }

  /**
   * 清除指定条款的缓存
   */
  clearClauseCache(clauseText: string, coverageType: string): { success: boolean; message: string } {
    try {
      // 通过设置过期时间为0来强制清除
      cacheService.set(clauseText, coverageType, null, 0);
      console.log('🗑️ [ParseService] 指定条款缓存已清除');
      return {
        success: true,
        message: '指定条款缓存已清除'
      };
    } catch (error: any) {
      console.error('❌ [ParseService] 清除缓存失败:', error);
      return {
        success: false,
        message: error.message || '清除缓存失败'
      };
    }
  }

  /**
   * 🎯 Streaming模式解析
   * @param request 解析请求（包含onChunk回调）
   * @returns 解析结果
   */
  async parseStream(request: ParseRequest & { onChunk: (chunk: string) => void }): Promise<ParseResponse> {
    const { clauseText, coverageType, policyInfo } = request;
    
    // ⚠️ 功能暂未实现：Streaming模式已废弃
    console.warn('⚠️ [ParseService] parseStream已废弃，降级到普通解析');
    
    // 降级到普通解析
    return this.parse({ clauseText, coverageType, policyInfo });
  }

  /**
   * 🔄 根据当前公式重新计算金额
   * @param tier 阶段数据（包含公式信息）
   * @param policyInfo 保单信息
   * @returns 计算结果
   */
  async recalculate(tier: any, policyInfo: PolicyInfo): Promise<any> {
    console.log('🔄 [ParseService] 开始重新计算金额');
    console.log('📊 [ParseService] tier:', JSON.stringify(tier, null, 2));
    console.log('📊 [ParseService] policyInfo:', JSON.stringify(policyInfo, null, 2));
    
    try {
      // TODO: 重新计算逻辑需要迁移到独立的计算服务
      // 暂时返回空数组
      const keyAmounts: any[] = [];
      
      console.log('✅ [ParseService] 重新计算完成，keyAmounts长度:', keyAmounts.length);
      
      // ⚠️ 直接返回数组，不要包装，路由层会再包装一次
      return keyAmounts;
    } catch (error: any) {
      console.error('❌ [ParseService] 重新计算失败:', error);
      throw error;
    }
  }
}


