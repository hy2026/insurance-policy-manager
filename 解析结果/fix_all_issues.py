import json

def fix_case(case):
    """修复单个案例"""
    fixed = False
    
    # 1. 删除案例级别的naturalLanguageDescription
    if 'naturalLanguageDescription' in case and 'payoutAmount' in case:
        del case['naturalLanguageDescription']
        fixed = True
    
    # 2. 收集所有stage中的note，合并到案例级别
    if 'payoutAmount' in case:
        all_notes = []
        for stage in case['payoutAmount']:
            if 'note' in stage:
                note_content = stage['note'].strip()
                if note_content:
                    # 过滤掉不应该在note中的内容
                    filtered_parts = []
                    for part in note_content.split('；'):
                        part = part.strip()
                        # 排除不符合规范的内容
                        if any(skip in part for skip in [
                            '等待期', '因意外', '确诊', '不给付', '不承担',
                            '责任终止', '本项', '按', '赔付', '给付日',
                            '当日', '首次', '无', '对应日', '初次'
                        ]):
                            continue
                        # 保留符合规范的内容
                        if any(keyword in part for keyword in [
                            '限赔', '最多赔', '给付以', '次为限', '累计',
                            '需间隔', '需属于', '不同组', '同组',
                            '豁免', '额外给付'
                        ]):
                            filtered_parts.append(part)
                    
                    if filtered_parts:
                        all_notes.extend(filtered_parts)
                
                # 从stage中删除note
                del stage['note']
                fixed = True
            
            # 3. 为continuousPayment补充frequency
            if 'continuousPayment' in stage:
                if 'frequency' not in stage['continuousPayment']:
                    stage['continuousPayment']['frequency'] = '每年对应日'
                    fixed = True
        
        # 合并note到案例级别（去重）
        if all_notes:
            unique_notes = []
            seen = set()
            for note in all_notes:
                if note not in seen:
                    unique_notes.append(note)
                    seen.add(note)
            
            if unique_notes:
                case['note'] = '；'.join(unique_notes)
                fixed = True
    
    return fixed

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

total_fixed = 0

for file in files:
    try:
        print(f"处理 {file}...")
        with open(file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        fixed_count = 0
        if 'cases' in data:
            for case in data['cases']:
                if fix_case(case):
                    fixed_count += 1
        
        # 写回文件
        with open(file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        print(f"  修复了 {fixed_count} 个案例")
        total_fixed += fixed_count
    
    except Exception as e:
        print(f"  Error: {e}")
        import traceback
        traceback.print_exc()

print(f"\n总计修复了 {total_fixed} 个案例")
