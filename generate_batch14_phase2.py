#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批次14复杂案例解析 - 第二阶段
处理：多次赔付中的基本保额100%案例 + 简单已交保费案例
"""

import json
import re
import sys
sys.path.append('.')

# 复用之前的函数
from generate_batch14_complex import (
    extract_age_conditions, 
    extract_policy_year_range,
    extract_payment_period_status
)

def parse_multi_premium_case(seq, code, category, name, text):
    """解析涉及已交保费的多阶段案例"""
    
    stages = []
    
    # 等待期内：返还已交保费
    if '等待期内' in text or '180日内' in text or '90日内' in text:
        wait_stage = {
            "stageNumber": 1,
            "period": "等待期内",
            "formula": "已交保费",
            "naturalLanguageDescription": "等待期内确诊，返还已交保费"
        }
        stages.append(wait_stage)
        
        # 等待期后：查看具体赔付
        if '等待期后' in text or '180日后' in text or '90日后' in text:
            # 检查等待期后的公式
            if '按.*?基本保险金额' in text or '保险金额.*?给付' in text:
                after_formula = "基本保额 * 100%"
                after_desc = "等待期后确诊，按基本保额赔付"
            else:
                # 查找表格
                if '下表' in text:
                    after_formula = "按表格赔付"
                    after_desc = "等待期后确诊，按表格赔付"
                else:
                    after_formula = "基本保额 * 100%"
                    after_desc = "等待期后确诊，按基本保额赔付"
            
            after_stage = {
                "stageNumber": 2,
                "period": "等待期后",
                "formula": after_formula,
                "naturalLanguageDescription": after_desc
            }
            
            # 提取年龄条件（应用于等待期后）
            age_conditions = extract_age_conditions(text)
            if age_conditions:
                after_stage["ageConditions"] = age_conditions
            
            # 提取保单年度（应用于等待期后）
            policy_year_range = extract_policy_year_range(text)
            if policy_year_range:
                after_stage["policyYearRange"] = policy_year_range
            
            stages.append(after_stage)
    else:
        # 没有等待期分段，按单阶段处理
        formula = "基本保额 * 100%"
        stage = {
            "stageNumber": 1,
            "period": "等待期后",
            "formula": formula,
            "naturalLanguageDescription": "等待期后确诊，按基本保额赔付"
        }
        
        age_conditions = extract_age_conditions(text)
        if age_conditions:
            stage["ageConditions"] = age_conditions
        
        policy_year_range = extract_policy_year_range(text)
        if policy_year_range:
            stage["policyYearRange"] = policy_year_range
        
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
    print("批次14复杂案例解析 - 第二阶段（多次赔付 + 已交保费）")
    print("="*80)
    
    # 读取已解析案例
    with open('解析结果/解析结果-批次14-序号2601-2800.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    existing_cases = data['cases']
    parsed_seqs = set(c['序号'] for c in existing_cases)
    
    # 读取原文
    with open('原文条款/原文条款-批次14.md', 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # 目标序号（18个）
    target_simple_100 = [2602, 2610, 2618, 2622, 2623, 2630, 2648, 2652, 
                         2659, 2688, 2693, 2706, 2725, 2728, 2730, 2772, 2722]
    target_premium = [2755]  # 涉及已交保费的案例
    
    new_cases = []
    
    for line in lines:
        parts = line.strip().split('|||')
        if len(parts) >= 5 and parts[0].isdigit():
            seq = int(parts[0])
            text = parts[4]
            
            if seq in target_simple_100:
                # 判断是否使用"确诊当年度保额"
                if '确诊时.*?基本保险金额' in text or '确诊当时.*?基本保险金额' in text:
                    formula = "确诊当年度保额 * 100%"
                    desc = "等待期后确诊，按确诊当年度保额赔付"
                else:
                    formula = "基本保额 * 100%"
                    desc = "等待期后确诊，按基本保额赔付"
                
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
                    "naturalLanguageDescription": desc
                }
                
                if age_conditions:
                    stage["ageConditions"] = age_conditions
                
                if policy_year_range:
                    stage["policyYearRange"] = policy_year_range
                
                if payment_period_status:
                    stage["paymentPeriodStatus"] = payment_period_status
                
                # 添加note
                notes = []
                if '限交一次' in text or '仅给付一次' in text or '限给付一次' in text or '以一次为限' in text:
                    notes.append("限赔1次")
                if '多次' in text or '累计给付' in text:
                    match = re.search(r'([一二三四五六])次为限', text)
                    if match:
                        notes.append(f"累计限赔{match.group(1)}次")
                
                if notes:
                    stage["note"] = "；".join(notes)
                
                case = {
                    "序号": seq,
                    "产品编码": parts[1],
                    "险种类型": parts[2],
                    "责任名称": parts[3],
                    "payoutAmount": [stage]
                }
                new_cases.append(case)
                
            elif seq in target_premium:
                case = parse_multi_premium_case(seq, parts[1], parts[2], parts[3], text)
                new_cases.append(case)
    
    print(f"\n成功解析: {len(new_cases)} 个案例")
    
    # 统计
    with_age = sum(1 for c in new_cases if any('ageConditions' in s for s in c['payoutAmount']))
    with_year = sum(1 for c in new_cases if any('policyYearRange' in s for s in c['payoutAmount']))
    with_note = sum(1 for c in new_cases if any('note' in s for s in c['payoutAmount']))
    multi_stage = sum(1 for c in new_cases if len(c['payoutAmount']) > 1)
    
    print(f"\n统计:")
    print(f"  包含年龄条件: {with_age}/{len(new_cases)} ({with_age*100//len(new_cases) if new_cases else 0}%)")
    print(f"  包含保单年度: {with_year} 个")
    print(f"  包含note: {with_note} 个")
    print(f"  多阶段案例: {multi_stage} 个")
    
    # 验证2755是否被解析
    if 2755 in [c['序号'] for c in new_cases]:
        print(f"\n✓ 序号2755已成功解析！")
    
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
    print(f"总案例数: {len(all_cases)} 个（145个已解析 + {len(new_cases)}个新解析）")
    print(f"完成度: {len(all_cases)}/200 ({len(all_cases)*100//200}%)")
    print("="*80)

if __name__ == '__main__':
    main()









