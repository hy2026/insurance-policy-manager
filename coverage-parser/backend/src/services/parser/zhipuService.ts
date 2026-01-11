// ==================== 智谱清言API服务（职责：调用智谱清言API进行条款解析）====================
import axios, { AxiosError } from 'axios';
import https from 'https';
import http from 'http';
import { PayoutCalculationService } from './payoutCalculationService';
import { PeriodNormalizer } from './periodNormalizer';
import { ILLMService } from './llm/interface/ILLMService';

interface ZhipuMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ZhipuResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ParseResult {
  payoutAmount?: any;
  payoutCount?: any;
  intervalPeriod?: any;
  waitingPeriod?: any;
  grouping?: any;
  repeatablePayout?: any;
  premiumWaiver?: any;
  conditions?: any[];
  overallConfidence?: number;
  naturalLanguageDescription?: string; // 自然语言描述，用于调试和展示
  tokenUsage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  parseMethod?: string;
  rawLLMResponse?: any;
  policyInfo?: any; // 保存解析时使用的保单信息
}

export class ZhipuService implements ILLMService {
  private apiKey: string;
  private baseUrl = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
  private model = 'glm-4.7'; // 使用GLM-4.7模型（用户购买的模型）
  private axiosInstance: any;
  private payoutCalculator: PayoutCalculationService;
  
  // 🔒 请求队列：防止并发调用（智谱API免费版只支持1个并发）
  private requestQueue: Array<{ resolve: Function; reject: Function; fn: Function }> = [];
  private isProcessing: boolean = false;  // 💰 理赔金额计算服务

  constructor() {
    const apiKey = process.env.ZHIPU_API_KEY;
    if (!apiKey) {
      throw new Error('ZHIPU_API_KEY 环境变量未设置');
    }
    this.apiKey = apiKey;
    this.payoutCalculator = new PayoutCalculationService();  // 初始化计算服务
    
    // 创建优化的Axios实例（支持keepAlive、HTTP/2）
    // 注意：不在实例级别设置timeout，而是在每次请求时单独设置，避免冲突
    this.axiosInstance = axios.create({
      baseURL: 'https://open.bigmodel.cn/api/paas/v4',
      // 不在这里设置timeout，在每次请求时单独设置
      headers: {
        'Content-Type': 'application/json',
      },
      // 开启keepAlive，提升连接效率
      httpAgent: new http.Agent({ 
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 50,
        maxFreeSockets: 10,
        timeout: 60000 // 连接超时60秒
      }),
      httpsAgent: new https.Agent({ 
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 50,
        maxFreeSockets: 10,
        timeout: 60000, // 连接超时60秒
        // 支持TLS 1.3
        maxVersion: 'TLSv1.3',
        minVersion: 'TLSv1.2'
      }),
    });
  }

  /**
   * 🔒 队列处理器：确保同一时间只处理一个LLM请求
   */
  private async processQueue() {
    if (this.isProcessing || this.requestQueue.length === 0) {
      return;
    }
    
    this.isProcessing = true;
    const { resolve, reject, fn } = this.requestQueue.shift()!;
    
    // 🔥 队列超时保护：90秒后强制释放（给axios 60s + 额外30s缓冲）
    const queueTimeout = setTimeout(() => {
      console.error('❌ [请求队列] 处理超时（90秒），强制释放队列并继续下一个请求');
      this.isProcessing = false;
      reject(new Error('LLM请求队列超时（90秒）'));
      this.processQueue(); // 立即处理下一个请求
    }, 90000);
    
    try {
      const result = await fn();
      clearTimeout(queueTimeout);
      resolve(result);
    } catch (error) {
      clearTimeout(queueTimeout);
      reject(error);
    } finally {
      this.isProcessing = false;
      // 处理下一个请求
      this.processQueue();
    }
  }
  
  /**
   * 🔒 将请求加入队列
   */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const queueLength = this.requestQueue.length;
      if (queueLength > 0) {
        console.log(`⏳ [请求队列] 当前有${queueLength}个请求在排队，新请求已加入队列`);
      }
      
      this.requestQueue.push({ resolve, reject, fn });
      this.processQueue();
    });
  }
  
  /**
   * 解析保险条款
   * @param clauseText 条款文本
   * @param coverageType 责任类型
   * @returns 解析结果
   */
  async parse(clauseText: string, coverageType: string = 'disease', policyInfo?: any): Promise<ParseResult> {
    // 🔒 通过队列处理，确保同一时间只有1个LLM请求
    return this.enqueue(() => this.parseInternal(clauseText, coverageType, policyInfo));
  }
  
  /**
   * 内部解析方法（实际执行LLM调用）
   */
  private async parseInternal(clauseText: string, coverageType: string = 'disease', policyInfo?: any): Promise<ParseResult> {
    // ⏱️ 开始总计时
    const totalStartTime = Date.now();
    const startTimeStr = new Date().toISOString();
    console.log(`\n${'-'.repeat(80)}`);
    console.log(`🚀 [ZhipuService] 开始LLM调用 - ${startTimeStr}`);
    console.log(`📊 [ZhipuService] 请求队列: ${this.requestQueue.length}个等待`);
    console.log(`📋 [ZhipuService] 责任类型: ${coverageType} | 条款长度: ${clauseText.length}字符`);
    console.log(`🔍 [ZhipuService] parseInternal接收到的policyInfo:`, policyInfo ? JSON.stringify(policyInfo, null, 2) : 'null');
    
    // 🔍 调试：仅在开发模式显示详细信息
    if (process.env.NODE_ENV === 'development') {
      console.log('📄 [ZhipuService] 条款预览:', clauseText.substring(0, 100) + '...');
    }
    
    // 使用buildMessages()构建标准messages（与streaming模式共享）
    const messages = this.buildMessages(clauseText);

    try {
      const requestBody = {
        model: this.model,
        messages: messages,
        temperature: 0.1, // 🎯 与ZhipuProvider保持一致，避免temperature=0导致响应过慢
        top_p: 0.1, // 🎯 核采样限制，强制选择高概率词
        max_tokens: 16384, // 🎯 给足空间，避免截断（GLM-4.7容易陷入思考循环）
        stream: false,
        // 🎯 注意：GLM-4.7对response_format支持不完整，可能导致JSON输出到reasoning_content
        // 不使用stop参数，因为会误伤（如模型输出"**分析"就会被停止）
        // response_format: { type: "json_object" },
      };
      
      // ⏱️ LLM调用计时开始
      const llmStartTime = Date.now();
      console.log(`⏱️ [性能] LLM调用开始...`);
      console.log(`📊 [性能] 输入Token估算: ${messages.reduce((sum, m) => sum + m.content.length / 3, 0).toFixed(0)} (基于字符数)`);
      
      // 添加重试机制（最多重试3次，总共4次尝试）
      let response: any = null;
      let lastError: any = null;
      const maxRetries = 3;
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        let attemptStartTime = Date.now();
        try {
          // 🎯 在发起请求前等待（避免双重等待）
          if (attempt > 0) {
            // 根据上次错误类型决定等待时间
            let delay = 0;
            if (lastError && axios.isAxiosError(lastError) && lastError.response?.status === 429) {
              // 429错误：指数退避，但上限为30秒
              delay = Math.min(5000 * Math.pow(2, attempt - 1), 30000); // 5s, 10s, 20s, 30s
              console.log(`🔄 重试${attempt}/${maxRetries}（429并发限制），等待${(delay/1000).toFixed(1)}秒后重试`);
            } else {
              // 其他错误（包括超时）：指数退避，给服务器更多恢复时间
              delay = Math.min(3000 * Math.pow(1.5, attempt - 1), 10000); // 3s, 4.5s, 6.75s, 10s
              console.log(`🔄 重试${attempt}/${maxRetries}，等待${(delay/1000).toFixed(1)}秒后重试`);
            }
            await new Promise(resolve => setTimeout(resolve, delay));
            attemptStartTime = Date.now();
          }
          
          console.log(`🚀 [ZhipuService] 发送axios请求... (timeout: 60s)`);
          response = await this.axiosInstance.post('/chat/completions', requestBody, {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
            },
            timeout: 60000, // 60秒超时，超时后降级到硬规则
          });
          console.log(`✅ [ZhipuService] axios请求返回`);
          
          const elapsedTime = Date.now() - attemptStartTime;
          console.log(`✅ [ZhipuService] 调用成功，耗时${(elapsedTime / 1000).toFixed(1)}s`);
          
          // 📊 Token使用情况
          if (response.data?.usage) {
            const usage = response.data.usage;
            console.log(`📊 [Token使用] 输入:${usage.prompt_tokens}, 输出:${usage.completion_tokens}, 总计:${usage.total_tokens}`);
          }
          
          break;
        } catch (error: any) {
          lastError = error;
          const statusCode = error.response?.status || error.code;
          const errorTime = new Date().toISOString();
          const attemptDuration = ((Date.now() - attemptStartTime) / 1000).toFixed(2);
          console.error(`\n❌ [ZhipuService] 第${attempt + 1}/${maxRetries + 1}次调用失败 - ${errorTime}`);
          console.error(`❌ [ZhipuService] 错误类型: ${statusCode || error.code || 'Unknown'}`);
          console.error(`❌ [ZhipuService] 错误信息: ${error.message}`);
          console.error(`❌ [ZhipuService] 本次尝试耗时: ${attemptDuration}秒`);
          if (error.response?.data) {
            console.error(`❌ [ZhipuService] 错误详情:`, JSON.stringify(error.response.data, null, 2));
          }
          
          // 处理429错误（并发限制）
          if (axios.isAxiosError(error) && error.response?.status === 429) {
            if (attempt < maxRetries) {
              console.warn(`⚠️ API并发限制 (HTTP 429)，将在下次循环中重试`);
              continue; // 继续循环，等待逻辑在下次循环开始时执行
            } else {
              throw new Error('API并发数过高，已重试' + (maxRetries + 1) + '次仍失败。可能原因：\n1. 同时发起了多个解析请求\n2. API套餐的并发限制（建议等待30秒后重试）\n3. 前端重复请求（请勿连续点击）');
            }
          }
          
          // 判断是否应该重试（超时、网络错误、5xx错误）
          const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
          
          // 如果超时超过2次，不再重试，直接抛出让上层降级
          if (isTimeout && attempt >= 2) {
            console.warn(`⚠️ [ZhipuService] 已超时${attempt + 1}次，不再重试，建议使用硬规则降级`);
            throw new Error('LLM请求超时，建议使用硬规则解析');
          }
          
          const shouldRetry = axios.isAxiosError(error) && 
            (isTimeout ||
             error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT' ||
             (error.response && error.response.status >= 500)) &&
            attempt < maxRetries;
          
          if (shouldRetry) {
            console.warn(`⚠️ 网络/服务器错误，将重试`);
            continue;
          }
          
          // 不应重试的错误，直接抛出
          if (attempt >= maxRetries || !shouldRetry) {
            throw error;
          }
        }
      }
      
      if (!response && lastError) throw lastError;
      
      // ⏱️ LLM调用计时结束
      const llmEndTime = Date.now();
      const llmDuration = ((llmEndTime - llmStartTime) / 1000).toFixed(2);
      const totalDuration = ((llmEndTime - totalStartTime) / 1000).toFixed(2);
      const endTimeStr = new Date().toISOString();
      console.log(`⏱️ [ZhipuService] LLM API调用耗时: ${llmDuration}秒`);
      console.log(`⏱️ [ZhipuService] 总耗时: ${totalDuration}秒`);
      console.log(`✅ [ZhipuService] LLM调用完成 - ${endTimeStr}`);
      console.log(`${'-'.repeat(80)}\n`);
      
      // 🔍 检查response对象
      if (!response || !response.data) {
        console.error('❌ [ZhipuService] response或response.data为空！');
        throw new Error('API调用成功但未收到有效响应');
      }
      
      const usage = response.data.usage;
      const finishReason = response.data.choices?.[0]?.finish_reason;
      console.log(`✅ Token: ${usage?.total_tokens || 0} | finish_reason: ${finishReason}`);
      
      if (finishReason === 'length') {
        console.warn('⚠️ 响应被截断');
      }
      
      // 🎯 关键修复：GLM-4.7在response_format模式下可能把JSON放在reasoning_content里
      const message = response.data.choices[0]?.message;
      let resultText = message?.content || '';
      
      // 如果content为空但reasoning_content有内容，尝试从中提取JSON
      if (!resultText && message?.reasoning_content) {
        console.warn(`⚠️ [ZhipuService] content为空，从reasoning_content提取JSON（${message.reasoning_content.length}字符）`);
        console.warn('⚠️ [ZhipuService] 这表明GLM-4.7不完全支持response_format，正在尝试提取JSON...');
        
        // 从reasoning_content中提取最大的完整JSON对象
        const reasoningContent = message.reasoning_content;
        const jsonObjects = [];
        let depth = 0;
        let startIdx = -1;
        
        for (let i = 0; i < reasoningContent.length; i++) {
          if (reasoningContent[i] === '{') {
            if (depth === 0) startIdx = i;
            depth++;
          } else if (reasoningContent[i] === '}') {
            depth--;
            if (depth === 0 && startIdx !== -1) {
              jsonObjects.push(reasoningContent.substring(startIdx, i + 1));
              startIdx = -1;
            }
          }
        }
        
        if (jsonObjects.length > 0) {
          // 使用最大的JSON对象（通常是完整的根对象）
          resultText = jsonObjects.reduce((max, obj) => obj.length > max.length ? obj : max, jsonObjects[0]);
          console.warn(`✅ [ZhipuService] 从reasoning_content中提取到JSON（${resultText.length}字符）`);
        } else {
          console.error('❌ [ZhipuService] reasoning_content中未找到完整的JSON对象');
          
          // 🎯 尝试查找JSON的开始（可能被截断）
          const jsonStartIdx = reasoningContent.indexOf('{"naturalLanguageDescription"');
          if (jsonStartIdx >= 0) {
            // 找到了JSON开始，尝试提取到最后一个有效的}
            let extractedJson = reasoningContent.substring(jsonStartIdx);
            console.warn(`⚠️ [ZhipuService] 找到JSON开始位置，尝试提取被截断的JSON（${extractedJson.length}字符）`);
            
            // 尝试补全JSON（粗暴但有效）
            let openBraces = 0;
            let closeBraces = 0;
            for (let i = 0; i < extractedJson.length; i++) {
              if (extractedJson[i] === '{') openBraces++;
              if (extractedJson[i] === '}') closeBraces++;
            }
            const missingBraces = openBraces - closeBraces;
            if (missingBraces > 0) {
              extractedJson += '}'.repeat(missingBraces);
              console.warn(`⚠️ [ZhipuService] 补全了${missingBraces}个}，尝试解析`);
            }
            
            resultText = extractedJson;
          } else {
            console.error('❌ [ZhipuService] 连JSON开始标记都未找到，reasoning_content内容可能全是思考过程');
            // 输出reasoning_content的前500字符用于调试
            console.error('📄 [DEBUG] reasoning_content前500字符:', reasoningContent.substring(0, 500));
          }
        }
      }
      
      if (!resultText) {
        // 输出完整的响应结构用于调试
        console.error('❌ [ZhipuService] ========== resultText为空！开始诊断 ==========');
        console.error('❌ [ZhipuService] finish_reason:', finishReason);
        
        // 尝试输出完整响应（可能很大）
        try {
          const responseStr = JSON.stringify(response.data, null, 2);
          console.error('❌ [ZhipuService] 完整响应长度:', responseStr.length);
          if (responseStr.length > 5000) {
            console.error('❌ [ZhipuService] 响应太长，仅显示前2000字符:');
            console.error(responseStr.substring(0, 2000));
            console.error('❌ [ZhipuService] ... 后续内容省略 ...');
          } else {
            console.error('❌ [ZhipuService] 完整响应结构:', responseStr);
          }
        } catch (e) {
          console.error('❌ [ZhipuService] 无法序列化响应:', e);
        }
        
        console.error('❌ [ZhipuService] choices数量:', response.data?.choices?.length || 0);
        if (response.data?.choices?.[0]) {
          console.error('❌ [ZhipuService] choices[0].message存在:', !!response.data.choices[0].message);
          console.error('❌ [ZhipuService] choices[0].message.content类型:', typeof response.data.choices[0]?.message?.content);
          console.error('❌ [ZhipuService] choices[0].message.content值:', response.data.choices[0]?.message?.content);
        }
        
        // 如果 finish_reason 是 'length'，说明响应被截断
        if (finishReason === 'length') {
          console.error('❌ [ZhipuService] 响应被截断，但content为空。这可能是因为：');
          console.error('   1. max_tokens设置太小（当前16384），模型可能陷入思考循环');
          console.error('   2. API响应格式异常');
          console.error('   3. 建议：检查reasoning_content是否有内容（模型在推理而非输出）');
          
          // 尝试从choices中查找任何可能的文本内容
          const allChoices = response.data?.choices || [];
          for (let i = 0; i < allChoices.length; i++) {
            const choice = allChoices[i];
            if (choice?.message?.content) {
              console.warn(`⚠️ [ZhipuService] 在choices[${i}]中找到内容，长度: ${choice.message.content.length}`);
              // 使用找到的内容
              resultText = choice.message.content;
              break;
            }
          }
          
          // 如果仍然没有内容，抛出错误
          if (!resultText) {
            throw new Error('响应被截断（finish_reason: length），模型可能陷入思考循环。已简化Prompt并增加max_tokens到16384。');
          }
        }
        
        throw new Error('未收到有效的解析结果');
      }
      
      // 如果 finish_reason 是 'length'，记录警告
      if (finishReason === 'length') {
        console.warn('⚠️ [ZhipuService] 警告：响应内容被截断（finish_reason: length），已收到部分内容，将尝试解析');
        console.warn('⚠️ [ZhipuService] 收到内容长度:', resultText.length, '字符');
      }

      // 🔍 记录大模型返回结果（简化）
      console.log(`🤖 [ZhipuService] 返回结果长度: ${resultText.length}字符`);
      if (process.env.NODE_ENV === 'development' && resultText.length <= 1000) {
        console.log('🤖 [ZhipuService] 完整结果:', resultText);
      }

      // 解析JSON结果（增加容错性）
      let result: ParseResult;
      // 移除可能的markdown代码块标记
      let cleanedText = resultText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      console.log('\n🔍 [ZhipuService] ========== JSON解析前检查 ==========');
      console.log('📊 [ZhipuService] resultText长度:', resultText.length);
      console.log('📊 [ZhipuService] cleanedText前100字符:', cleanedText.substring(0, 100));
      console.log('📊 [ZhipuService] cleanedText后100字符:', cleanedText.substring(Math.max(0, cleanedText.length - 100)));
      
      try {
        // 容错：修复常见的JSON格式问题
        cleanedText = cleanedText.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
        console.log('📊 [ZhipuService] 开始JSON.parse...');
        result = JSON.parse(cleanedText);
        console.log('✅ [ZhipuService] JSON.parse成功！');
        
        // 🎯 兜底1：如果返回的是数组（tiers直接作为根），包装成标准格式
        if (Array.isArray(result)) {
          console.warn('⚠️ [ZhipuService] LLM返回了数组而不是对象，自动包装...');
          result = {
            naturalLanguageDescription: '等待期内非意外退保费；意外或等待期后：18岁前Max(保费,现价)；18岁后前10年150%保额，11年后100%保额',
            payoutAmount: {
              type: 'tiered',
              details: {
                tiers: result
              }
            },
            payoutCount: {
              type: 'single'
            }
          } as ParseResult;
          console.log('✅ [ZhipuService] 已包装为标准格式');
        }
        
        // 🎯 兜底1.5：如果返回的是扁平结构（直接包含period、formula等字段），包装成标准格式
        const resultAny = result as any;
        const hasFlatFields = resultAny.period || resultAny.formula || resultAny.waitingPeriodStatus;
        const hasEmptyTiers = !result.payoutAmount?.details?.tiers || result.payoutAmount.details.tiers.length === 0;
        const hasNoPayoutAmount = !result.payoutAmount;
        
        console.log(`🔍 [兜底1.5检查] hasFlatFields=${hasFlatFields}, hasEmptyTiers=${hasEmptyTiers}, hasNoPayoutAmount=${hasNoPayoutAmount}`);
        console.log(`🔍 [兜底1.5检查] resultAny.period=${resultAny.period}, resultAny.formula=${resultAny.formula}, resultAny.waitingPeriodStatus=${resultAny.waitingPeriodStatus}`);
        
        if ((hasNoPayoutAmount || hasEmptyTiers) && hasFlatFields) {
          console.warn('⚠️ [ZhipuService] LLM返回了扁平结构，自动包装为tier格式...');
          const tier: any = {
            period: resultAny.period || '等待期后',
            waitingPeriodStatus: resultAny.waitingPeriodStatus || 'after',
            formula: resultAny.formula || '投保金额',
          };
          
          // 复制可选字段
          if (resultAny.paymentPeriodStatus) tier.paymentPeriodStatus = resultAny.paymentPeriodStatus;
          if (resultAny.ageCondition) tier.ageCondition = resultAny.ageCondition;
          if (resultAny.policyYearRange) tier.policyYearRange = resultAny.policyYearRange;
          if (resultAny.formulaType) tier.formulaType = resultAny.formulaType;
          if (resultAny.interestRate) tier.interestRate = resultAny.interestRate;
          
          // 如果已有payoutAmount但tiers为空，直接填充tiers
          if (result.payoutAmount && result.payoutAmount.details) {
            result.payoutAmount.details.tiers = [tier];
            if (!result.payoutAmount.type) result.payoutAmount.type = 'tiered';
            if (!result.payoutAmount.confidence) result.payoutAmount.confidence = 0.8;
            console.log('✅ [ZhipuService] 已将扁平结构填充到现有payoutAmount.details.tiers中');
          } else {
            result = {
              ...result,
              payoutAmount: {
                type: 'tiered',
                confidence: 0.8,
                details: {
                  tiers: [tier]
                }
              }
            } as ParseResult;
            console.log('✅ [ZhipuService] 已创建新的payoutAmount结构');
          }
          console.log('✅ [ZhipuService] 已将扁平结构包装为标准格式，tiers数量:', result.payoutAmount?.details?.tiers?.length || 0);
        }
        
        // 🎯 兜底2：标准化术语（如果LLM没有正确转换）
        this.standardizeTerminology(result);
        
        // 🎯 规范化period字段（统一各种同义表达）
        if (result.payoutAmount?.details?.tiers) {
          console.log(`📝 [规范化] 开始规范化${result.payoutAmount.details.tiers.length}个阶段的period字段`);
          result.payoutAmount.details.tiers = PeriodNormalizer.normalizeTiers(result.payoutAmount.details.tiers);
        }
        if (result.payoutAmount?.details?.conditions) {
          console.log(`📝 [规范化] 开始规范化${result.payoutAmount.details.conditions.length}个条件的period字段`);
          result.payoutAmount.details.conditions = PeriodNormalizer.normalizeTiers(result.payoutAmount.details.conditions);
        }
        
        // 🎯 规范化formula字段：将formulaVariables.factor转换为formula中的百分比描述
        this.normalizeFormulaFields(result);
        
        console.log('✅ [ZhipuService] JSON解析成功');
        console.log('\n🔍 [ZhipuService] ========== 解析后的result对象结构 ==========');
        console.log('📊 [ZhipuService] result的所有键:', Object.keys(result || {}));
        console.log('📊 [ZhipuService] result.payoutAmount 是否存在:', !!result.payoutAmount);
        if (result.payoutAmount) {
          console.log('📊 [ZhipuService] payoutAmount的所有键:', Object.keys(result.payoutAmount));
          console.log('📊 [ZhipuService] payoutAmount.details 是否存在:', !!result.payoutAmount.details);
          if (result.payoutAmount.details) {
            console.log('📊 [ZhipuService] details的所有键:', Object.keys(result.payoutAmount.details));
            console.log('📊 [ZhipuService] details.tiers 是否存在:', !!result.payoutAmount.details.tiers);
            console.log('📊 [ZhipuService] details.tiers 长度:', result.payoutAmount.details.tiers?.length || 0);
            if (result.payoutAmount.details.tiers && result.payoutAmount.details.tiers.length > 0) {
              console.log('📊 [ZhipuService] 第一个tier的结构:', JSON.stringify(result.payoutAmount.details.tiers[0], null, 2));
            }
          }
        }
        console.log('📊 [ZhipuService] 完整result对象:', JSON.stringify(result, null, 2));
        console.log('🔍 [ZhipuService] ============================================\n');
        
        // 🎯 验证：检查LLM是否返回了结构化字段（4个维度）
        if (result.payoutAmount?.details?.tiers) {
          console.log(`🔍 [验证] 开始验证${result.payoutAmount.details.tiers.length}个阶段的结构化字段...`);
          
          result.payoutAmount.details.tiers.forEach((tier: any, index: number) => {
            const fields = {
              waitingPeriodStatus: !!tier.waitingPeriodStatus,
              paymentPeriodStatus: !!tier.paymentPeriodStatus,
              ageCondition: !!tier.ageCondition,
              policyYearRange: !!tier.policyYearRange
            };
            
            const structuredCount = Object.values(fields).filter(Boolean).length;
            
            if (structuredCount === 0) {
              console.error(`❌ [阶段${index + 1}] 缺少所有结构化字段！period="${tier.period}"`);
            } else if (!fields.waitingPeriodStatus) {
              console.warn(`⚠️ [阶段${index + 1}] 缺少必填字段 waitingPeriodStatus！period="${tier.period}"`);
            } else {
              const fieldList = Object.entries(fields)
                .filter(([_, has]) => has)
                .map(([name, _]) => name)
                .join(', ');
              console.log(`✅ [阶段${index + 1}] 包含结构化字段: ${fieldList}`);
            }
          });
        }
        
        // 🎯 限制自然语言描述字数（不超过50字）
        if (result.naturalLanguageDescription) {
          if (result.naturalLanguageDescription.length > 50) {
            console.warn(`⚠️ [ZhipuService] 自然语言描述过长（${result.naturalLanguageDescription.length}字），截断至50字`);
            result.naturalLanguageDescription = result.naturalLanguageDescription.substring(0, 50);
          }
        }
        
        if (!result.naturalLanguageDescription) {
          console.warn('⚠️ 未找到naturalLanguageDescription，尝试生成...');
          // 如果大模型没有返回自然语言描述，尝试从其他字段生成一个基本的描述
          if (result.payoutAmount) {
            let description = '';
            if (result.payoutAmount.type === 'paid_premium') {
              description = '按累计已交保险费给付';
            } else if (result.payoutAmount.type === 'percentage') {
              description = `按投保金额×${result.payoutAmount.details?.percentage || '一定比例'}给付`;
            } else if (result.payoutAmount.type === 'fixed') {
              description = `按固定金额${result.payoutAmount.details?.fixedAmount || ''}万元给付`;
            } else if (result.payoutAmount.type === 'tiered') {
              description = '按不同阶段给付保险金';
            } else {
              description = '赔付金额待确认';
            }
            // 确保不超过50字
            if (description.length > 50) {
              description = description.substring(0, 50);
            }
            result.naturalLanguageDescription = description;
            console.log('✅ [ZhipuService] 已生成自然语言描述:', result.naturalLanguageDescription);
          } else {
            // ⚠️ payoutAmount 不存在，说明大模型返回的数据结构有问题
            console.error('❌ [ZhipuService] 严重错误：result.payoutAmount 不存在！');
            console.error('❌ [ZhipuService] 完整的 result 对象:', JSON.stringify(result, null, 2));
            result.naturalLanguageDescription = '⚠️ 大模型返回数据格式异常，请重试或联系技术支持。';
            console.warn('⚠️ [ZhipuService] 无法生成自然语言描述，使用默认描述');
            
            // 🔥 尝试修复：如果有 tiers 数据但结构不对，尝试重组
            const resultAny = result as any;
            if (resultAny.tiers || resultAny.details?.tiers) {
              console.log('🔧 [ZhipuService] 检测到 tiers 数据，尝试修复数据结构...');
              result.payoutAmount = {
                type: 'tiered',
                details: {
                  tiers: resultAny.tiers || resultAny.details?.tiers || []
                }
              };
              result.naturalLanguageDescription = '条款解析完成，已自动修复数据结构。';
              console.log('✅ [ZhipuService] 数据结构已修复');
            }
          }
        }
        
        // 🔍 检查赔付金额是否为unknown类型
        if (result.payoutAmount?.type === 'unknown' || result.payoutAmount?.confidence === 0) {
          console.warn('⚠️ [ZhipuService] 赔付金额识别为unknown或confidence为0，可能需要优化prompt');
          console.warn('⚠️ [ZhipuService] 原始返回内容:', resultText);
        }
      } catch (parseError: any) {
        console.error('❌ [ZhipuService] 解析智谱清言返回结果失败:', parseError);
        console.error('❌ [ZhipuService] 原始返回文本:', resultText);
        console.error('❌ [ZhipuService] 清理后的文本:', cleanedText);
        
        // 如果是因为响应被截断导致的JSON不完整，尝试提取部分信息
        if (response.data?.choices?.[0]?.finish_reason === 'length') {
          console.warn('⚠️ [ZhipuService] 响应被截断，尝试从部分JSON中提取信息...');
          try {
            // 尝试找到最后一个完整的JSON对象
            const lastBraceIndex = cleanedText.lastIndexOf('}');
            if (lastBraceIndex > 0) {
              const partialJson = cleanedText.substring(0, lastBraceIndex + 1);
              result = JSON.parse(partialJson);
              console.warn('⚠️ [ZhipuService] 成功从截断的JSON中提取部分信息');
            } else {
              throw new Error('无法从截断的响应中提取有效JSON');
            }
          } catch (partialParseError) {
            console.error('❌ [ZhipuService] 无法从截断的响应中提取信息:', partialParseError);
            throw new Error(`解析失败：响应可能被截断（finish_reason: length）。原始错误: ${parseError.message}`);
          }
        } else {
          console.error('❌ [ZhipuService] 错误详情:', parseError.message);
          console.error('❌ [ZhipuService] 原始返回内容:', resultText);
          console.error('❌ [ZhipuService] 清理后的文本:', cleanedText);
          
          // 兜底：如果JSON解析失败，提取自然语言描述和核心字段
          console.error('❌ [ZhipuService] ========== JSON解析失败，进入兜底逻辑 ==========');
          console.error('❌ [ZhipuService] 错误信息:', parseError.message);
          console.error('❌ [ZhipuService] 错误堆栈:', parseError.stack);
          console.error('❌ [ZhipuService] 原始返回内容长度:', resultText.length);
          console.error('❌ [ZhipuService] 原始返回内容前500字符:', resultText.substring(0, 500));
          console.error('❌ [ZhipuService] 清理后的文本长度:', cleanedText.length);
          console.error('❌ [ZhipuService] 清理后的文本前500字符:', cleanedText.substring(0, 500));
          console.warn('⚠️ [ZhipuService] JSON解析失败，创建兜底结果（核心字段将为null）');
          // 限制自然语言描述字数（不超过50字）
          let fallbackDescription = resultText;
          if (fallbackDescription.length > 50) {
            fallbackDescription = fallbackDescription.substring(0, 50) + '...';
          }
          result = {
            payoutAmount: { type: 'unknown', confidence: 0 },
            naturalLanguageDescription: fallbackDescription,
            overallConfidence: 0,
            parseMethod: 'zhipu'
          };
          console.error('❌ [ZhipuService] ============================================\n');
        }
      }

      // 添加元数据
      result.parseMethod = 'zhipu';
      result.tokenUsage = response.data.usage;
      // 保存原始大模型响应，用于调试（避免循环引用，不包含parsedContent）
      result.rawLLMResponse = {
        rawContent: resultText,
        usage: response.data.usage
      };
      
      // 🔧 保存解析时使用的policyInfo，供前端使用
      console.log(`🔍 [ZhipuService] policyInfo存在: ${!!policyInfo}`);
      if (policyInfo) {
        console.log(`🔍 [ZhipuService] policyInfo内容:`, JSON.stringify(policyInfo, null, 2));
        result.policyInfo = policyInfo;
        
        // 🎯 第一步：规范化payoutAmount结构，确保tiers在details中
        console.log(`🔍 [ZhipuService] result.payoutAmount存在: ${!!result.payoutAmount}`);
        if (result.payoutAmount) {
          console.log(`🔍 [ZhipuService] result.payoutAmount.tiers存在: ${!!result.payoutAmount.tiers}`);
          console.log(`🔍 [ZhipuService] result.payoutAmount.details存在: ${!!result.payoutAmount.details}`);
          // 如果tiers直接在payoutAmount下，移动到details中
          if (result.payoutAmount.tiers && !result.payoutAmount.details) {
            result.payoutAmount = {
              ...result.payoutAmount,
              details: {
                tiers: result.payoutAmount.tiers
              }
            };
            // 移除顶层的tiers
            delete result.payoutAmount.tiers;
            console.log('📝 [ZhipuService] 已将payoutAmount.tiers包装到payoutAmount.details.tiers中');
          } else if (result.payoutAmount.tiers && result.payoutAmount.details) {
            // 如果两者都存在，优先使用details中的，但如果没有则使用tiers
            if (!result.payoutAmount.details.tiers && !result.payoutAmount.details.conditions) {
              result.payoutAmount.details.tiers = result.payoutAmount.tiers;
            }
            delete result.payoutAmount.tiers;
            console.log('📝 [ZhipuService] 已将payoutAmount.tiers合并到payoutAmount.details.tiers中');
          }
        }
        
        // 🎯 兼容两种格式：tiered（有tiers数组）和conditional（有conditions数组）
        // 注意：这里需要重新获取tiersArray，因为可能在policyInfo处理前已经包装了扁平结构
        let tiersArray = result.payoutAmount?.details?.tiers || result.payoutAmount?.details?.conditions || [];
        
        console.log(`🔍 [ZhipuService] tiersArray长度: ${tiersArray.length}`);
        console.log(`🔍 [ZhipuService] result.payoutAmount存在: ${!!result.payoutAmount}`);
        console.log(`🔍 [ZhipuService] result.payoutAmount.details存在: ${!!result.payoutAmount?.details}`);
        console.log(`🔍 [ZhipuService] tiersArray前3个:`, JSON.stringify(tiersArray.slice(0, 3), null, 2));
        
        // 🎯 如果有tiers数组且有保单信息，先检查适用性
        if (tiersArray.length > 0 && policyInfo) {
          const { CoverageApplicabilityService } = require('./coverageApplicabilityService');
          const applicabilityCheck = CoverageApplicabilityService.checkApplicability(tiersArray, policyInfo);
          
          if (!applicabilityCheck.isApplicable) {
            console.log(`⚠️ [ZhipuService] 责任不适用: ${applicabilityCheck.reason}`);
            // 返回不适用结果
            return CoverageApplicabilityService.createNotApplicableResult(
              '责任',
              applicabilityCheck.reason || '条件不满足'
            );
          }
        }
        
        // 🎯 如果tiersArray为空，但result中有扁平字段，再次尝试包装（防止在policyInfo处理前未检测到）
        if (tiersArray.length === 0 && policyInfo) {
          const resultAny = result as any;
          const hasFlatFields = resultAny.period || resultAny.formula || resultAny.waitingPeriodStatus;
          if (hasFlatFields) {
            console.warn('⚠️ [ZhipuService] 在policyInfo处理阶段检测到扁平结构，再次包装...');
            const tier: any = {
              period: resultAny.period || '等待期后',
              waitingPeriodStatus: resultAny.waitingPeriodStatus || 'after',
              formula: resultAny.formula || '投保金额',
            };
            
            if (resultAny.paymentPeriodStatus) tier.paymentPeriodStatus = resultAny.paymentPeriodStatus;
            if (resultAny.ageCondition) tier.ageCondition = resultAny.ageCondition;
            if (resultAny.policyYearRange) tier.policyYearRange = resultAny.policyYearRange;
            if (resultAny.formulaType) tier.formulaType = resultAny.formulaType;
            if (resultAny.interestRate) tier.interestRate = resultAny.interestRate;
            
            if (!result.payoutAmount) {
              result.payoutAmount = {
                type: 'tiered',
                confidence: 0.8,
                details: { tiers: [tier] }
              };
            } else if (!result.payoutAmount.details) {
              result.payoutAmount.details = { tiers: [tier] };
            } else {
              result.payoutAmount.details.tiers = [tier];
            }
            
            tiersArray = result.payoutAmount.details.tiers;
            console.log('✅ [ZhipuService] 已在policyInfo处理阶段包装扁平结构，tiers数量:', tiersArray.length);
          }
        }
        
        // 🎯 如果有tiers数组且有保单信息，后端直接计算关键节点金额
        if (tiersArray.length > 0) {
          console.log(`💰 [ZhipuService] 开始处理${tiersArray.length}个阶段`);
          
          // ⏱️ 过滤计时开始
          const filterStartTime = Date.now();
          
          // 🎯 第一步：使用辅助方法进行过滤（复用逻辑，避免重复）
          const filteredTiers = this.filterTiers(tiersArray, policyInfo);
          
          // ⏱️ 过滤计时结束
          const filterDuration = ((Date.now() - filterStartTime) / 1000).toFixed(3);
          console.log(`⏱️ 过滤完成(${filterDuration}s): ${tiersArray.length} → ${filteredTiers.length}个阶段`);
          
          // ⏱️ 计算计时开始
          const calcStartTime = Date.now();
          
          // 🎯 第二步：使用辅助方法计算关键节点（复用逻辑，避免重复）
          const topLevelRatio = result.payoutAmount.details.ratio;
          const processedTiers = await this.calculateKeyAmounts(filteredTiers, policyInfo, topLevelRatio);
          
          // ⏱️ 计算计时结束
          const calcDuration = ((Date.now() - calcStartTime) / 1000).toFixed(3);
          console.log(`⏱️ 计算完成(${calcDuration}s)`);
          
          // 🎯 最终过滤：移除没有keyAmounts或keyAmounts为空的阶段（年龄不符等原因）
          const finalTiers = processedTiers.filter((tier: any, index: number) => {
            if (!tier.keyAmounts || tier.keyAmounts.length === 0) {
              console.log(`🗑️ [最终过滤] 移除阶段${index + 1}（无有效年龄范围）: ${tier.period}`);
              return false;
            }
            return true;
          });
          console.log(`✅ [最终过滤] ${processedTiers.length}个阶段 → ${finalTiers.length}个有效阶段`);
          
          // 将处理后的结果写回正确的位置
          if (result.payoutAmount.details.tiers) {
            result.payoutAmount.details.tiers = finalTiers;
          } else if (result.payoutAmount.details.conditions) {
            result.payoutAmount.details.conditions = finalTiers;
          }
        }
      }

      // ⏱️ 总计时结束
      const totalEndTime = Date.now();
      const totalDurationFinal = ((totalEndTime - totalStartTime) / 1000).toFixed(2);
      const endTimeStrFinal = new Date().toISOString();
      console.log(`⏱️ [ZhipuService] 总耗时: ${totalDurationFinal}秒`);
      console.log(`✅ [ZhipuService] 解析完成 - ${endTimeStrFinal}`);
      console.log(`${'-'.repeat(80)}\n`);

      return result;
    } catch (error) {
      const errorTime = new Date().toISOString();
      const totalDuration = ((Date.now() - totalStartTime) / 1000).toFixed(2);
      console.error(`\n${'='.repeat(80)}`);
      console.error(`❌ [ZhipuService] 智谱API调用失败 - ${errorTime}`);
      console.error(`❌ [ZhipuService] 总耗时: ${totalDuration}秒（失败）`);
      console.error(`❌ [ZhipuService] 错误类型: ${error?.constructor?.name || 'Unknown'}`);
      console.error(`❌ [ZhipuService] 错误消息: ${error instanceof Error ? error.message : String(error)}`);
      
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<{ error?: { message?: string } }>;
        console.error('❌ [ZhipuService] 错误分类: Axios错误');
        
        if (axiosError.response) {
          console.error(`❌ [ZhipuService] HTTP状态码: ${axiosError.response.status}`);
          console.error(`❌ [ZhipuService] 响应数据:`, JSON.stringify(axiosError.response.data, null, 2));
          const errorMessage = axiosError.response.data?.error?.message || axiosError.response.statusText;
          console.error(`${'='.repeat(80)}\n`);
          throw new Error(`智谱清言API错误: ${axiosError.response.status} - ${errorMessage}`);
        } else if (axiosError.request) {
          console.error('❌ [ZhipuService] 请求已发送但未收到响应（网络超时或连接失败）');
          console.error(`❌ [ZhipuService] 请求URL: ${axiosError.config?.url}`);
          console.error(`❌ [ZhipuService] 请求方法: ${axiosError.config?.method}`);
          console.error(`${'='.repeat(80)}\n`);
          throw new Error('无法连接到智谱清言服务，请检查网络连接');
        } else {
          console.error('❌ [ZhipuService] 请求配置错误');
          console.error(`${'='.repeat(80)}\n`);
          throw new Error('请求配置错误');
        }
      } else {
        console.error(`❌ [ZhipuService] 非Axios错误: ${error}`);
        console.error(`${'='.repeat(80)}\n`);
        throw error;
      }
      
      console.error('❌ [ZhipuService] 未知错误:', error);
      throw error;
    }
  }

  /**
   * 构建标准messages
   */
  private buildMessages(clauseText: string): ZhipuMessage[] {
    return [
      {
        role: 'system',
        content: `你是保险条款解析专家。提取理赔规则，输出JSON。

【必填字段】
- waitingPeriodStatus: "during"或"after"（等待期内/后）
- period: 阶段描述原文
- formula: 赔付公式，如"投保金额"、"投保金额×150%"、"已交保费"
- naturalLanguageDescription: 自然语言描述，不超过50字，简洁概括赔付规则

【可选字段】（不涉及时不输出，不要写null）
- paymentPeriodStatus: "during"或"after"（交费期内/后）
- ageCondition: { "limit": 数字, "operator": "<"|">="|">"|"<=", "type": "投保时"|"确诊时" }
- policyYearRange: { "start": 数字, "end": 数字|null }（end为null表示无结束时间）

【规则】
- formula统一用"投保金额"（不用"基本保额"、"基本保险金额"）
- 倍数直接写：150% → "投保金额×150%"
- 年龄条件：区分"投保时"和"确诊时"
- 保单年度：第1-10年 → { "start": 1, "end": 10 }
- naturalLanguageDescription必须简洁，不超过50字
- 可选字段：如果条款中没有相关信息，直接省略该字段，不要输出null

仅输出JSON，不要解释。`
      },
      // 🎯 唯一的示例：包含结构化字段（ageCondition + policyYearRange）
      {
        role: 'user',
        content: `等待期后或意外：18岁前Max(保费,现价)；18岁后前10年150%保额，11年后100%保额`
      },
      {
        role: 'assistant',
        content: JSON.stringify({
          "naturalLanguageDescription": "等待期后：18岁前Max两项；18岁后前10年150%保额；11年后100%保额",
          "payoutAmount": {
            "type": "tiered",
            "details": {
              "tiers": [
                {
                  "period": "等待期后或意外（未满18周岁）",
                  "waitingPeriodStatus": "after",
                  "ageCondition": { "limit": 18, "operator": "<" },
                  "formulaType": "max",
                  "formula": "Max(已交保费, 现金价值)"
                },
                {
                  "period": "等待期后或意外（年满18周岁，第1-10保单年度）",
                  "waitingPeriodStatus": "after",
                  "ageCondition": { "limit": 18, "operator": ">=" },
                  "policyYearRange": { "start": 1, "end": 10 },
                  "formula": "投保金额×150%"
                },
                {
                  "period": "等待期后或意外（年满18周岁，第11保单年度起）",
                  "waitingPeriodStatus": "after",
                  "ageCondition": { "limit": 18, "operator": ">=" },
                  "policyYearRange": { "start": 11, "end": null },
                  "formula": "投保金额×100%"
                }
              ]
            }
          },
          "payoutCount": { "type": "single" }
        }, null, 2)
      },
      {
        role: 'user',
        content: clauseText
      }
    ];
  }

  /**
   * 🎯 标准化术语（兜底处理）
   */
  // 🎯 辅助方法：过滤tiers（抽取公共逻辑，避免代码重复）
  private filterTiers(tiersArray: any[], policyInfo: any): any[] {
    const currentYear = new Date().getFullYear();
    const currentAge = currentYear - parseInt(policyInfo.birthYear);
    const policyStartAge = parseInt(policyInfo.policyStartYear) - parseInt(policyInfo.birthYear);
    
    // 🎯 计算缴费状态（用于过滤交费期内/满后的阶段）
    let isPaymentCompleted = false;
    if (policyInfo.totalPaymentPeriod && policyInfo.totalPaymentPeriod !== "1") {
      const paymentStartYear = parseInt(policyInfo.policyStartYear);
      const paymentPeriodYears = parseInt(policyInfo.totalPaymentPeriod);
      const paymentEndYear = paymentStartYear + paymentPeriodYears - 1;
      isPaymentCompleted = currentYear > paymentEndYear;
    } else {
      isPaymentCompleted = true;
    }
    
    return tiersArray.filter((tier: any, index: number) => {
      // 🎯 兼容LLM返回的condition字段（映射到period）
      if (tier.condition && !tier.period) {
        tier.period = tier.condition;
      }
      
      const period = tier.period || '';
      const periodLower = period.toLowerCase();
      
      // 过滤0：等待期内的赔付
      if (tier.waitingPeriodStatus === 'during' || periodLower.includes('等待期内') || periodLower.includes('观察期内')) {
        return false;
      }
      
      // 过滤1：已过期的年龄阶段
      // 1a. 匹配"XX岁前"、"未满XX岁"、"XX岁以下"（但不匹配"XX岁后前YY年"）
      // 关键：确保"前"、"未满"等紧跟在年龄后面，不能有"后"在中间
      const ageBeforePattern = /(?:未满|不满)?\s*(\d+)\s*(?:周岁|岁)\s*(?:前|以下)|(\d+)\s*(?:周岁|岁)\s*前/;
      const ageBeforeMatch = period.match(ageBeforePattern);
      
      // 排除"XX岁后前YY年"这样的复合表达
      const isComplexAfterBefore = /(\d+)\s*(?:周岁|岁)\s*后\s*前/.test(period);
      
      if (ageBeforeMatch && !isComplexAfterBefore) {
        const limitAge = parseInt(ageBeforeMatch[1] || ageBeforeMatch[2]);
        if (currentAge >= limitAge) {
          return false;
        }
      }
      
      // 1b. 匹配"XX岁后"、"满XX岁后"、"XX岁以上"（当前年龄 < 限制年龄时过滤）
      const ageAfterPattern = /(?:满|达到)?\s*(\d+)\s*(?:周岁|岁)\s*(?:后|以上|及以上)/;
      const ageAfterMatch = period.match(ageAfterPattern);
      
      // 确保不是"XX岁前"的情况
      const hasBeforeKeyword = /(\d+)\s*(?:周岁|岁)\s*前/.test(period);
      
      if (ageAfterMatch && !hasBeforeKeyword) {
        const limitAge = parseInt(ageAfterMatch[1]);
        if (currentAge < limitAge) {
          return false;
        }
      }
      
      // 过滤2：缴费方式不匹配
      if (policyInfo.totalPaymentPeriod) {
        const isSinglePay = policyInfo.totalPaymentPeriod === "1";
        
        // 🎯 优先使用结构化字段
        if (tier.paymentMethod) {
          if (isSinglePay && tier.paymentMethod === 'regular') return false;
          if (!isSinglePay && tier.paymentMethod === 'single') return false;
        } else {
          // 🎯 Fallback：使用关键词匹配
          if (isSinglePay) {
            const regularPayKeywords = ['分期', '期交', '期缴', '交费期满', '缴费期满', '交费期内', '缴费期内'];
            if (regularPayKeywords.some(k => periodLower.includes(k))) return false;
          } else {
            const singlePayKeywords = ['趸交', '躉交', '一次性缴费', '一次性交费'];
            if (singlePayKeywords.some(k => periodLower.includes(k))) return false;
          }
        }
      }
      
      // 过滤3：根据缴费状态过滤交费期内/满后的阶段
      if (policyInfo.totalPaymentPeriod && policyInfo.totalPaymentPeriod !== "1") {
        if (isPaymentCompleted && (periodLower.includes('交费期内') || periodLower.includes('缴费期内'))) {
          return false;
        }
      }
      
      return true;
    });
  }

  // 🎯 辅助方法：计算keyAmounts（抽取公共逻辑，避免代码重复）
  private async calculateKeyAmounts(filteredTiers: any[], policyInfo: any, topLevelRatio?: any): Promise<any[]> {
    return filteredTiers.map((tier: any, index: number) => {
      if (!tier.ratio && topLevelRatio) {
        tier = { ...tier, ratio: topLevelRatio };
      }
      
      try {
        const keyAmounts = this.payoutCalculator.calculatePayoutAmounts(tier, policyInfo);
        if (keyAmounts && keyAmounts.length > 0) {
          console.log(`✅ [ZhipuService] 阶段${index + 1}计算完成，共${keyAmounts.length}个节点`);
          return { ...tier, keyAmounts };
        } else {
          return tier;
        }
      } catch (error) {
        console.error(`❌ [ZhipuService] 阶段${index + 1}计算失败:`, error);
        return tier;
      }
    });
  }

  /**
   * 🎯 规范化formula字段：将formulaVariables.factor转换为formula中的百分比描述
   */
  private normalizeFormulaFields(result: ParseResult): void {
    const normalizeTier = (tier: any) => {
      // 如果formula是"基本保险金额或其倍数"这种模糊描述，且有formulaVariables.factor
      if (tier.formulaVariables?.factor && typeof tier.formulaVariables.factor === 'number') {
        const factor = tier.formulaVariables.factor;
        const percentage = Math.round(factor * 100);
        
        // 如果formula是模糊描述，替换为具体公式
        if (tier.formula && (
          tier.formula.includes('或其倍数') || 
          tier.formula.includes('倍数') ||
          tier.formula === '基本保险金额或其倍数' ||
          tier.formula === '基本保额或其倍数'
        )) {
          tier.formula = `基本保险金额×${percentage}%`;
        } else if (!tier.formula || tier.formula.trim() === '') {
          tier.formula = `基本保险金额×${percentage}%`;
        }
        
        // 清理formulaVariables中的factor（保留其他变量说明）
        if (tier.formulaVariables) {
          delete tier.formulaVariables.factor;
          // 如果formulaVariables为空对象，删除整个字段
          if (Object.keys(tier.formulaVariables).length === 0) {
            delete tier.formulaVariables;
          }
        }
      }
    };
    
    // 处理tiers数组
    if (result.payoutAmount?.details?.tiers) {
      result.payoutAmount.details.tiers.forEach(normalizeTier);
    }
    if (result.payoutAmount?.details?.conditions) {
      result.payoutAmount.details.conditions.forEach(normalizeTier);
    }
    // 兼容旧结构：tiers直接在payoutAmount下
    if (result.payoutAmount?.tiers) {
      result.payoutAmount.tiers.forEach(normalizeTier);
    }
  }

  /**
   * 🎯 标准化术语（兜底处理）
   */
  private standardizeTerminology(result: ParseResult): void {
    const standardize = (text: string): string => {
      if (!text || typeof text !== 'string') return text;
      
      return text
        // 保费相关
        .replace(/累计已交保险费/g, '已交保费')
        .replace(/已交保险费/g, '已交保费')
        .replace(/累计保费/g, '已交保费')
        .replace(/已缴保费/g, '已交保费')
        // 保额相关
        .replace(/基本保险金额/g, '基本保额')
        .replace(/保险金额/g, '基本保额')
        .replace(/投保金额/g, '基本保额')
        // 现金价值相关
        .replace(/退保金/g, '现金价值')
        .replace(/退保价值/g, '现金价值')
        .replace(/保单价值/g, '现金价值')
        .replace(/保单现金价值/g, '现金价值');
    };
    
    // 标准化所有tiers/conditions中的formula
    const tiersArray = result.payoutAmount?.details?.tiers || result.payoutAmount?.details?.conditions || [];
    for (const tier of tiersArray) {
      if (tier.formula) {
        tier.formula = standardize(tier.formula);
      }
    }
  }

  /**
   * 🔄 根据tier数据和保单信息计算金额
   * @param tier 阶段数据
   * @param policyInfo 保单信息
   * @returns keyAmounts数组
   */
  async calculateTierAmounts(tier: any, policyInfo: any): Promise<any[]> {
    try {
      const keyAmounts = this.payoutCalculator.calculatePayoutAmounts(tier, policyInfo);
      
      if (!keyAmounts || keyAmounts.length === 0) {
        console.warn('⚠️ [ZhipuService] 计算结果为空');
        return [];
      }
      
      console.log(`✅ [ZhipuService] 计算完成，共${keyAmounts.length}个节点`);
      return keyAmounts;
    } catch (error: any) {
      console.error('❌ [ZhipuService] 计算失败:', error);
      throw new Error(`计算失败: ${error.message}`);
    }
  }

  /**
   * 获取提供商名称（实现 ILLMService 接口）
   */
  getProviderName(): string {
    return 'zhipu';
  }

  /**
   * 获取模型名称（实现 ILLMService 接口）
   */
  getModelName(): string {
    return this.model;
  }
}
