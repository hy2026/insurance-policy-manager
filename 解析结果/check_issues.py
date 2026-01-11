import json
import re

files = [
    '解析结果-批次1-序号1-200.json',
    '解析结果-批次2-序号201-400.json',
    '解析结果-批次3-序号401-600.json',
    '解析结果-批次4-序号601-800.json',
    '解析结果-批次5-序号801-1000.json',
    '解析结果-批次6-序号1001-1200.json',
    '解析结果-批次7-序号1201-1400.json',
    '解析结果-批次8-序号1401-1600.json',
    '解析结果-批次9-序号1601-1800.json',
    '解析结果-批次10-序号1801-2000.json',
    '解析结果-批次11-序号2001-2200.json',
    '解析结果-批次12-序号2201-2400.json',
    '解析结果-批次13-序号2401-2600.json',
    '解析结果-批次14-序号2601-2800.json',
    '解析结果-批次15-序号2801-3000.json',
]

issues = {
    'note在stage级别': set(),
    '案例级别有naturalLanguageDescription': set(),
    'continuousPayment缺少frequency': set(),
}

for file in files:
    try:
        with open(file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 使用正则匹配找到所有案例
        pattern = r'"序号":\s*(\d+),.*?(?="序号":|$)'
        matches = re.finditer(pattern, content, re.DOTALL)
        
        for match in matches:
            case_num = int(match.group(1))
            case_text = match.group(0)
            
            # 检查案例级别是否有naturalLanguageDescription（在payoutAmount之前）
            if re.search(r'"naturalLanguageDescription".*?"payoutAmount"', case_text, re.DOTALL):
                issues['案例级别有naturalLanguageDescription'].add(case_num)
            
            # 检查stage中是否有note
            if re.search(r'"payoutAmount".*?"note":', case_text, re.DOTALL):
                issues['note在stage级别'].add(case_num)
            
            # 检查continuousPayment缺少frequency
            if '"continuousPayment"' in case_text:
                cp_pattern = r'"continuousPayment":\s*\{([^}]+)\}'
                cp_matches = re.findall(cp_pattern, case_text)
                for cp_content in cp_matches:
                    if '"frequency"' not in cp_content:
                        issues['continuousPayment缺少frequency'].add(case_num)
    
    except Exception as e:
        print(f"Error processing {file}: {e}")

# 输出结果
print("=" * 60)
print("问题统计:")
print("=" * 60)
for issue_type, cases in issues.items():
    cases_list = sorted(cases)
    print(f"\n{issue_type}: {len(cases_list)}个案例")
    if len(cases_list) <= 30:
        print(f"  案例: {cases_list}")
    else:
        print(f"  前30个: {cases_list[:30]}")

print("\n" + "=" * 60)
all_issues = set()
for cases in issues.values():
    all_issues.update(cases)
print(f"总计需要修复的案例: {len(all_issues)}个")
print("=" * 60)
