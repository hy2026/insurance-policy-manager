// ==================== 后端解析服务（职责：调用后端API进行大模型解析）====================
class BackendParserService {
  /**
   * 调用后端API进行条款解析
   * @param {string} clauseText - 条款文本
   * @param {string} coverageType - 责任类型
   * @param {Object} policyInfo - 保单信息（可选）
   * @returns {Promise<Object>} 解析结果
   */
  static async parse(clauseText, coverageType = 'disease', policyInfo = {}) {
    // 后端API地址（根据实际部署情况修改）
    // 检测访问方式，决定使用相对路径还是完整URL
    let backendUrl = '/api/coverage/parse'; // 默认使用相对路径（适用于通过主系统访问，有代理配置）
    
    // 如果通过 file:// 协议或独立HTTP服务器（端口8000）访问，使用完整的后端URL
    if (window.location.protocol === 'file:' || 
        (window.location.protocol === 'http:' && window.location.port === '8000')) {
      backendUrl = 'http://localhost:3001/api/parse';
    }
    
    console.log('📡 BackendParserService.parse 被调用');
    console.log('📡 后端URL:', backendUrl);
    console.log('📡 当前访问协议:', window.location.protocol);
    console.log('📡 当前端口:', window.location.port);
    console.log('📡 条款长度:', clauseText.length);
    console.log('📡 责任类型:', coverageType);
    
    // 🔍 调试：显示条款内容的前200和后200字符，确认前端发送的内容是否完整
    console.log('📄 [前端] 条款内容预览:');
    console.log('  【前200字符】:', clauseText.substring(0, 200));
    console.log('  【后200字符】:', clauseText.substring(Math.max(0, clauseText.length - 200)));
    
    try {
      console.log('📡 正在发送请求到后端...');
      const response = await fetch(backendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clauseText: clauseText,
          coverageType: coverageType,
          policyInfo: policyInfo
        })
      });
      
      console.log('📡 收到后端响应，状态码:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ 后端API返回错误状态:', response.status);
        console.error('❌ 错误详情:', errorData);
        throw new Error(`后端API错误: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      console.log('📡 后端返回数据:', data);
      
      // 后端返回的数据格式应该与LLM解析结果格式一致
      if (data.success && data.result) {
        const result = data.result;
        result.parseMethod = 'llm'; // 标记为大模型解析（后端调用）
        
        // 🔍 检查并记录 naturalLanguageDescription
        if (result.naturalLanguageDescription) {
          console.log('✅ [BackendParser] 找到 naturalLanguageDescription:', result.naturalLanguageDescription);
        } else {
          console.warn('⚠️ [BackendParser] 未找到 naturalLanguageDescription 字段');
          console.warn('⚠️ [BackendParser] result 对象包含的字段:', Object.keys(result));
        }
        
        // 保存原始的大模型响应，用于调试显示
        // 优先使用后端返回的 rawResponse，如果没有则使用 result 中的 rawLLMResponse
        if (data.rawResponse) {
          result.rawLLMResponse = data.rawResponse;
        } else if (result.rawLLMResponse) {
          // 如果 result 中已经有 rawLLMResponse，保持不变
          // result.rawLLMResponse 已经存在
        } else {
          // 如果都没有，保存整个后端返回数据作为备用
          result.rawLLMResponse = {
            backendResponse: data,
            result: result
          };
        }
        console.log('✅ [BackendParser] 后端解析成功，返回结果:', result);
        console.log('✅ [BackendParser] naturalLanguageDescription:', result.naturalLanguageDescription);
        console.log('✅ [BackendParser] rawLLMResponse:', result.rawLLMResponse);
        return result;
      } else {
        console.error('❌ 后端返回数据格式错误:', data);
        throw new Error(data.message || '后端解析失败');
      }
    } catch (error) {
      console.error('❌ 后端解析失败:', error);
      console.error('❌ 错误类型:', error.constructor.name);
      console.error('❌ 错误消息:', error.message);
      console.error('❌ 错误堆栈:', error.stack);
      
      // 如果是网络错误，提供更友好的提示
      if (error.message.includes('Failed to fetch') || 
          error.message.includes('NetworkError') ||
          error.message.includes('fetch')) {
        const networkError = new Error('无法连接到后端服务，请检查：\n1. 后端服务是否运行在 http://localhost:3001\n2. 网络连接是否正常\n3. 查看浏览器控制台获取详细错误信息');
        console.error('❌ 网络错误详情:', networkError);
        throw networkError;
      }
      
      throw error;
    }
  }

  /**
   * 🎯 Streaming模式：边生成边返回，改善用户等待体验
   * @param {string} clauseText - 条款文本
   * @param {string} coverageType - 责任类型
   * @param {Object} policyInfo - 保单信息
   * @param {Function} onAnalysisChunk - 接收分析文字的回调
   * @returns {Promise<Object>} 解析结果
   */
  static async parseStream(clauseText, coverageType = 'disease', policyInfo = {}, onAnalysisChunk) {
    let backendUrl = '/api/coverage/parse-stream';
    
    if (window.location.protocol === 'file:' || 
        (window.location.protocol === 'http:' && window.location.port === '8000')) {
      backendUrl = 'http://localhost:3001/api/parse/stream';
    }
    
    console.log('🎬 BackendParserService.parseStream 被调用');
    console.log('🎬 后端URL:', backendUrl);
    console.log('🎬 条款长度:', clauseText.length);
    
    try {
      const response = await fetch(backendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clauseText: clauseText,
          coverageType: coverageType,
          policyInfo: policyInfo
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult = null;
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log('✅ [BackendParser] Stream读取完成');
          break;
        }
        
        // 解码并追加到buffer
        buffer += decoder.decode(value, { stream: true });
        
        // 处理buffer中的完整SSE消息
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; // 保留最后一个不完整的消息
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              console.log('🎬 [BackendParser] 收到DONE信号');
              continue;
            }
            
            try {
              const parsed = JSON.parse(data);
              
              if (parsed.type === 'analysis' && parsed.content) {
                // 分析文字chunk
                if (onAnalysisChunk) {
                  onAnalysisChunk(parsed.content);
                }
              } else if (parsed.type === 'result') {
                // 最终结果
                finalResult = parsed.content;
                console.log('✅ [BackendParser] 收到最终结果');
              } else if (parsed.type === 'error') {
                throw new Error(parsed.content);
              }
            } catch (e) {
              console.warn('⚠️ [BackendParser] 解析SSE消息失败:', e, data);
            }
          }
        }
      }
      
      if (finalResult) {
        finalResult.parseMethod = 'llm-stream';
        return finalResult;
      } else {
        throw new Error('未收到最终解析结果');
      }
      
    } catch (error) {
      console.error('❌ Streaming解析失败:', error);
      
      if (error.message.includes('Failed to fetch') || 
          error.message.includes('NetworkError')) {
        throw new Error('无法连接到后端服务，请检查后端是否运行在 http://localhost:3001');
      }
      
      throw error;
    }
  }

  /**
   * 检查后端服务是否可用
   * @returns {Promise<boolean>} 后端服务是否可用
   */
  static async checkAvailability() {
    try {
      // 后端健康检查地址
      let healthCheckUrl = '/api/coverage/health';
      
      // 如果通过 file:// 协议或独立HTTP服务器（端口8000）访问，使用完整的后端URL
      if (window.location.protocol === 'file:' || 
          (window.location.protocol === 'http:' && window.location.port === '8000')) {
        healthCheckUrl = 'http://localhost:3001/health';
      }
      const response = await fetch(healthCheckUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      return response.ok;
    } catch (error) {
      console.warn('后端服务健康检查失败:', error);
      return false;
    }
  }
}

