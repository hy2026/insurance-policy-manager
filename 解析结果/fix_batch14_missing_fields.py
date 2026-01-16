#!/usr/bin/env python3
"""
修复批次14的缺失字段问题
1. 补充"责任原文"字段
2. 重新识别交费期条件（paymentPeriodStatus）
3. 重新识别note（终止表述）
版本：v2.9.1
日期：2026-01-11
"""

import json
import re

def parse_原文条款(file_path):
    """解析原文条款文件，返回{序号: 原文}的字典"""
    原文_dict = {}
    with open(file_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or line.startswith('序号范围'):
                continue
            parts = line.split('|||')
            if len(parts) >= 5:
                序号 = int(parts[0])
                原文 = parts[4]
                原文_dict[序号] = 原文
    return 原文_dict


def detect_payment_period(原文: str) -> str or None:
    """
    检测交费期条件
    返回：'during' | 'after' | None
    """
    patterns_during = [
        r'交费期[内间]',
        r'缴费期[内间]',
        r'交费.*期间届满.*前',
        r'缴费.*期间届满.*前',
    ]
    
    patterns_after = [
        r'交费期满',
        r'缴费期满',
        r'交费.*期间届满.*后',
        r'缴费.*期间届满.*以后',
    ]
    
    for pattern in patterns_during:
        if re.search(pattern, 原文):
            return 'during'
    
    for pattern in patterns_after:
        if re.search(pattern, 原文):
            return 'after'
    
    return None


def detect_note_termination(原文: str) -> bool:
    """检测是否包含终止表述"""
    patterns = [
        r'给付.*保险金[，,].*本合同终止',
        r'给付.*保险金[，,].*责任终止',
        r'给付.*保险金责任终止',
        r'按.*给付.*[，,].*本合同终止',
        r'按.*给付.*[，,].*责任终止',
    ]
    
    for pattern in patterns:
        if re.search(pattern, 原文):
            return True
    return False


def detect_note_限次(原文: str) -> str or None:
    """检测赔付次数限制"""
    # "给付以一次为限"
    if re.search(r'给付以.{0,3}次为限', 原文):
        match = re.search(r'给付以(.{1,2})次为限', 原文)
        if match:
            次数 = match.group(1)
            if 次数 in ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']:
                次数_map = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10}
                return f"给付以{次数_map[次数]}次为限"
    
    # "累计最多赔X次"
    if re.search(r'累计.*[给付赔].*[以为]?(\d+|[一二三四五六七八九十])次', 原文):
        match = re.search(r'累计.*[给付赔].*[以为]?(\d+|[一二三四五六七八九十])次', 原文)
        if match:
            return f"累计最多赔{match.group(1)}次"
    
    return None


def fix_batch14():
    """修复批次14"""
    
    print("="*80)
    print("修复批次14：补充责任原文、识别交费期和note")
    print("="*80)
    print()
    
    # 1. 读取原文条款
    print("1. 读取原文条款...")
    原文_dict = parse_原文条款('../原文条款/原文条款-批次14.md')
    print(f"   读取到 {len(原文_dict)} 条原文")
    
    # 2. 读取解析结果
    print("2. 读取批次14解析结果...")
    with open('解析结果-批次14-序号2601-2800.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    cases = data.get('cases', [])
    print(f"   共 {len(cases)} 个案例")
    
    # 3. 统计修复前状态
    missing_原文_before = sum(1 for c in cases if '责任原文' not in c or not c['责任原文'])
    has_payment_before = sum(1 for c in cases for stage in c.get('payoutAmount', []) if 'paymentPeriodStatus' in stage)
    has_note_before = sum(1 for c in cases if 'note' in c and c['note'])
    
    print(f"\n修复前:")
    print(f"   缺少责任原文: {missing_原文_before}")
    print(f"   有交费期条件: {has_payment_before}")
    print(f"   有note: {has_note_before}")
    
    # 4. 执行修复
    print(f"\n3. 执行修复...")
    fixed_原文 = 0
    fixed_payment = 0
    fixed_note = 0
    examples = []
    
    for case in cases:
        序号 = case.get('序号')
        
        # 4.1 补充责任原文
        if 序号 in 原文_dict:
            原文 = 原文_dict[序号]
            if '责任原文' not in case or not case['责任原文']:
                case['责任原文'] = 原文
                fixed_原文 += 1
            
            # 4.2 检测交费期
            payment_status = detect_payment_period(原文)
            if payment_status:
                # 为所有stage添加交费期条件
                for stage in case.get('payoutAmount', []):
                    if 'paymentPeriodStatus' not in stage:
                        stage['paymentPeriodStatus'] = payment_status
                        fixed_payment += 1
                        
                        # 更新naturalLanguageDescription
                        old_desc = stage.get('naturalLanguageDescription', '')
                        payment_desc = "交费期内" if payment_status == 'during' else "交费期满后"
                        # 在等待期后面插入交费期描述
                        if '等待期后' in old_desc:
                            new_desc = old_desc.replace('等待期后', f'等待期后、{payment_desc}')
                        else:
                            new_desc = f'{payment_desc}、{old_desc}'
                        stage['naturalLanguageDescription'] = new_desc
            
            # 4.3 检测note
            if 'note' not in case or not case['note']:
                notes = []
                
                # 检测终止表述
                if detect_note_termination(原文):
                    notes.append("给付以1次为限")
                
                # 检测限次表述
                限次_note = detect_note_限次(原文)
                if 限次_note and 限次_note not in notes:
                    notes.append(限次_note)
                
                if notes:
                    case['note'] = '；'.join(notes)
                    fixed_note += 1
                    
                    if len(examples) < 5:
                        examples.append({
                            '序号': 序号,
                            '责任名称': case.get('责任名称'),
                            'note': case['note'],
                            '有交费期': payment_status is not None
                        })
    
    # 5. 统计修复后状态
    missing_原文_after = sum(1 for c in cases if '责任原文' not in c or not c['责任原文'])
    has_payment_after = len(set(c.get('序号') for c in cases for stage in c.get('payoutAmount', []) if 'paymentPeriodStatus' in stage))
    has_note_after = sum(1 for c in cases if 'note' in c and c['note'])
    
    print(f"\n4. 修复完成!")
    print(f"   补充责任原文: {fixed_原文}")
    print(f"   添加交费期: {has_payment_after - has_payment_before} 个案例")
    print(f"   添加note: {fixed_note}")
    
    print(f"\n修复后:")
    print(f"   缺少责任原文: {missing_原文_after}")
    print(f"   有交费期条件: {has_payment_after} 个案例")
    print(f"   有note: {has_note_after}")
    
    print(f"\n前5个修复示例:")
    for i, ex in enumerate(examples, 1):
        payment_flag = "✅ 交费期" if ex['有交费期'] else ""
        print(f"{i}. 序号{ex['序号']} - {ex['责任名称']}")
        print(f"   note: {ex['note']} {payment_flag}")
    
    # 6. 保存修改
    print(f"\n5. 保存修改...")
    with open('解析结果-批次14-序号2601-2800.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print("="*80)
    print("修复完成！")
    print("="*80)


if __name__ == '__main__':
    fix_batch14()










