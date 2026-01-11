/**
 * LLM 服务配置
 * 
 * 支持三种模式：
 * 1. zhipu - 智谱官方 API（当前）
 * 2. zhipu-finetune - 智谱微调模型（训练后）
 * 3. custom - 自托管模型（未来）
 */

import dotenv from 'dotenv';

// 确保环境变量在配置读取前加载
dotenv.config();

export type LLMProvider = 'zhipu' | 'zhipu-finetune' | 'custom';

export interface ZhipuConfig {
  apiKey: string;
  model: string;  // 'glm-4' 或微调后的模型ID
  baseURL?: string;
}

export interface CustomModelConfig {
  endpoint: string;  // 自托管模型的 API endpoint
  apiKey?: string;
  timeout?: number;
}

export interface LLMConfig {
  provider: LLMProvider;
  zhipu?: ZhipuConfig;
  custom?: CustomModelConfig;
}

/**
 * 从环境变量读取配置
 */
export const llmConfig: LLMConfig = {
  provider: (process.env.LLM_PROVIDER as LLMProvider) || 'zhipu',
  
  zhipu: {
    apiKey: process.env.ZHIPU_API_KEY || '',
    model: process.env.ZHIPU_MODEL || 'glm-4',
    baseURL: process.env.ZHIPU_BASE_URL
  },
  
  custom: {
    endpoint: process.env.CUSTOM_MODEL_ENDPOINT || '',
    apiKey: process.env.CUSTOM_MODEL_API_KEY,
    timeout: parseInt(process.env.CUSTOM_MODEL_TIMEOUT || '30000')
  }
};

/**
 * 验证配置（仅警告，不阻止服务启动）
 */
export function validateLLMConfig(config: LLMConfig): void {
  if (config.provider === 'zhipu' || config.provider === 'zhipu-finetune') {
    if (!config.zhipu?.apiKey) {
      console.warn('⚠️  警告: ZHIPU_API_KEY 未配置，LLM 解析功能将不可用');
      console.warn('    请在 .env 文件中设置 ZHIPU_API_KEY=你的API密钥');
    }
    if (!config.zhipu?.model) {
      console.warn('⚠️  警告: ZHIPU_MODEL 未配置，将使用默认模型 glm-4');
    }
  }
  
  if (config.provider === 'custom') {
    if (!config.custom?.endpoint) {
      console.warn('⚠️  警告: CUSTOM_MODEL_ENDPOINT 未配置');
    }
  }
}

/**
 * 检查 LLM 是否已配置（调用前检查）
 */
export function isLLMConfigured(config: LLMConfig): boolean {
  if (config.provider === 'zhipu' || config.provider === 'zhipu-finetune') {
    return !!(config.zhipu?.apiKey && config.zhipu?.model);
  }
  
  if (config.provider === 'custom') {
    return !!config.custom?.endpoint;
  }
  
  return false;
}

// 启动时验证配置（只警告，不抛出错误）
validateLLMConfig(llmConfig);



