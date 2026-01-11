// ==================== 工具服务（职责：提供通用工具函数）====================
class UtilityService {
  /**
   * 初始化年份选项（包括出生年份、投保开始年份、保障结束年份）
   */
  static initPolicyStartYearOptions() {
    const birthYearSelect = document.getElementById('birthYear');
    const startSelect = document.getElementById('policyStartYear');
    const endSelect = document.getElementById('coverageEndYear');
    
    if (!birthYearSelect) {
      console.error('❌ birthYear 元素不存在');
      return;
    }
    
    // 初始化出生年份下拉框（当前年份到1938年）
    const currentYear = new Date().getFullYear();
    const minBirthYear = 1938;
    
    birthYearSelect.innerHTML = '<option value="">请选择出生年份</option>';
    for (let year = currentYear; year >= minBirthYear; year--) {
      const age = currentYear - year;
      const option = document.createElement('option');
      option.value = year;
      option.textContent = `${year}年 (${age}岁)`;
      birthYearSelect.appendChild(option);
    }
    
    // 添加事件监听器，当出生年份改变时更新投保开始年份和保障结束年份
    birthYearSelect.addEventListener('change', () => {
      this.updatePolicyStartYearOptions();
      this.updateCoverageEndYearOptions();
    });
    
    // 初始化投保开始年份（如果有出生年份）
    if (birthYearSelect.value) {
      this.updatePolicyStartYearOptions();
    }
    
    // 初始化保障结束年份（如果有投保开始年份）
    if (startSelect && startSelect.value) {
      this.updateCoverageEndYearOptions();
    }
    
    // 添加投保开始年份变化监听
    if (startSelect) {
      startSelect.addEventListener('change', () => {
        this.updateCoverageEndYearOptions();
      });
    }
  }

  /**
   * 更新投保开始年份选项
   */
  static updatePolicyStartYearOptions() {
    const birthYearSelect = document.getElementById('birthYear');
    const startSelect = document.getElementById('policyStartYear');
    
    if (!birthYearSelect || !startSelect) {
      return;
    }
    
    const birthYear = parseInt(birthYearSelect.value);
    if (!birthYear) {
      startSelect.innerHTML = '<option value="">请选择投保开始年份</option>';
      return;
    }
    
    const currentYear = new Date().getFullYear();
    const currentAge = currentYear - birthYear;
    
    // 从当前年份往前到出生年份（最多50年）
    const minYear = Math.max(birthYear, currentYear - 50);
    
    startSelect.innerHTML = '<option value="">请选择投保开始年份</option>';
    for (let year = currentYear; year >= minYear; year--) {
      const age = year - birthYear;
      if (age >= 0 && age <= 120) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = `被保险人${age}岁（${year}年）`;
        startSelect.appendChild(option);
      }
    }
  }

  /**
   * 更新保障结束年份选项
   */
  static updateCoverageEndYearOptions() {
    const birthYearSelect = document.getElementById('birthYear');
    const startSelect = document.getElementById('policyStartYear');
    const endSelect = document.getElementById('coverageEndYear');
    
    if (!endSelect) {
      return;
    }
    
    const birthYear = birthYearSelect ? parseInt(birthYearSelect.value) : null;
    const policyStartYear = startSelect ? parseInt(startSelect.value) : null;
    
    const currentYear = new Date().getFullYear();
    const startYear = policyStartYear || currentYear;
    
    // 计算被保险人100岁对应的年份
    const maxYear = birthYear ? birthYear + 100 : currentYear + 100;
    
    endSelect.innerHTML = '<option value="">请选择保障结束年份</option>';
    endSelect.innerHTML += '<option value="lifetime">终身</option>';
    
    for (let year = startYear; year <= maxYear; year++) {
      const age = birthYear ? year - birthYear : null;
      const option = document.createElement('option');
      option.value = year;
      if (age !== null && age >= 0) {
        option.textContent = `被保险人${age}岁（${year}年）`;
      } else {
        option.textContent = `${year}年`;
      }
      endSelect.appendChild(option);
    }
  }

  /**
   * 设置默认值
   */
  static setDefaultValues() {
    // 被保险人默认"本人"
    const insuredPersonSelect = document.getElementById('insuredPerson');
    if (insuredPersonSelect && !insuredPersonSelect.value) {
      insuredPersonSelect.value = '本人';
    }
    
    // 出生年份默认2000年（25岁）
    const birthYearSelect = document.getElementById('birthYear');
    if (birthYearSelect && !birthYearSelect.value) {
      const currentYear = new Date().getFullYear();
      const defaultYear = 2000;
      birthYearSelect.value = defaultYear;
      // 触发change事件，更新依赖的年份选项
      birthYearSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    
    // 投保开始年份默认当前年份
    const startSelect = document.getElementById('policyStartYear');
    if (startSelect && !startSelect.value) {
      const currentYear = new Date().getFullYear();
      // 先确保选项已生成
      this.updatePolicyStartYearOptions();
      setTimeout(() => {
        if (startSelect.querySelector(`option[value="${currentYear}"]`)) {
          startSelect.value = currentYear;
          startSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, 50);
    }
    
    // 保障结束年份默认被保险人100岁对应的年份（或终身）
    const endSelect = document.getElementById('coverageEndYear');
    if (endSelect && !endSelect.value) {
      const birthYearSelect = document.getElementById('birthYear');
      const birthYear = birthYearSelect ? parseInt(birthYearSelect.value) : null;
      
      if (birthYear) {
        // 计算被保险人100岁对应的年份
        const maxYear = birthYear + 100;
        // 先确保选项已生成
        this.updateCoverageEndYearOptions();
        setTimeout(() => {
          // 优先选择终身，如果没有则选择100岁对应的年份
          if (endSelect.querySelector('option[value="lifetime"]')) {
            endSelect.value = 'lifetime';
          } else if (endSelect.querySelector(`option[value="${maxYear}"]`)) {
            endSelect.value = maxYear;
          }
        }, 50);
      } else {
        // 如果没有出生年份，默认选择终身
        this.updateCoverageEndYearOptions();
        setTimeout(() => {
          if (endSelect.querySelector('option[value="lifetime"]')) {
            endSelect.value = 'lifetime';
          }
        }, 50);
      }
    }
  }

  /**
   * 计算年龄
   */
  static calculateAge(birthYear, targetYear) {
    if (!birthYear || !targetYear) {
      return null;
    }
    return parseInt(targetYear) - parseInt(birthYear);
  }

  /**
   * 自动识别责任名称（从条款文本的第一行提取）
   * 只返回包含"保险金"或"责任"的名称，否则返回空字符串
   * 会去除标点符号，只保留核心名称
   */
  static autoDetectCoverageName(clauseText) {
    if (!clauseText || !clauseText.trim()) {
      return '';
    }
    
    // 获取第一行
    const lines = clauseText.split('\n').map(line => line.trim()).filter(line => line);
    if (lines.length === 0) {
      return '';
    }
    
    let firstLine = lines[0];
    
    // 只处理包含"保险金"或"责任"的行
    if (!firstLine.includes('保险金') && !firstLine.includes('责任')) {
      return '';
    }
    
    // 去除末尾的标点符号（句号、逗号、分号、冒号等）
    firstLine = firstLine.replace(/[。，、；：！？\s]+$/, '');
    
    // 去除开头的标点符号
    firstLine = firstLine.replace(/^[。，、；：！？\s]+/, '');
    
    // 如果包含括号，提取括号前的内容（括号内容可能是分类，需要单独处理）
    const bracketMatch = firstLine.match(/^(.+?)[（(].*?[）)]/);
    if (bracketMatch) {
      firstLine = bracketMatch[1].trim();
    }
    
    // 去除末尾可能残留的标点符号
    firstLine = firstLine.replace(/[。，、；：！？\s]+$/, '');
    
    return firstLine || '';
  }

  /**
   * 自动识别疾病责任分类（重症、中症、轻症、特殊疾病、其他）
   * @param {string} coverageName - 责任名称
   * @param {string} clauseText - 条款文本（可选）
   * @returns {string} 分类名称，如果无法识别则返回空字符串
   */
  static detectDiseaseCategory(coverageName = '', clauseText = '') {
    // 优先检查责任名称本身（更准确）
    const nameText = coverageName.toLowerCase();
    
    // 中症关键词（优先检查，因为更具体）
    const moderateKeywords = ['中症', '中度', '中等'];
    // 轻症关键词（优先检查，因为更具体）
    const mildKeywords = ['轻症', '轻度', '轻微', '早期'];
    // 特殊疾病关键词
    const specialKeywords = ['特殊疾病', '特定疾病', '罕见病', '特疾'];
    // 重症关键词（放在最后，因为"重疾"可能出现在其他类型的条款文本中）
    const severeKeywords = ['重症', '重疾', '重大疾病', '恶性肿瘤', '癌症', '严重', '重度'];
    
    // 1. 优先检查责任名称中的中症关键词
    if (moderateKeywords.some(keyword => nameText.includes(keyword.toLowerCase()))) {
      return '中症';
    }
    
    // 2. 优先检查责任名称中的轻症关键词
    if (mildKeywords.some(keyword => nameText.includes(keyword.toLowerCase()))) {
      return '轻症';
    }
    
    // 3. 检查责任名称中的特殊疾病关键词
    if (specialKeywords.some(keyword => nameText.includes(keyword.toLowerCase()))) {
      return '特殊疾病';
    }
    
    // 4. 如果责任名称中没有明确分类，再检查条款文本（合并检查）
    const fullText = (coverageName + ' ' + clauseText).toLowerCase();
    
    // 先检查中症（在条款文本中）
    if (moderateKeywords.some(keyword => fullText.includes(keyword.toLowerCase()))) {
      return '中症';
    }
    
    // 再检查轻症（在条款文本中）
    if (mildKeywords.some(keyword => fullText.includes(keyword.toLowerCase()))) {
      return '轻症';
    }
    
    // 再检查特殊疾病（在条款文本中）
    if (specialKeywords.some(keyword => fullText.includes(keyword.toLowerCase()))) {
      return '特殊疾病';
    }
    
    // 最后检查重症（在条款文本中）
    if (severeKeywords.some(keyword => fullText.includes(keyword.toLowerCase()))) {
      return '重症';
    }
    
    // 如果无法识别，返回空字符串（不显示分类）
    return '';
  }
}
