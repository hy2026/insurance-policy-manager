/**
 * LLM 服务工厂
 * 
 * 根据配置创建对应的 LLM Provider
 */

import { ILLMService } from './interface/ILLMService';
import { ZhipuService } from '../zhipuService';
import { llmConfig } from '../config/llmConfig';

export class LLMServiceFactory {
  private static instance: ILLMService | null = null;

  /**
   * 创建 LLM 服务实例（单例模式）
   */
  static getInstance(): ILLMService {
    if (!this.instance) {
      this.instance = this.createService();
    }
    return this.instance;
  }

  /**
   * 创建新的 LLM 服务实例
   */
  static createService(): ILLMService {
    const { provider } = llmConfig;

    switch (provider) {
      case 'zhipu':
      case 'zhipu-finetune':
        console.log('📦 [LLMFactory] 使用 ZhipuService');
        return new ZhipuService();

      case 'custom':
        // TODO: 实现 CustomModelProvider
        throw new Error('Custom model provider not implemented yet');

      default:
        throw new Error(`Unknown LLM provider: ${provider}`);
    }
  }

  /**
   * 重置实例（用于测试或切换配置）
   */
  static resetInstance(): void {
    this.instance = null;
  }
}

