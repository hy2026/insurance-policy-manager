#!/usr/bin/env python3
"""
全面检查和修复naturalLanguageDescription
确保描述包含所有维度：等待期、年龄、保单年度、交费期、持续给付等
版本：v2.9.2
日期：2026-01-11
"""

import json
import glob
import re


def check_completeness(stage, 序号, 责任名称):
    """
    检查naturalLanguageDescription的完整性
    返回：(is_complete, missing_parts, suggested_description)
    """
    desc = stage.get('naturalLanguageDescription', '')
    missing = []
    parts = []
    
    # 1. 检查等待期
    waiting_status = stage.get('waitingPeriodStatus')
    if waiting_status:
        if waiting_status == 'during' and '等待期内' not in desc:
            missing.append('等待期内')
            parts.append('等待期内')
        elif waiting_status == 'after' and '等待期后' not in desc and '等待期' not in desc:
            missing.append('等待期后')
            parts.append('等待期后')
        elif waiting_status == 'after':
            parts.append('等待期后')
    
    # 2. 检查年龄条件
    age_conditions = stage.get('ageConditions', [])
    if age_conditions:
        has_age_in_desc = any(f"{cond.get('limit')}周岁" in desc for cond in age_conditions)
        if not has_age_in_desc:
            missing.append('年龄条件')
            # 构建年龄描述
            for cond in age_conditions:
                limit = cond.get('limit')
                operator = cond.get('operator')
                if operator == '<':
                    parts.append(f"{limit}周岁前")
                elif operator == '<=':
                    parts.append(f"{limit}周岁及以前")
                elif operator == '>':
                    parts.append(f"{limit}周岁后")
                elif operator == '>=':
                    parts.append(f"{limit}周岁及以上")
    
    # 3. 检查保单年度
    policy_year = stage.get('policyYearRange')
    if policy_year:
        has_policy_year = '保单年度' in desc or '年度' in desc
        if not has_policy_year:
            missing.append('保单年度')
            start = policy_year.get('start')
            end = policy_year.get('end')
            if start and end:
                parts.append(f'第{start}-{end}保单年度')
            elif start and not end:
                parts.append(f'第{start}保单年度起')
    
    # 4. 检查交费期
    payment_status = stage.get('paymentPeriodStatus')
    if payment_status:
        if payment_status == 'during' and '交费期内' not in desc and '缴费期内' not in desc:
            missing.append('交费期内')
            parts.append('交费期内')
        elif payment_status == 'after' and '交费期满' not in desc and '缴费期满' not in desc:
            missing.append('交费期满后')
            parts.append('交费期满后')
    
    # 5. 检查持续给付 ⭐️ 重要
    continuous_payment = stage.get('continuousPayment')
    if continuous_payment:
        cp_type = continuous_payment.get('type')
        total_count = continuous_payment.get('totalCount')
        
        if cp_type == 'fixed_count' and total_count:
            # 应该有"分X次"
            if f'分{total_count}次' not in desc and f'共{total_count}次' not in desc:
                missing.append(f'持续给付(分{total_count}次)')
                parts.append(f'分{total_count}次')
        elif cp_type == 'until_termination':
            # 应该有"持续给付至..."
            if '持续给付' not in desc:
                missing.append('持续给付至合同终止')
                parts.append('持续给付至合同终止')
    
    # 6. 检查公式描述
    formula = stage.get('formula', '')
    if formula and formula not in desc:
        # 提取赔付比例
        match = re.search(r'(\d+(?:\.\d+)?)\s*%', formula)
        if match:
            ratio = match.group(1)
            if ratio not in desc:
                missing.append(f'赔付比例({ratio}%)')
    
    # 构建建议描述
    is_complete = len(missing) == 0
    
    # 如果不完整，构建建议
    suggested = None
    if not is_complete and parts:
        # 获取当前的赔付描述
        current_payout = ''
        if '赔付' in desc:
            current_payout = desc[desc.find('按'):]
        elif '退还' in desc:
            current_payout = desc[desc.find('退还'):]
        else:
            # 从formula推断
            if '已交保费' in formula:
                current_payout = '退还已交保费'
            elif '*' in formula and '%' in formula:
                match = re.search(r'(\d+(?:\.\d+)?)\s*%', formula)
                if match:
                    ratio = match.group(1)
                    current_payout = f'按基本保额的{ratio}%赔付'
        
        # 组合描述
        if continuous_payment:
            cp_type = continuous_payment.get('type')
            if cp_type == 'fixed_count':
                total_count = continuous_payment.get('totalCount')
                suggested = '、'.join(parts[:-1]) + f'确诊，每年{current_payout}（分{total_count}次）'
            elif cp_type == 'until_termination':
                suggested = '、'.join(parts[:-1]) + f'确诊，每年{current_payout}，持续给付至合同终止'
        else:
            suggested = '、'.join(parts) + f'确诊，{current_payout}'
    
    return is_complete, missing, suggested


def main():
    """主函数：全面检查所有案例"""
    
    print("="*80)
    print("全面检查naturalLanguageDescription完整性")
    print("="*80)
    print()
    
    # 统计数据
    total_cases = 0
    total_stages = 0
    incomplete_stages = 0
    issues_by_type = {
        '缺少等待期': 0,
        '缺少年龄条件': 0,
        '缺少保单年度': 0,
        '缺少交费期': 0,
        '缺少持续给付': 0,
        '缺少赔付比例': 0,
    }
    
    examples = []
    
    # 遍历所有批次
    files = sorted(glob.glob('解析结果-*.json'))
    
    for file in files:
        with open(file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            cases = data.get('cases', [])
            
            for case in cases:
                total_cases += 1
                序号 = case.get('序号')
                责任名称 = case.get('责任名称')
                
                for stage_idx, stage in enumerate(case.get('payoutAmount', []), 1):
                    total_stages += 1
                    
                    is_complete, missing, suggested = check_completeness(stage, 序号, 责任名称)
                    
                    if not is_complete:
                        incomplete_stages += 1
                        
                        # 统计缺失类型
                        for m in missing:
                            if '等待期' in m:
                                issues_by_type['缺少等待期'] += 1
                            elif '年龄' in m:
                                issues_by_type['缺少年龄条件'] += 1
                            elif '保单年度' in m:
                                issues_by_type['缺少保单年度'] += 1
                            elif '交费期' in m:
                                issues_by_type['缺少交费期'] += 1
                            elif '持续给付' in m:
                                issues_by_type['缺少持续给付'] += 1
                            elif '赔付比例' in m:
                                issues_by_type['缺少赔付比例'] += 1
                        
                        # 收集示例
                        if len(examples) < 20:
                            examples.append({
                                '序号': 序号,
                                '责任名称': 责任名称,
                                'stage': stage_idx,
                                '当前描述': stage.get('naturalLanguageDescription', ''),
                                '缺少': ', '.join(missing),
                                '建议描述': suggested or '需要手动检查',
                                '文件': file.split('/')[-1]
                            })
    
    # 显示统计结果
    print(f"总案例数: {total_cases}")
    print(f"总阶段数: {total_stages}")
    print(f"不完整的阶段: {incomplete_stages} ({incomplete_stages/total_stages*100:.1f}%)")
    print(f"完整的阶段: {total_stages - incomplete_stages} ({(total_stages - incomplete_stages)/total_stages*100:.1f}%)")
    
    print(f"\n缺失类型统计:")
    for issue_type, count in sorted(issues_by_type.items(), key=lambda x: x[1], reverse=True):
        if count > 0:
            print(f"  {issue_type}: {count}")
    
    print(f"\n前20个需要修复的案例:")
    print("-"*80)
    for i, ex in enumerate(examples, 1):
        print(f"\n{i}. 序号{ex['序号']} - {ex['责任名称']} (阶段{ex['stage']})")
        print(f"   文件: {ex['文件']}")
        print(f"   当前: {ex['当前描述']}")
        print(f"   缺少: {ex['缺少']}")
        print(f"   建议: {ex['建议描述']}")
    
    print("\n" + "="*80)


if __name__ == '__main__':
    main()












