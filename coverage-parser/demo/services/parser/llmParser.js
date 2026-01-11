// ==================== LLM解析器（职责：使用OpenAI API进行语义解析）====================
class LLMParserService {
  /**
   * 使用OpenAI API解析条款
   * @param {string} clauseText - 条款文本
   * @param {string} apiKey - OpenAI API Key
   * @param {string} coverageType - 责任类型
   * @returns {Promise<Object>} 解析结果
   */
  static async parse(clauseText, apiKey, coverageType = 'disease') {
    if (!apiKey) {
      throw new Error('API Key 未提供');
    }

    const prompt = this.buildPrompt(clauseText, coverageType);
    
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: '你是一个专业的保险条款解析助手，能够准确提取保险责任的关键信息。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API 错误: ${response.status} - ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const resultText = data.choices[0]?.message?.content;
      
      if (!resultText) {
        throw new Error('未收到有效的解析结果');
      }

      // 解析 JSON 结果
      try {
        const result = JSON.parse(resultText);
        result.parseMethod = 'llm';
        result.tokenUsage = data.usage; // 保存 token 使用情况
        return result;
      } catch (parseError) {
        console.error('解析 LLM 返回结果失败:', parseError);
        throw new Error('LLM 返回的结果格式不正确');
      }
    } catch (error) {
      console.error('LLM 解析失败:', error);
      throw error;
    }
  }

  /**
   * 构建提示词
   */
  static buildPrompt(clauseText, coverageType) {
    const coverageTypeMap = {
      'disease': '重大疾病',
      'death': '身故',
      'accident': '意外',
      'annuity': '年金',
      'survival': '生存'
    };

    return `请解析以下${coverageTypeMap[coverageType] || '保险'}责任条款，提取关键信息并返回JSON格式结果：

条款内容：
${clauseText}

请返回以下格式的JSON（确保是有效的JSON，不要包含markdown代码块）：
{
  "payoutAmount": {
    "type": "percentage|fixed|tiered",
    "details": {...},
    "confidence": 0.0-1.0,
    "extractedText": "提取的原文"
  },
  "payoutCount": {
    "type": "single|multiple|lifetime",
    "maxCount": 数字或null,
    "terminateAfterPayout": true/false,
    "confidence": 0.0-1.0,
    "extractedText": "提取的原文"
  },
  "intervalPeriod": {
    "hasInterval": true/false,
    "days": 数字或null,
    "confidence": 0.0-1.0,
    "extractedText": "提取的原文"
  },
  "grouping": {
    "isGrouped": true/false,
    "groupCount": 数字或null,
    "confidence": 0.0-1.0,
    "extractedText": "提取的原文"
  },
  "repeatablePayout": {
    "isRepeatable": true/false,
    "confidence": 0.0-1.0,
    "extractedText": "提取的原文"
  },
  "premiumWaiver": {
    "isWaived": true/false,
    "confidence": 0.0-1.0,
    "extractedText": "提取的原文"
  },
  "conditions": [
    {
      "type": "firstDiagnosis|accidentNoWaiting|ageLimit",
      "description": "描述",
      "minAge": 数字或null,
      "maxAge": 数字或null,
      "confidence": 0.0-1.0,
      "extractedText": "提取的原文"
    }
  ],
  "overallConfidence": 0.0-1.0
}`;
  }
}

