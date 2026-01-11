/**
 * 应用状态管理服务
 * 
 * 职责：统一管理应用的全局状态
 */

class AppState {
  constructor() {
    // 解析相关状态
    this.parseResult = null;
    this.parseMethod = 'rule';
    this.isParsingInProgress = false;
    
    // 责任相关状态
    this.currentCoverageType = null;
    this.currentPolicyType = null;
    this.coverages = [];
    this.editingCoverageIndex = -1;
    this.currentAnalyzingCoverage = null;
    
    // 保单相关状态
    this.policies = [];
    this.editingPolicyId = null;
    this.filteredMember = null;
    
    // 金额编辑相关状态
    this.originalCalculatedAmounts = {};
    this.currentTiersData = [];
  }

  /**
   * 重置解析相关状态
   */
  resetParseState() {
    this.parseResult = null;
    this.isParsingInProgress = false;
    this.currentAnalyzingCoverage = null;
  }

  /**
   * 重置责任编辑状态
   */
  resetCoverageEditState() {
    this.editingCoverageIndex = -1;
    this.currentAnalyzingCoverage = null;
    window.detectedCoverageName = null;
  }

  /**
   * 重置保单编辑状态
   */
  resetPolicyEditState() {
    this.editingPolicyId = null;
  }

  /**
   * 设置解析进行中状态
   */
  setParsingInProgress(value) {
    this.isParsingInProgress = value;
  }

  /**
   * 检查是否可以解析
   */
  canParse() {
    return !this.isParsingInProgress && this.currentCoverageType !== null;
  }
}

// 导出单例
const appState = new AppState();
window.appState = appState; // 全局访问

























