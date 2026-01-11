/**
 * 责任分析协调服务
 * 
 * 职责：协调责任分析的整个流程
 * - 收集用户输入
 * - 调用解析服务
 * - 更新UI状态
 * - 处理错误
 */

class CoverageAnalysisCoordinator {
  /**
   * 从页面分析责任
   */
  static async analyzeFromPage() {
    // 检查是否可以解析
    if (appState.isParsingInProgress) {
      showMessage('⚠️ 解析正在进行中，请稍候...', 'warning');
      return;
    }

    // 1. 收集输入
    const coverageType = document.querySelector('input[name="coverageType"]:checked')?.value;
    const clauseText = document.getElementById('pageClauseInput')?.value.trim();

    // 2. 验证输入
    if (!coverageType) {
      showMessage('❌ 请选择责任类型', 'error');
      return;
    }
    if (!clauseText) {
      showMessage('❌ 请输入保障责任条款', 'error');
      return;
    }

    // 3. 检查服务是否可用
    if (typeof BackendParserService === 'undefined') {
      showMessage('❌ 系统错误：后端解析服务未加载，请刷新页面重试', 'error');
      return;
    }

    // 4. 自动识别责任名称
    let coverageName = window.detectedCoverageName || '';
    if (!coverageName && clauseText) {
      coverageName = UtilityService.autoDetectCoverageName(clauseText);
      window.detectedCoverageName = coverageName;
    }

    // 5. 设置解析状态
    appState.setParsingInProgress(true);
    this._updateParseButton(true);

    try {
      // 6. 显示加载状态
      const loadingEl = document.getElementById('loading');
      if (loadingEl) {
        loadingEl.classList.add('active');
      }

      // 7. 调用解析服务
      const result = await parseClause(clauseText, coverageType);

      // 8. 隐藏加载状态
      if (loadingEl) {
        loadingEl.classList.remove('active');
      }

      // 9. 保存解析结果
      appState.parseResult = result;

      // 10. 显示结果
      if (typeof ResultDisplayService !== 'undefined') {
        ResultDisplayService.display(result, coverageName || window.detectedCoverageName || '');
      } else {
        // 降级：直接调用displayResult
        displayResult(result, coverageName || window.detectedCoverageName || '');
      }

      // 11. 显示保存按钮
      document.getElementById('actionsSection').style.display = 'flex';

      // 12. 保存当前分析状态
      const isEditing = appState.currentAnalyzingCoverage?.isEditing || false;
      const editIndex = appState.currentAnalyzingCoverage?.editIndex;
      appState.currentAnalyzingCoverage = {
        type: coverageType,
        name: coverageName || window.detectedCoverageName || '',
        clause: clauseText,
        result: result,
        isEditing: isEditing,
        editIndex: editIndex
      };

      // 13. 显示成功消息
      const confidenceText = result.overallConfidence 
        ? `（置信度: ${(result.overallConfidence * 100).toFixed(0)}%）` 
        : '';
      showMessage(`✅ 解析完成${confidenceText}，请查看右侧结果，确认后点击"保存责任"`, 'success');
    } catch (error) {
      document.getElementById('loading')?.classList.remove('active');
      console.error('❌ 解析失败:', error);
      showMessage('❌ 解析失败：' + error.message, 'error');
    } finally {
      // 14. 恢复按钮状态
      appState.setParsingInProgress(false);
      this._updateParseButton(false);
    }
  }

  /**
   * 从对话框分析责任
   */
  static async analyzeFromDialog() {
    if (appState.isParsingInProgress) {
      showMessage('⚠️ 解析正在进行中，请稍候...', 'warning');
      return;
    }

    // 1. 收集输入
    const coverageType = document.querySelector('input[name="dialogCoverageType"]:checked')?.value;
    const coverageName = document.getElementById('coverageName').value.trim();
    const clauseText = document.getElementById('dialogClauseInput').value.trim();

    // 2. 验证输入
    const validation = ValidationService.validateCoverageInput(coverageType, coverageName, clauseText);
    if (!validation.valid) {
      alert(validation.message);
      return;
    }

    // 3. 设置解析状态
    appState.setParsingInProgress(true);
    const parseButton = event?.target;
    const originalText = parseButton?.textContent;
    if (parseButton) {
      parseButton.disabled = true;
      parseButton.textContent = '⏳ 解析中...';
      parseButton.style.opacity = '0.6';
      parseButton.style.cursor = 'not-allowed';
    }

    try {
      // 4. 解析条款
      const parseResult = await parseClause(clauseText, coverageType);

      // 5. 创建责任对象
      const coverage = CoverageManagerService.create(coverageName, coverageType, clauseText, parseResult);

      // 6. 添加到列表
      CoverageManagerService.add(appState.coverages, coverage);

      // 7. 更新UI
      renderCoverageList();
      updateCompleteButton();
      closeAddCoverageDialog();
      showMessage('✅ 责任添加成功', 'success');
    } catch (error) {
      console.error('❌ 解析失败:', error);
      alert('解析失败：' + error.message);
    } finally {
      // 8. 恢复按钮状态
      appState.setParsingInProgress(false);
      if (parseButton) {
        parseButton.disabled = false;
        parseButton.textContent = originalText || '解析并添加';
        parseButton.style.opacity = '1';
        parseButton.style.cursor = 'pointer';
      }
    }
  }

  /**
   * 更新解析按钮状态
   */
  static _updateParseButton(isParsing) {
    const parseButton = document.getElementById('pageParseBtn');
    if (parseButton) {
      if (isParsing) {
        parseButton.disabled = true;
        parseButton.textContent = '⏳ 解析中...';
        parseButton.style.opacity = '0.6';
        parseButton.style.cursor = 'not-allowed';
      } else {
        parseButton.disabled = false;
        parseButton.textContent = '🔍 分析责任';
        parseButton.style.opacity = '1';
        parseButton.style.cursor = 'pointer';
      }
    }
  }
}

// 全局访问
window.CoverageAnalysisCoordinator = CoverageAnalysisCoordinator;

























