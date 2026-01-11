# Coverage Parser Standalone - 服务拆分文档

## 📋 拆分目标

将 `coverage-parser-standalone.html` 中的大量函数按职责拆分成独立的服务文件，提高代码可维护性和可测试性。

## ✅ 已完成的拆分

### 1. 状态管理服务
**文件**: `services/state/appState.js`
**职责**: 统一管理应用的全局状态
- ✅ 解析相关状态（parseResult, isParsingInProgress）
- ✅ 责任相关状态（coverages, currentCoverageType）
- ✅ 保单相关状态（policies, editingPolicyId）
- ✅ 金额编辑相关状态（originalCalculatedAmounts, currentTiersData）

### 2. 责任分析协调服务
**文件**: `services/ui/coverageAnalysisCoordinator.js`
**职责**: 协调责任分析的整个流程
- ✅ `analyzeFromPage()` - 从页面分析责任
- ✅ `analyzeFromDialog()` - 从对话框分析责任
- ✅ 输入验证
- ✅ 调用解析服务
- ✅ UI状态更新

### 3. 结果收集服务
**文件**: `services/ui/resultCollectionService.js`
**职责**: 从UI表单中收集用户修改后的解析结果
- ✅ `collect()` - 收集所有字段
- ✅ `_collectPayoutAmount()` - 收集赔付金额
- ✅ `_collectPayoutCount()` - 收集赔付次数
- ✅ `_collectGrouping()` - 收集分组信息
- ✅ `_collectRepeatablePayout()` - 收集重复赔付信息
- ✅ `_collectIntervalPeriod()` - 收集间隔期
- ✅ `_collectPremiumWaiver()` - 收集豁免保费信息

### 4. 责任保存协调服务
**文件**: `services/ui/coverageSaveCoordinator.js`
**职责**: 协调责任保存的整个流程
- ✅ `save()` - 保存当前分析的责任
- ✅ `_getFinalCoverageName()` - 获取最终责任名称
- ✅ `_getLatestClause()` - 获取最新条款文本
- ✅ `_cleanupPeriodFields()` - 清理period字段
- ✅ `_updateCoverage()` - 更新现有责任
- ✅ `_createCoverage()` - 创建新责任
- ✅ `_extractAndSaveRules()` - 提取并保存规则
- ✅ `_resetState()` - 重置状态

### 5. 保单表单协调服务
**文件**: `services/ui/policyFormCoordinator.js`
**职责**: 协调保单表单的整个流程
- ✅ `complete()` - 完成保单填写
- ✅ `_collectFormData()` - 收集表单数据
- ✅ `_checkRecalculationNeeded()` - 检查是否需要重新计算
- ✅ `_recalculateAllCoverages()` - 重新计算所有责任的金额
- ✅ `updateCompleteButton()` - 更新完成按钮状态

## 🚧 待拆分的功能

### 1. 结果显示服务
**文件**: `services/ui/resultDisplayService.js` (待创建)
**职责**: 负责解析结果的显示
- ⏳ `displayResult()` - 显示解析结果
- ⏳ `createPayoutAmountDisplay()` - 创建赔付金额显示
- ⏳ `createPayoutCountDisplay()` - 创建赔付次数显示
- ⏳ `createGroupingDisplay()` - 创建分组显示
- ⏳ `createRepeatablePayoutDisplay()` - 创建重复赔付显示
- ⏳ `createIntervalPeriodDisplay()` - 创建间隔期显示
- ⏳ `createPremiumWaiverDisplay()` - 创建豁免保费显示

### 2. 金额编辑服务
**文件**: `services/ui/amountEditorService.js` (待创建)
**职责**: 负责金额编辑相关功能
- ⏳ `generateMaxOptionHTML()` - 生成Max选项HTML
- ⏳ `updateMaxOptionParams()` - 更新Max选项参数
- ⏳ `addMaxOption()` - 添加Max选项
- ⏳ `deleteMaxOption()` - 删除Max选项
- ⏳ `generateFormulaParamsHTML()` - 生成公式参数HTML
- ⏳ `updateFormulaParams()` - 更新公式参数
- ⏳ `updateFormulaPreview()` - 更新公式预览
- ⏳ `toggleFormulaEditor()` - 切换公式编辑器
- ⏳ `applyFormulaChanges()` - 应用公式更改
- ⏳ `addNewTierDialog()` - 添加新阶段对话框
- ⏳ `deleteTier()` - 删除阶段
- ⏳ `recalculateAmount()` - 重新计算金额

### 3. 责任编辑协调服务
**文件**: `services/ui/coverageEditCoordinator.js` (待创建)
**职责**: 协调责任编辑的整个流程
- ⏳ `editCoverage()` - 编辑责任
- ⏳ `updateCoverageNameInResult()` - 更新结果中的责任名称
- ⏳ `deleteCoverage()` - 删除责任
- ⏳ `generateEditForm()` - 生成编辑表单
- ⏳ `saveCoverageEdit()` - 保存责任编辑

### 4. 保单卡片协调服务
**文件**: `services/ui/policyCardCoordinator.js` (待创建)
**职责**: 协调保单卡片列表的显示和管理
- ⏳ `showPolicyCards()` - 显示合同卡片列表
- ⏳ `renderFamilyMemberStats()` - 渲染家庭成员统计
- ⏳ `filterPoliciesByMember()` - 按成员筛选保单
- ⏳ `renderPolicyCards()` - 渲染保单卡片
- ⏳ `loadPolicies()` - 加载保单列表

## 📁 文件结构

```
services/
├── state/
│   └── appState.js                    ✅ 应用状态管理
├── ui/
│   ├── coverageAnalysisCoordinator.js ✅ 责任分析协调
│   ├── coverageSaveCoordinator.js    ✅ 责任保存协调
│   ├── resultCollectionService.js    ✅ 结果收集
│   ├── policyFormCoordinator.js      ✅ 保单表单协调
│   ├── resultDisplayService.js       ⏳ 结果显示（待创建）
│   ├── amountEditorService.js         ⏳ 金额编辑（待创建）
│   ├── coverageEditCoordinator.js    ⏳ 责任编辑协调（待创建）
│   ├── policyCardCoordinator.js      ⏳ 保单卡片协调（待创建）
│   ├── uiRender.js                   ✅ 已存在
│   └── insuranceCompanySelector.js   ✅ 已存在
├── parser/                            ✅ 已存在
├── parsers/                           ✅ 已存在
├── rules/                             ✅ 已存在
├── storage/                           ✅ 已存在
└── utils/                             ✅ 已存在
```

## 🔄 迁移策略

### 阶段1: 创建服务文件 ✅
- ✅ 创建 AppState 状态管理
- ✅ 创建 CoverageAnalysisCoordinator
- ✅ 创建 ResultCollectionService
- ✅ 创建 CoverageSaveCoordinator
- ✅ 创建 PolicyFormCoordinator

### 阶段2: 更新HTML引用 ✅
- ✅ 在HTML中引入新的服务文件
- ✅ 更新函数调用，使用新服务
- ✅ 保留旧代码作为降级方案

### 阶段3: 继续拆分（进行中）
- ⏳ 创建 ResultDisplayService
- ⏳ 创建 AmountEditorService
- ⏳ 创建 CoverageEditCoordinator
- ⏳ 创建 PolicyCardCoordinator

### 阶段4: 清理代码（待完成）
- ⏳ 移除HTML中的旧函数实现
- ⏳ 移除降级代码
- ⏳ 统一使用AppState管理状态

## 📝 使用说明

### 在HTML中使用新服务

```javascript
// 旧方式
analyzeCoverageFromPage();

// 新方式（自动降级）
CoverageAnalysisCoordinator.analyzeFromPage();
```

### 访问应用状态

```javascript
// 旧方式
let coverages = coverages;

// 新方式
let coverages = appState.coverages;
```

## 🎯 拆分原则

1. **单一职责**: 每个服务只负责一个明确的功能领域
2. **依赖注入**: 服务之间通过明确的接口交互
3. **向后兼容**: 保留旧代码作为降级方案，确保平滑迁移
4. **状态集中**: 使用AppState统一管理全局状态
5. **易于测试**: 独立的服务文件便于单元测试

## 📊 拆分进度

- ✅ **已完成**: 5个核心服务
- ⏳ **进行中**: 结果显示服务
- ⏳ **待开始**: 金额编辑、责任编辑、保单卡片协调

**总体进度**: 约 40% 完成

## 🔗 相关文档

- [OPTIMIZATION_SUMMARY.md](../OPTIMIZATION_SUMMARY.md) - 优化总结
- [QUICK_REFERENCE.md](../QUICK_REFERENCE.md) - 快速参考
- [README.md](../README.md) - 项目文档

---

**最后更新**: 2026年1月5日
**维护者**: 开发团队

































