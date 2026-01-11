/**
 * LLM 服务接口（抽象层）
 * 
 * 目的：支持多种 LLM 提供商，方便切换
 * - 智谱官方 API
 * - 智谱微调模型
 * - 自托管模型
 */

export interface ParseResult {
  naturalLanguageDescription?: string;
  payoutAmount?: any;
  [key: string]: any;
}

export interface ILLMService {
  /**
   * 解析保险条款
   * @param clauseText 条款文本
   * @param coverageType 责任类型
   * @param policyInfo 保单信息（可选）
   * @returns 解析结果
   */
  parse(
    clauseText: string,
    coverageType: string,
    policyInfo?: any
  ): Promise<ParseResult>;

  /**
   * 流式解析（可选）
   * @param clauseText 条款文本
   * @param coverageType 责任类型
   * @param onChunk 接收流式数据的回调
   * @returns 完整解析结果
   */
  parseStream?(
    clauseText: string,
    coverageType: string,
    onChunk: (chunk: string) => void,
    policyInfo?: any
  ): Promise<ParseResult>;

  /**
   * 获取提供商名称
   */
  getProviderName(): string;

  /**
   * 获取模型名称
   */
  getModelName(): string;
}

