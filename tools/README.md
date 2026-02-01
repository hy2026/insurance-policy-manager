# 保险责任解析工具集 v3.0

## 📁 目录结构

```
tools/
├── 1_generate_batch.py    # 批次解析生成工具
├── 2_check_quality.ts     # 质量检查工具（MASTER）
├── 3_ai_reviewer.py       # AI自动审核修复
├── 4_import_db.ts         # 数据库导入工具
├── utils/
│   ├── validators.py      # 共用验证逻辑
│   └── fixers.py          # 共用修复逻辑
└── README.md              # 本文档
```

---

## 🔄 完整处理流程

### 新增200条责任数据的处理流程

```
原文Excel/MD
    ↓
[1] 1_generate_batch.py → 解析结果.json（手动填写或LLM生成）
    ↓
[2] 2_check_quality.ts → 问题清单.json (P0/P1/P2分级)
    ↓
[3] 3_ai_reviewer.py → AI修复建议.json
    ↓
[4] 人工审判 → 最终版本.json
    ↓
[5] 4_import_db.ts → 导入数据库
```

---

## 🛠️ 工具详解

### 1️⃣ 批次解析生成工具

**文件：** `1_generate_batch.py`

**功能：**
- 从原文条款文件加载数据
- 生成标准JSON模板
- 支持LLM自动解析（待实现）
- 支持手动填写模式

**使用方法：**

```bash
# 自动推断序号范围（批次16 = 3001-3200）
python 1_generate_batch.py --batch 16

# 指定序号范围
python 1_generate_batch.py --batch 16 --start 3001 --end 3200

# 指定输出目录
python 1_generate_batch.py --batch 16 --output ./temp/
```

**输出：**
- `解析结果/解析结果-批次X-序号X-X.json`

---

### 2️⃣ 质量检查工具

**文件：** `2_check_quality.ts`

**功能：**
- 最全面的质量检查工具（v1.9.5）
- 9大类别、30+检查项
- P0/P1/P2问题分级
- 自动生成修复建议

**使用方法：**

```bash
cd tools

# 检查单个文件
ts-node 2_check_quality.ts ../解析结果/解析结果-批次16.json

# 检查所有文件
ts-node 2_check_quality.ts ../解析结果/*.json
```

**检查项目：**

| 类别 | 检查项 | 优先级 |
|------|--------|--------|
| 结构完整性 | 必填字段、公式格式 | P0 |
| 年龄条件 | operator方向、ageType一致性 | P1 |
| 等待期 | status与原文一致性 | P1 |
| 交费期 | status与原文一致性 | P2 |
| 持续给付 | frequency字段、totalCount | P1 |
| note规则 | 累计次数、终止条件 | P1 |
| 自然语言描述 | 完整性、准确性 | P2 |

**输出：**
- 控制台输出问题清单
- 可选：保存为JSON报告

---

### 3️⃣ AI自动审核修复

**文件：** `3_ai_reviewer.py`

**功能：**
- 读取质量检查结果
- 自动应用修复逻辑
- 生成修复报告（等待人工审判）
- 支持自动应用模式

**使用方法：**

```bash
# 生成修复建议（不自动应用）
python 3_ai_reviewer.py --input ../解析结果/解析结果-批次16.json

# 自动运行检查+修复
python 3_ai_reviewer.py --input ../解析结果/解析结果-批次16.json --auto-fix

# 使用已有的检查报告
python 3_ai_reviewer.py --input ../解析结果/解析结果-批次16.json --check-report check_report.json
```

**修复能力：**

| 问题类型 | 自动修复 | 说明 |
|----------|----------|------|
| 缺少累计次数限制 | ✅ | 从原文提取并添加到note |
| 缺少终止表述 | ✅ | 添加"给付以1次为限" |
| 缺少交费期条件 | ✅ | 从原文识别并添加 |
| 描述不完整 | ✅ | 自动补全各维度描述 |
| stage级别note | ✅ | 移除（应在案例级别） |
| 缺少frequency | ✅ | 根据type推断 |
| 公式格式错误 | ✅ | 清理无效字符 |
| 年龄operator方向 | ⚠️ | 需人工审判 |

**输出：**
- `解析结果-批次X_fix_report.json` - 修复报告
- `解析结果-批次X_fixed.json` - 修复后数据（可选）

---

### 4️⃣ 数据库导入工具

**文件：** `4_import_db.ts`

**功能：**
- 导入解析结果到PostgreSQL数据库
- 支持覆盖/追加模式
- 批量导入（100条/批）
- 自动创建产品记录

**使用方法：**

```bash
cd tools

# 指定文件导入（追加模式）
ts-node 4_import_db.ts --file ../解析结果/解析结果-批次16.json

# 覆盖模式（清空后导入）
ts-node 4_import_db.ts --file ../解析结果/解析结果-批次16.json --mode replace

# 根据批次编号自动查找文件
ts-node 4_import_db.ts --batch 16 --mode append
```

**注意事项：**
- `--mode replace` 会清空整个责任库！
- 建议先备份数据库
- 支持断点续传（追加模式）

---

## 📦 工具库模块

### validators.py - 验证逻辑

```python
from tools.utils.validators import (
    has_cumulative_limit,       # 检查累计次数限制
    has_termination,            # 检查终止表述
    detect_payment_period,      # 检测交费期条件
    check_description_completeness,  # 检查描述完整性
    validate_age_operator,      # 验证年龄operator
    validate_formula,           # 验证公式格式
)
```

### fixers.py - 修复逻辑

```python
from tools.utils.fixers import (
    fix_cumulative_limit_note,  # 修复累计次数note
    fix_termination_note,       # 修复终止note
    fix_payment_period,         # 修复交费期条件
    fix_description_completeness,  # 修复描述完整性
    remove_stage_level_note,    # 移除stage级note
    add_continuous_payment_frequency,  # 添加frequency
    fix_formula_format,         # 修复公式格式
)
```

---

## 🎯 实战示例：处理200条新数据

### 步骤1：生成解析模板

```bash
cd tools
python 1_generate_batch.py --batch 16 --start 3001 --end 3200
```

输出：`解析结果/解析结果-批次16-序号3001-3200.json`（模板，需手动填写）

### 步骤2：手动填写

打开JSON文件，填写 `payoutAmount` 等字段（参考 `数据标注规则库.md`）

### 步骤3：质量检查

```bash
cd tools
ts-node 2_check_quality.ts ../解析结果/解析结果-批次16-序号3001-3200.json
```

查看问题清单（P0/P1/P2）

### 步骤4：AI自动修复

```bash
python 3_ai_reviewer.py --input ../解析结果/解析结果-批次16-序号3001-3200.json
```

查看修复报告：`解析结果-批次16-序号3001-3200_fix_report.json`

### 步骤5：人工审判

审查修复报告，确认修改无误后：

```bash
# 应用修复
python 3_ai_reviewer.py --input ../解析结果/解析结果-批次16-序号3001-3200.json --auto-fix
```

### 步骤6：导入数据库

```bash
cd tools
ts-node 4_import_db.ts --batch 16 --mode append
```

✅ 完成！

---

## 🔧 维护指南

### 添加新的检查规则

1. 在 `utils/validators.py` 添加验证函数
2. 在 `2_check_quality.ts` 添加检查逻辑
3. 在 `3_ai_reviewer.py` 的 `run_auto_checks()` 调用新函数

### 添加新的修复逻辑

1. 在 `utils/fixers.py` 添加修复函数
2. 在 `3_ai_reviewer.py` 的 `apply_fixes()` 添加问题类型映射

### 更新数据标注规则

1. 修改 `数据标注规则库.md`
2. 同步更新 `validators.py` 的验证逻辑
3. 运行回归测试（检查历史数据）

---

## 📊 统计信息

### 已处理数据

- ✅ 批次1-15: 共2800条（已导入数据库）
- ✅ 批次16: 共5条（序号3001-3005，已导入）

### 工具版本历史

- **v3.0** (2026-02-01): 整合所有临时工具，统一架构
- **v2.9** (2026-01-19): MASTER_QUALITY_CHECKER v1.9.5
- **v2.6** (2026-01-11): 数据标注规则库 v2.6

---

## ❓ 常见问题

### Q1: 为什么质量检查工具是.ts，修复工具是.py？

**A**: 质量检查工具（MASTER_QUALITY_CHECKER）最初在backend开发，使用TypeScript编写，功能完善且稳定。修复工具使用Python是为了快速迭代和数据处理便利性。两者通过JSON文件交互。

### Q2: AI审核工具会不会误修改？

**A**: 不会。工具仅修复检查出的具体问题，并生成详细的修复报告。默认模式下不会自动应用修复，需要人工审判后手动执行 `--auto-fix`。

### Q3: 如何回滚错误的修复？

**A**: 
1. 使用Git回滚：`git checkout HEAD -- 解析结果/*.json`
2. 从数据库重新导出（如果已导入）
3. 查看修复报告中的 `fix_description` 手动撤销

### Q4: 导入数据库失败怎么办？

**A**: 
1. 检查数据库连接（`.env` 文件）
2. 检查JSON格式是否正确
3. 检查是否有重复数据（使用 `--mode replace`）
4. 查看错误日志，定位具体案例

---

## 📞 技术支持

如有问题，请参考：
- `数据标注规则库.md` - 数据标注规范
- `标准术语表.md` - 术语定义
- `MASTER_QUALITY_CHECKER.ts` - 检查规则详细说明

---

**版本：** v3.0  
**更新日期：** 2026-02-01  
**维护者：** AI助手
