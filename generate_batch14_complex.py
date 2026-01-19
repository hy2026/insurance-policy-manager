#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批次14复杂案例解析脚本
优先处理：基本保额100%和倍数关系案例
"""

import json
import re

# 中文数字转换
CHINESE_NUM_MAP = {
    '零': 0, '一': 1, '二': 2, '三': 3, '四': 4,
    '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
    '十': 10, '百': 100,
    '十八': 18, '二十': 20, '二十一': 21, '二十五': 25,
    '三十': 30, '四十': 40, '五十': 50, '六十': 60,
    '七十': 70, '八十': 80, '九十': 90,
    '一百': 100
}

def chinese_to_num(chinese_str):
    """将中文数字转换为阿拉伯数字"""
    if not chinese_str:
        return None
    
    if chinese_str in CHINESE_NUM_MAP:
        return CHINESE_NUM_MAP[chinese_str]
    
    if '十' in chinese_str:
        if chinese_str == '十':
            return 10
        elif chinese_str.startswith('十'):
            ones = CHINESE_NUM_MAP.get(chinese_str[1], 0)
            return 10 + ones
        elif len(chinese_str) == 2:
            tens = CHINESE_NUM_MAP.get(chinese_str[0], 0)
            return tens * 10 if tens > 0 else None
        elif len(chinese_str) == 3:
            tens = CHINESE_NUM_MAP.get(chinese_str[0], 0)
            ones = CHINESE_NUM_MAP.get(chinese_str[2], 0)
            return tens * 10 + ones if tens > 0 else None
    
    return CHINESE_NUM_MAP.get(chinese_str, None)

def extract_age_conditions(text):
    """提取年龄条件（使用改进的60+种模式）"""
    conditions = []
    seen = set()
    
    patterns = [
        # 年龄范围（优先）
        (r'年满(\d+)周岁的首个保险单周年日[（(]含当日[)）]到年满(\d+)周岁的首个保险单周年日[（(]不含当日[)）]之间',
         lambda m: ('range', int(m.group(1)), int(m.group(2))-1)),
        (r'年满([一二三四五六七八九十]+)周岁的保单周年日[（(]含[一二三四五六七八九十]+周岁对应的保单周年日[)）]与年满([一二三四五六七八九十]+)周岁的保单周年日[（(]不含',
         lambda m: ('range', chinese_to_num(m.group(1)), chinese_to_num(m.group(2))-1) if chinese_to_num(m.group(1)) and chinese_to_num(m.group(2)) else None),
        (r'年满(\d+)周岁的保单周年日[（(]含[)）]与年满(\d+)周岁的保单周年日[（(]不含',
         lambda m: ('range', int(m.group(1)), int(m.group(2))-1)),
        (r'年龄到达([一二三四五六七八九十]+)周岁的合同生效对应日[（(]含[)）]至年龄到达([一二三四五六七八九十]+)周岁的合同生效对应日[（(]不含[)）]之间', 
         lambda m: ('range', chinese_to_num(m.group(1)), chinese_to_num(m.group(2))-1) if chinese_to_num(m.group(1)) and chinese_to_num(m.group(2)) else None),
        (r'于(\d+)周岁的保单周年日[（(]含[)）]后且(\d+)周岁的保单周年日[（(]不含[)）]前', lambda m: ('range', int(m.group(1)), int(m.group(2))-1)),
        (r'(\d+)周岁（含）至(\d+)周岁（含）之间', lambda m: ('range', int(m.group(1)), int(m.group(2)))),
        (r'([一二三四五六七八九十]+)周岁（含）至(\d+)周岁（含）之间', lambda m: ('range', chinese_to_num(m.group(1)), int(m.group(2)))),
        
        # "年满X周岁"系列
        (r'年满([一二三四五六七八九十]+)周岁的保单周年日[（(]不含[)）]前', lambda m: ('确诊时', '<', chinese_to_num(m.group(1)))),
        (r'年满(\d+)周岁后的首个保单周年日之前', lambda m: ('投保时', '<', int(m.group(1)))),
        (r'年满([一二三四五六七八九十]+)周岁后的首个保单周年日之前', lambda m: ('投保时', '<', chinese_to_num(m.group(1)))),
        (r'年满(\d+)周岁的首个保单周年日之后', lambda m: ('投保时', '>=', int(m.group(1)))),
        (r'年满([一二三四五六七八九十]+)周岁的首个保单周年日之后', lambda m: ('投保时', '>=', chinese_to_num(m.group(1)))),
        (r'年满(\d+)周岁后的首个保单年生效对应日零时之前', lambda m: ('投保时', '<', int(m.group(1)))),
        (r'年满(\d+)周岁的年生效对应日前', lambda m: ('投保时', '<', int(m.group(1)))),
        (r'年满([一二三四五六七八九十]+)周岁的年生效对应日前', lambda m: ('投保时', '<', chinese_to_num(m.group(1)))),
        
        # "在X周岁"系列
        (r'在被保险人(\d+)周岁的保单周年日之前', lambda m: ('确诊时', '<', int(m.group(1)))),
        (r'在(\d+)周岁的保单周年日之前', lambda m: ('确诊时', '<', int(m.group(1)))),
        (r'在(\d+)周岁的保单周年日前[（(]不含.*?[)）]', lambda m: ('确诊时', '<', int(m.group(1)))),
        (r'在(\d+)周岁的保单周年日前', lambda m: ('确诊时', '<', int(m.group(1)))),
        (r'在(\d+)周岁的保险单周年日零时前', lambda m: ('确诊时', '<', int(m.group(1)))),
        (r'在(\d+)周岁的保险单周年日零时后', lambda m: ('确诊时', '>=', int(m.group(1)))),
        
        # "于X周岁"系列
        (r'(\d+)周岁的首个保单周年日之后[（(]含\d+周岁的首个保单周年日[)）]', lambda m: ('投保时', '>=', int(m.group(1)))),
        (r'于(\d+)周岁.*?之后[（(]含\d+周岁[)）]', lambda m: ('确诊时', '>=', int(m.group(1)))),
        (r'于(\d+)周岁的保单周年日之后[（(]含\d+周岁的保单周年日[)）]', lambda m: ('确诊时', '>=', int(m.group(1)))),
        (r'于(\d+)周岁的保单周年日[（(]含[)）]后', lambda m: ('确诊时', '>=', int(m.group(1)))),
        (r'于(\d+)周岁保单生效对应日后', lambda m: ('确诊时', '>=', int(m.group(1)))),
        (r'于(\d+)周岁保单生效对应日[（(]不含[)）]之前', lambda m: ('确诊时', '<', int(m.group(1)))),
        
        # "未满X周岁"系列
        (r'确诊时未满(\d+)周岁', lambda m: ('确诊时', '<', int(m.group(1)))),
        (r'确诊时未满([一二三四五六七八九十]+)周岁', lambda m: ('确诊时', '<', chinese_to_num(m.group(1)))),
        (r'初次确诊时.*?未满(\d+)周岁', lambda m: ('确诊时', '<', int(m.group(1)))),
        (r'年龄未满(\d+)周岁', lambda m: ('确诊时', '<', int(m.group(1)))),
        (r'未满(\d+)周岁', lambda m: ('确诊时', '<', int(m.group(1)))),
        
        # "年龄在X周岁"系列
        (r'投保年龄小于或等于(\d+)周岁', lambda m: ('投保时', '<=', int(m.group(1)))),
        (r'确诊时被保险人小于或等于(\d+)周岁', lambda m: ('确诊时', '<=', int(m.group(1)))),
        (r'投保时被保险人年龄(\d+)周岁及以下', lambda m: ('投保时', '<=', int(m.group(1)))),
        (r'年龄在(\d+)周岁及以下', lambda m: ('确诊时', '<=', int(m.group(1)))),
        (r'年龄在(\d+)周岁[（(]含[)）]以下', lambda m: ('确诊时', '<=', int(m.group(1)))),
        (r'确诊时年龄在(\d+)周岁[（(]含[)）]以下', lambda m: ('确诊时', '<=', int(m.group(1)))),
        (r'确诊时年龄在([一二三四五六七八九十]+)周岁[（(]含[)）]以下', lambda m: ('确诊时', '<=', chinese_to_num(m.group(1)))),
        
        # "已满X周岁"系列
        (r'年龄已满(\d+)周岁[（(]含\d+周岁[)）]', lambda m: ('确诊时', '>=', int(m.group(1)))),
        (r'初次确诊时年龄已满(\d+)周岁', lambda m: ('确诊时', '>=', int(m.group(1)))),
        (r'确诊时已满(\d+)周岁', lambda m: ('确诊时', '>=', int(m.group(1)))),
        (r'已满(\d+)周岁', lambda m: ('确诊时', '>=', int(m.group(1)))),
        
        # "年龄到达X周岁"系列
        (r'年龄到达(\d+)周岁的合同生效对应日[（(]不含[)）]前', lambda m: ('投保时', '<', int(m.group(1)))),
        (r'年龄到达([一二三四五六七八九十]+)周岁的合同生效对应日[（(]不含[)）]前', lambda m: ('投保时', '<', chinese_to_num(m.group(1)))),
        
        # 中文数字特殊模式
        (r'年满([一二三四五六七八九十]+)周岁的保单周年日前[（(]不含[一二三四五六七八九十]+周岁对应的保单周年日[)）]', 
         lambda m: ('确诊时', '<', chinese_to_num(m.group(1)))),
        (r'年满([一二三四五六七八九十]+)周岁的保单周年日后[（(]含[一二三四五六七八九十]+周岁对应的保单周年日[)）]', 
         lambda m: ('确诊时', '>=', chinese_to_num(m.group(1)))),
        (r'到达年龄[注未]满(\d+)周岁[（(]不含[)）]前', lambda m: ('确诊时', '<', int(m.group(1)))),
        (r'到达年龄.*?在([一二三四五六七八九十]+)周岁[（(]不含[)）]之前', lambda m: ('确诊时', '<', chinese_to_num(m.group(1)))),
        (r'于年满(\d+)周岁[（(]含[)）]后', lambda m: ('确诊时', '>=', int(m.group(1)))),
        (r'年龄到达([一二三四五六七八九十]+)周岁的合同生效对应日[（(]含[)）]', lambda m: ('投保时', '>=', chinese_to_num(m.group(1)))),
        
        # 通用模式（最后）
        (r'年满(\d+)周岁.*?之前', lambda m: ('投保时', '<', int(m.group(1)))),
        (r'年满([一二三四五六七八九十]+)周岁.*?之前', lambda m: ('投保时', '<', chinese_to_num(m.group(1)))),
        (r'年满(\d+)周岁.*?之后', lambda m: ('投保时', '>=', int(m.group(1)))),
        (r'年满([一二三四五六七八九十]+)周岁.*?之后', lambda m: ('投保时', '>=', chinese_to_num(m.group(1)))),
        (r'(\d+)周岁前', lambda m: ('投保时', '<', int(m.group(1)))),
        (r'([一二三四五六七八九十]+)周岁前', lambda m: ('投保时', '<', chinese_to_num(m.group(1)))),
        (r'(\d+)周岁后', lambda m: ('投保时', '>=', int(m.group(1)))),
        (r'([一二三四五六七八九十]+)周岁后', lambda m: ('投保时', '>=', chinese_to_num(m.group(1)))),
    ]
    
    for pattern, extractor in patterns:
        for match in re.finditer(pattern, text):
            result = extractor(match)
            if result:
                if result[0] == 'range':
                    key = f"range_{result[1]}_{result[2]}"
                    if key not in seen:
                        conditions.append({
                            "ageType": "确诊时",
                            "operator": "range",
                            "age": result[1],
                            "maxAge": result[2]
                        })
                        seen.add(key)
                else:
                    age_type, operator, age = result
                    if age is not None:
                        key = f"{age_type}_{operator}_{age}"
                        if key not in seen:
                            conditions.append({
                                "ageType": age_type,
                                "operator": operator,
                                "age": age
                            })
                            seen.add(key)
    
    return conditions if conditions else None

def extract_policy_year_range(text):
    """提取保单年度范围"""
    # 第X个保险合同周年日前（含）
    match = re.search(r'第(\d+)个保险合同周年日.*?[（(]含[)）].*?[前之]', text)
    if match:
        return {"minYear": 1, "maxYear": int(match.group(1))}
    
    # 第X个保单周年日之前（不含第X个保单周年日）
    match = re.search(r'第(\d+)个保单周年日之前[（(]不含第\d+个保单周年日[)）]', text)
    if match:
        return {"minYear": 1, "maxYear": int(match.group(1)) - 1}
    
    # 第X个保单周年日前
    match = re.search(r'第(\d+)个保单周年日前', text)
    if match:
        return {"minYear": 1, "maxYear": int(match.group(1))}
    
    match = re.search(r'第([一二三四五六七八九十]+)个保单周年日前', text)
    if match:
        year = chinese_to_num(match.group(1))
        if year:
            return {"minYear": 1, "maxYear": year}
    
    return None

def extract_payment_period_status(text):
    """提取交费期状态"""
    if '交费期内' in text:
        return "交费期内"
    elif '交费期满' in text or '交费期后' in text:
        return "交费期满"
    return None

def parse_simple_100_case(seq, code, category, name, text):
    """解析基本保额100%案例"""
    
    # 构建公式
    formula = "基本保额 * 100%"
    
    # 提取年龄条件
    age_conditions = extract_age_conditions(text)
    
    # 提取保单年度范围
    policy_year_range = extract_policy_year_range(text)
    
    # 提取交费期状态
    payment_period_status = extract_payment_period_status(text)
    
    # 构建阶段
    stage = {
        "stageNumber": 1,
        "period": "等待期后",
        "formula": formula,
        "naturalLanguageDescription": "等待期后确诊，按基本保额赔付"
    }
    
    # 添加年龄条件
    if age_conditions:
        stage["ageConditions"] = age_conditions
    
    # 添加保单年度范围
    if policy_year_range:
        stage["policyYearRange"] = policy_year_range
    
    # 添加交费期状态
    if payment_period_status:
        stage["paymentPeriodStatus"] = payment_period_status
    
    # 添加note
    notes = []
    if '限交一次' in text or '仅给付一次' in text or '限给付一次' in text or '以一次为限' in text:
        notes.append("限赔1次")
    
    if notes:
        stage["note"] = "；".join(notes)
    
    return {
        "序号": seq,
        "产品编码": code,
        "险种类型": category,
        "责任名称": name,
        "payoutAmount": [stage]
    }

def parse_times_case(seq, code, category, name, text):
    """解析倍数关系案例"""
    
    # 提取倍数
    times_match = re.search(r'(\d+)倍', text)
    if times_match:
        times = int(times_match.group(1))
        formula = f"基本保额 * {times}"
    else:
        # 查找"等值于...倍"
        times_match = re.search(r'等值于.*?基本保险金额的(\d+)倍', text)
        if times_match:
            times = int(times_match.group(1))
            formula = f"基本保额 * {times}"
        else:
            formula = "基本保额 * 1"
    
    # 提取年龄条件
    age_conditions = extract_age_conditions(text)
    
    # 提取保单年度范围
    policy_year_range = extract_policy_year_range(text)
    
    # 提取交费期状态
    payment_period_status = extract_payment_period_status(text)
    
    # 构建阶段
    stage = {
        "stageNumber": 1,
        "period": "等待期后",
        "formula": formula,
        "naturalLanguageDescription": f"等待期后确诊，按{formula.replace('*', '×')}赔付"
    }
    
    # 添加年龄条件
    if age_conditions:
        stage["ageConditions"] = age_conditions
    
    # 添加保单年度范围
    if policy_year_range:
        stage["policyYearRange"] = policy_year_range
    
    # 添加交费期状态
    if payment_period_status:
        stage["paymentPeriodStatus"] = payment_period_status
    
    # 添加note
    notes = []
    if '限交一次' in text or '仅给付一次' in text or '限给付一次' in text or '以一次为限' in text:
        notes.append("限赔1次")
    
    if notes:
        stage["note"] = "；".join(notes)
    
    return {
        "序号": seq,
        "产品编码": code,
        "险种类型": category,
        "责任名称": name,
        "payoutAmount": [stage]
    }

def main():
    print("="*80)
    print("批次14复杂案例解析 - 优先级1（基本保额100% + 倍数关系）")
    print("="*80)
    
    # 读取已解析的简单案例
    with open('解析结果/解析结果-批次14-序号2601-2800.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    parsed_seqs = set(c['序号'] for c in data['cases'])
    existing_cases = data['cases']
    
    # 读取原文
    with open('原文条款/原文条款-批次14.md', 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # 目标序号（优先级1）
    target_simple = [2606, 2616, 2629, 2631, 2641, 2642, 2644, 2645, 2654, 2656, 
                     2673, 2675, 2681, 2684, 2686, 2687, 2696, 2707, 2709, 2716,
                     2723, 2729, 2733, 2767]
    target_times = [2761, 2779]
    
    new_cases = []
    
    for line in lines:
        parts = line.strip().split('|||')
        if len(parts) >= 5 and parts[0].isdigit():
            seq = int(parts[0])
            
            if seq in target_simple:
                case = parse_simple_100_case(seq, parts[1], parts[2], parts[3], parts[4])
                new_cases.append(case)
            elif seq in target_times:
                case = parse_times_case(seq, parts[1], parts[2], parts[3], parts[4])
                new_cases.append(case)
    
    print(f"\n成功解析: {len(new_cases)} 个案例")
    
    # 统计
    with_age = sum(1 for c in new_cases if any('ageConditions' in s for s in c['payoutAmount']))
    with_year = sum(1 for c in new_cases if any('policyYearRange' in s for s in c['payoutAmount']))
    with_note = sum(1 for c in new_cases if any('note' in s for s in c['payoutAmount']))
    
    print(f"\n统计:")
    print(f"  包含年龄条件: {with_age}/{len(new_cases)} ({with_age*100//len(new_cases) if new_cases else 0}%)")
    print(f"  包含保单年度: {with_year} 个")
    print(f"  包含note: {with_note} 个")
    
    # 合并到已有案例
    all_cases = existing_cases + new_cases
    all_cases.sort(key=lambda x: x['序号'])
    
    # 生成JSON
    output = {
        "batch": 14,
        "sequenceRange": "2601-2800",
        "totalCases": len(all_cases),
        "cases": all_cases
    }
    
    output_file = '解析结果/解析结果-批次14-序号2601-2800.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print(f"\n✓ 已保存到: {output_file}")
    print(f"总案例数: {len(all_cases)} 个（120个简单案例 + {len(new_cases)}个复杂案例）")
    print("="*80)

if __name__ == '__main__':
    main()












