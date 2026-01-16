#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批次14复杂案例解析 - 最终阶段
处理剩余37个复杂案例，确保提取年龄和保单年度
"""

import json
import re
import sys
sys.path.append('.')

from generate_batch14_complex import (
    extract_age_conditions, 
    extract_policy_year_range,
    extract_payment_period_status
)

def parse_remaining_case(seq, code, category, name, text):
    """解析剩余复杂案例"""
    
    stages = []
    
    # 判断公式类型
    formula = None
    desc = None
    
    # 1. 表格类
    if '下表' in text or '表格' in text:
        formula = "按表格赔付"
        desc = "按表格比例赔付"
        
    # 2. 已交保费类（分段）
    elif '已交保费' in text or '已交纳' in text or '已支付的保险费' in text:
        # 等待期内
        if '等待期内' in text or '180日内' in text or '90日内' in text:
            wait_stage = {
                "stageNumber": 1,
                "period": "等待期内",
                "formula": "已交保费",
                "naturalLanguageDescription": "等待期内确诊，返还已交保费"
            }
            stages.append(wait_stage)
            
            # 等待期后
            after_stage = {
                "stageNumber": 2,
                "period": "等待期后",
                "formula": "基本保额 * 100%",
                "naturalLanguageDescription": "等待期后确诊，按基本保额赔付"
            }
            
            # 提取年龄条件（应用于等待期后）
            age_conditions = extract_age_conditions(text)
            if age_conditions:
                after_stage["ageConditions"] = age_conditions
            
            policy_year_range = extract_policy_year_range(text)
            if policy_year_range:
                after_stage["policyYearRange"] = policy_year_range
            
            stages.append(after_stage)
            
            return {
                "序号": seq,
                "产品编码": code,
                "险种类型": category,
                "责任名称": name,
                "payoutAmount": stages
            }
        else:
            # 单阶段已交保费
            formula = "已交保费"
            desc = "确诊后返还已交保费"
    
    # 3. 现金价值类
    elif '现金价值' in text:
        formula = "已交保费或现金价值的较大者"
        desc = "按已交保费或现金价值的较大者赔付"
        
    # 4. 百分比类
    elif '%' in text:
        percent_match = re.search(r'(\d+(?:\.\d+)?)%', text)
        if percent_match:
            percent = percent_match.group(1)
            formula = f"基本保额 * {percent}%"
            desc = f"按基本保额×{percent}%赔付"
        else:
            formula = "基本保额 * 100%"
            desc = "按基本保额赔付"
    
    # 5. 默认
    else:
        formula = "基本保额 * 100%"
        desc = "按基本保额赔付"
    
    # 构建单阶段
    stage = {
        "stageNumber": 1,
        "period": "等待期后",
        "formula": formula,
        "naturalLanguageDescription": desc
    }
    
    # 提取年龄条件
    age_conditions = extract_age_conditions(text)
    if age_conditions:
        stage["ageConditions"] = age_conditions
    
    # 提取保单年度范围
    policy_year_range = extract_policy_year_range(text)
    if policy_year_range:
        stage["policyYearRange"] = policy_year_range
    
    # 提取交费期状态
    payment_period_status = extract_payment_period_status(text)
    if payment_period_status:
        stage["paymentPeriodStatus"] = payment_period_status
    
    # 添加note
    notes = []
    if '限交一次' in text or '仅给付一次' in text or '限给付一次' in text or '以一次为限' in text:
        notes.append("限赔1次")
    elif '多次' in text or '累计给付' in text:
        # 提取次数
        for pattern in [r'([一二三四五六七八九十])次为限', r'累计.*?([一二三四五六七八九十])次', r'给付.*?([一二三四五六七八九十])次']:
            match = re.search(pattern, text)
            if match:
                notes.append(f"累计限赔{match.group(1)}次")
                break
    
    if '运动' in text and '达标' in text:
        notes.append("需达到运动标准")
    
    if notes:
        stage["note"] = "；".join(notes)
    
    stages.append(stage)
    
    return {
        "序号": seq,
        "产品编码": code,
        "险种类型": category,
        "责任名称": name,
        "payoutAmount": stages
    }

def main():
    print("="*80)
    print("批次14复杂案例解析 - 最终阶段（剩余37个）")
    print("="*80)
    
    # 读取已解析案例
    with open('解析结果/解析结果-批次14-序号2601-2800.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    existing_cases = data['cases']
    parsed_seqs = set(c['序号'] for c in existing_cases)
    
    # 读取原文
    with open('原文条款/原文条款-批次14.md', 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # 找出所有未解析的案例
    new_cases = []
    
    for line in lines:
        parts = line.strip().split('|||')
        if len(parts) >= 5 and parts[0].isdigit():
            seq = int(parts[0])
            
            if seq not in parsed_seqs and seq <= 2800:
                case = parse_remaining_case(seq, parts[1], parts[2], parts[3], parts[4])
                new_cases.append(case)
    
    print(f"\n成功解析: {len(new_cases)} 个案例")
    
    # 统计
    with_age = sum(1 for c in new_cases if any('ageConditions' in s for s in c['payoutAmount']))
    with_year = sum(1 for c in new_cases if any('policyYearRange' in s for s in c['payoutAmount']))
    with_note = sum(1 for c in new_cases if any('note' in s for s in c['payoutAmount']))
    multi_stage = sum(1 for c in new_cases if len(c['payoutAmount']) > 1)
    table_cases = sum(1 for c in new_cases if any('表格' in s.get('formula', '') for s in c['payoutAmount']))
    
    print(f"\n统计:")
    print(f"  包含年龄条件: {with_age}/{len(new_cases)} ({with_age*100//len(new_cases) if new_cases else 0}%)")
    print(f"  包含保单年度: {with_year} 个")
    print(f"  包含note: {with_note} 个")
    print(f"  多阶段案例: {multi_stage} 个")
    print(f"  表格类案例: {table_cases} 个")
    
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
    print(f"总案例数: {len(all_cases)} 个（164个已解析 + {len(new_cases)}个新解析）")
    print(f"完成度: {len(all_cases)}/200 ({len(all_cases)*100//200}%)")
    
    # 最终统计
    print("\n" + "="*80)
    print("批次14最终统计")
    print("="*80)
    total_with_age = sum(1 for c in all_cases if any('ageConditions' in s for s in c['payoutAmount']))
    total_with_year = sum(1 for c in all_cases if any('policyYearRange' in s for s in c['payoutAmount']))
    
    print(f"总案例数: {len(all_cases)}")
    print(f"包含年龄条件: {total_with_age} 个 ({total_with_age*100//len(all_cases)}%)")
    print(f"包含保单年度: {total_with_year} 个")
    print("="*80)

if __name__ == '__main__':
    main()










