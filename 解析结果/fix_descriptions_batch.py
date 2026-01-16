#!/usr/bin/env python3
"""
批量修复naturalLanguageDescription
1. 补充等待期描述
2. 补充持续给付描述
3. 补充交费期描述
版本：v2.9.3
日期：2026-01-11
"""

import json
import glob
import re


def fix_description(stage):
    """
    修复单个stage的描述
    返回：(fixed, old_desc, new_desc)
    """
    desc = stage.get('naturalLanguageDescription', '')
    if not desc:
        return False, '', ''
    
    original_desc = desc
    fixed = False
    parts = []
    remaining_desc = desc
    
    # 1. 等待期描述
    waiting_status = stage.get('waitingPeriodStatus')
    if waiting_status and '等待期' not in desc:
        if waiting_status == 'during':
            parts.append('等待期内')
            fixed = True
        elif waiting_status == 'after':
            parts.append('等待期后')
            fixed = True
    elif '等待期后' in desc:
        remaining_desc = desc.replace('等待期后', '').replace('、', '', 1).strip()
    elif '等待期内' in desc:
        remaining_desc = desc.replace('等待期内', '').replace('、', '', 1).strip()
    
    # 2. 年龄条件描述（已存在的保留）
    age_conditions = stage.get('ageConditions', [])
    if age_conditions:
        # 检查是否已有年龄描述
        has_age = any(f"{cond.get('limit')}周岁" in desc for cond in age_conditions)
        if not has_age:
            for cond in age_conditions:
                limit = cond.get('limit')
                operator = cond.get('operator')
                gender = cond.get('gender')
                
                age_desc = ''
                if operator == '<':
                    age_desc = f"{limit}周岁前"
                elif operator == '<=':
                    age_desc = f"{limit}周岁及以前"
                elif operator == '>':
                    age_desc = f"{limit}周岁后"
                elif operator == '>=':
                    age_desc = f"{limit}周岁及以上"
                
                if gender:
                    age_desc = f"{gender}性{age_desc}"
                
                if age_desc:
                    parts.append(age_desc)
                    fixed = True
    
    # 3. 交费期描述
    payment_status = stage.get('paymentPeriodStatus')
    if payment_status and '交费期' not in desc and '缴费期' not in desc:
        if payment_status == 'during':
            parts.append('交费期内')
            fixed = True
        elif payment_status == 'after':
            parts.append('交费期满后')
            fixed = True
    
    # 4. 保单年度描述（复杂，暂时跳过）
    
    # 5. 持续给付描述 ⭐️ 重要
    continuous = stage.get('continuousPayment')
    if continuous:
        cp_type = continuous.get('type')
        
        if cp_type == 'fixed_count':
            total_count = continuous.get('totalCount')
            if total_count and '分' not in desc and '共' not in desc:
                # 需要在最后添加持续给付信息
                frequency = continuous.get('frequency', '每年')
                
                # 提取当前的赔付描述
                if '按' in remaining_desc:
                    payout_part = remaining_desc
                    new_desc = f"{'、'.join(parts)}确诊，{frequency}{payout_part}（分{total_count}次）"
                else:
                    new_desc = f"{'、'.join(parts)}{'、' if parts else ''}{remaining_desc}（分{total_count}次）"
                
                stage['naturalLanguageDescription'] = new_desc
                return True, original_desc, new_desc
        
        elif cp_type == 'until_termination':
            if '持续' not in desc:
                frequency = continuous.get('frequency', '每年')
                
                # 提取当前的赔付描述
                if '按' in remaining_desc:
                    payout_part = remaining_desc
                    new_desc = f"{'、'.join(parts)}确诊，{frequency}{payout_part}，持续给付至合同终止"
                else:
                    new_desc = f"{'、'.join(parts)}{'、' if parts else ''}{remaining_desc}，持续给付至合同终止"
                
                stage['naturalLanguageDescription'] = new_desc
                return True, original_desc, new_desc
    
    # 6. 如果有修改，重新组合描述
    if fixed and not continuous:
        # 提取"确诊"后的部分
        if '确诊' in remaining_desc:
            after_confirm = remaining_desc[remaining_desc.find('确诊'):]
            new_desc = f"{'、'.join(parts)}{after_confirm}"
        else:
            new_desc = f"{'、'.join(parts)}确诊，{remaining_desc}"
        
        stage['naturalLanguageDescription'] = new_desc
        return True, original_desc, new_desc
    
    return False, original_desc, original_desc


def main():
    """主函数：批量修复所有批次"""
    
    print("="*80)
    print("批量修复naturalLanguageDescription")
    print("="*80)
    print()
    
    total_fixed = 0
    examples = []
    
    files = sorted(glob.glob('解析结果-*.json'))
    
    for file in files:
        print(f"处理 {file.split('/')[-1]}...", end=' ')
        
        with open(file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        cases = data.get('cases', [])
        file_fixed = 0
        
        for case in cases:
            序号 = case.get('序号')
            责任名称 = case.get('责任名称')
            
            for stage_idx, stage in enumerate(case.get('payoutAmount', []), 1):
                fixed, old_desc, new_desc = fix_description(stage)
                
                if fixed:
                    file_fixed += 1
                    total_fixed += 1
                    
                    if len(examples) < 20:
                        examples.append({
                            '序号': 序号,
                            '责任名称': 责任名称,
                            'stage': stage_idx,
                            '修复前': old_desc,
                            '修复后': new_desc
                        })
        
        # 保存修改
        with open(file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        print(f"修复 {file_fixed} 个")
    
    print(f"\n{'='*80}")
    print(f"修复完成！总共修复: {total_fixed} 个描述")
    print(f"{'='*80}")
    
    print(f"\n前20个修复示例:")
    for i, ex in enumerate(examples, 1):
        print(f"\n{i}. 序号{ex['序号']} - {ex['责任名称']} (阶段{ex['stage']})")
        print(f"   修复前: {ex['修复前']}")
        print(f"   修复后: {ex['修复后']}")


if __name__ == '__main__':
    main()










