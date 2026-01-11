/**
 * 责任保存协调服务
 * 
 * 职责：协调责任保存的整个流程
 * - 收集用户修改的结果
 * - 验证数据
 * - 保存到列表
 * - 更新UI
 */

class CoverageSaveCoordinator {
  /**
   * 保存当前分析的责任
   */
  static save() {
    if (!appState.currentAnalyzingCoverage) {
      showMessage('❌ 没有可保存的责任', 'error');
      return;
    }

    // 1. 获取责任名称
    const finalName = this._getFinalCoverageName();

    // 2. 获取条款文本
    const latestClause = this._getLatestClause();
    if (!latestClause) {
      showMessage('❌ 请输入保障责任条款', 'error');
      return;
    }

    // 3. 收集用户修改后的解析结果
    let updatedResult;
    try {
      updatedResult = ResultCollectionService.collect(appState.currentAnalyzingCoverage.result);
      
      // 清理undefined的period字段
      this._cleanupPeriodFields(updatedResult);
    } catch (error) {
      console.error('收集解析结果失败:', error);
      showMessage('❌ 收集解析结果失败：' + error.message, 'error');
      return;
    }

    const { type, isEditing, editIndex } = appState.currentAnalyzingCoverage;
    const name = finalName;
    const clause = latestClause;

    // 4. 判断是编辑还是新增
    if (isEditing && editIndex !== undefined && editIndex >= 0) {
      this._updateCoverage(editIndex, name, type, clause, updatedResult);
    } else {
      this._createCoverage(name, type, clause, updatedResult);
    }

    // 5. 清空状态
    this._resetState();
  }

  /**
   * 获取最终的责任名称
   */
  static _getFinalCoverageName() {
    const nameElement = document.getElementById('resultCoverageName');
    let finalName = nameElement ? nameElement.textContent.trim() : appState.currentAnalyzingCoverage.name;

    // 提取括号前的名称
    const categoryMatch = finalName.match(/^(.+?)（(.+?)）$/);
    if (categoryMatch) {
      finalName = categoryMatch[1];
    }

    // 如果用户没有输入，自动生成名称
    if (!finalName || finalName === '未识别到有效名称，请手动输入') {
      const { type } = appState.currentAnalyzingCoverage;
      const typeNames = {
        'disease': '疾病责任',
        'death': '身故责任',
        'accident': '意外责任',
        'annuity': '年金责任'
      };
      const typeName = typeNames[type] || '责任';
      const sameTypeCount = appState.coverages.filter(c => c.type === type).length;
      finalName = `${typeName}${sameTypeCount + 1}`;
    }

    return finalName;
  }

  /**
   * 获取最新的条款文本
   */
  static _getLatestClause() {
    const inputClause = document.getElementById('pageClauseInput')?.value.trim();
    const savedClause = appState.currentAnalyzingCoverage?.clause || '';
    return inputClause || savedClause;
  }

  /**
   * 清理period字段
   */
  static _cleanupPeriodFields(updatedResult) {
    if (updatedResult.payoutAmount && 
        (updatedResult.payoutAmount.type === 'tiered' || updatedResult.payoutAmount.type === 'conditional')) {
      const tiersArray = updatedResult.payoutAmount.details?.tiers || updatedResult.payoutAmount.details?.conditions;
      if (tiersArray) {
        const processedArray = tiersArray.map(tier => {
          if (!tier) return null;
          if (tier.period === undefined) {
            const { period, ...rest } = tier;
            return rest;
          }
          return tier;
        }).filter(tier => tier !== null);

        if (updatedResult.payoutAmount.details.tiers) {
          updatedResult.payoutAmount.details.tiers = processedArray;
        } else if (updatedResult.payoutAmount.details.conditions) {
          updatedResult.payoutAmount.details.conditions = processedArray;
        }
      }
    }
  }

  /**
   * 更新现有责任
   */
  static _updateCoverage(index, name, type, clause, updatedResult) {
    const coverage = appState.coverages[index];
    coverage.name = name;
    coverage.type = type;
    coverage.clauseText = clause;
    coverage.parseResult = updatedResult;

    // 自我学习：提取规则
    this._extractAndSaveRules(clause, updatedResult, type);

    renderCoverageList();
    updateCompleteButton();
    showMessage('✅ 责任已更新', 'success');
  }

  /**
   * 创建新责任
   */
  static _createCoverage(name, type, clause, updatedResult) {
    try {
      // 创建前清理period字段
      this._cleanupPeriodFields(updatedResult);

      const coverage = CoverageManagerService.create(name, type, clause, updatedResult);
      CoverageManagerService.add(appState.coverages, coverage);

      // 自我学习：提取规则
      this._extractAndSaveRules(clause, updatedResult, type);

      renderCoverageList();
      updateCompleteButton();
      showMessage('✅ 责任添加成功', 'success');
    } catch (error) {
      console.error('创建责任失败:', error);
      showMessage('❌ 创建责任失败：' + error.message, 'error');
    }
  }

  /**
   * 提取并保存规则
   */
  static _extractAndSaveRules(clause, result, type) {
    try {
      console.log('📚 开始提取规则并学习...');
      const extractedRules = RuleExtractionService.extractRules(clause, result, type);
      if (extractedRules) {
        RuleStorageService.saveRules(extractedRules);
        console.log('✅ 规则学习成功，已保存', extractedRules.patterns.length, '个规则模式');
      }
    } catch (error) {
      console.error('❌ 规则提取失败:', error);
    }
  }

  /**
   * 重置状态
   */
  static _resetState() {
    document.getElementById('pageClauseInput').value = '';
    window.detectedCoverageName = null;
    appState.resetCoverageEditState();
    document.getElementById('resultContainer').innerHTML = '<p style="color: #999; text-align: center; padding: 40px;">解析结果将显示在这里...</p>';
    document.getElementById('actionsSection').style.display = 'none';
    document.getElementById('pageParseBtn').disabled = true;
  }
}

// 全局访问
window.CoverageSaveCoordinator = CoverageSaveCoordinator;

































