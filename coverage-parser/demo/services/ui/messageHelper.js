// ==================== 消息提示助手（职责：显示各种类型的用户消息）====================
class MessageHelper {
  /**
   * 显示消息
   * @param {string} text - 消息文本（支持HTML）
   * @param {string} type - 消息类型：success, error, warning, info
   */
  static show(text, type = 'info') {
    const messageDiv = document.getElementById('message');
    if (!messageDiv) {
      console.warn('消息容器不存在');
      return;
    }

    if (!text) {
      messageDiv.style.display = 'none';
      return;
    }

    messageDiv.className = `message ${type}-message`;
    
    // 支持HTML内容（用于显示链接等）
    if (typeof text === 'string' && text.includes('<')) {
      messageDiv.innerHTML = text;
    } else {
      messageDiv.textContent = text;
    }
    
    messageDiv.style.display = 'block';
    messageDiv.style.padding = '12px 16px';
    messageDiv.style.borderRadius = '8px';
    messageDiv.style.marginBottom = '16px';
    
    // 成功消息3秒后自动消失
    if (type === 'success') {
      setTimeout(() => {
        messageDiv.style.display = 'none';
      }, 3000);
    }
  }

  /**
   * 显示成功消息
   */
  static success(text) {
    this.show(`✅ ${text}`, 'success');
  }

  /**
   * 显示错误消息
   */
  static error(text) {
    this.show(`❌ ${text}`, 'error');
  }

  /**
   * 显示警告消息
   */
  static warning(text) {
    this.show(`⚠️ ${text}`, 'warning');
  }

  /**
   * 显示信息消息
   */
  static info(text) {
    this.show(`ℹ️ ${text}`, 'info');
  }

  /**
   * 隐藏消息
   */
  static hide() {
    const messageDiv = document.getElementById('message');
    if (messageDiv) {
      messageDiv.style.display = 'none';
    }
  }
}

// 兼容旧代码的全局函数
function showMessage(text, type) {
  MessageHelper.show(text, type);
}

































