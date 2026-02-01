#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
共用修复逻辑模块

从各个fix工具中提取的通用修复函数
"""

import re
from typing import Dict, List, Optional
from .validators import (
    has_cumulative_limit,
    has_termination,
    detect_payment_period,
    check_description_completeness,
    convert_chinese_num
)


def fix_cumulative_limit_note(case: Dict) -> bool:
    """
    修复缺失的累计赔付次数限制
    
    返回: 是否有修改
    """
    原文 = case.get('责任原文', '')
    note = case.get('note', '') or ''
    
    累计次数 = has_cumulative_limit(原文)
    if not 累计次数:
        return False
    
    # 检查note中是否已有累计次数信息
    has_累计 = '累计' in note and ('次' in note or str(累计次数) in note)
    has_最多 = '最多' in note and str(累计次数) in note
    
    if has_累计 or has_最多:
        return False  # 已经有了
    
    # 需要添加累计次数信息
    新增内容 = f"累计最多赔{累计次数}次"
    
    if note:
        # 在"每种"之后插入，或者在开头插入
        if '每种' in note:
            parts = note.split('；', 1)
            if len(parts) > 1:
                new_note = f"{parts[0]}；{新增内容}；{parts[1]}"
            else:
                new_note = f"{note}；{新增内容}"
        else:
            new_note = f"{新增内容}；{note}"
    else:
        new_note = 新增内容
    
    case['note'] = new_note
    return True


def fix_termination_note(case: Dict) -> bool:
    """
    修复包含"合同终止"但缺少note的问题
    
    返回: 是否有修改
    """
    原文 = case.get('责任原文', '')
    note = case.get('note', '') or ''
    
    if not has_termination(原文):
        return False
    
    # 检查note中是否已有赔付次数限制
    payout_limit_patterns = [
        r'给付以.{1,3}次为限',
        r'限赔.{1,3}次',
        r'累计[最多]?赔?\d+次',
        r'仅[限]?.{1,3}次',
    ]
    
    has_payout_limit = False
    for pattern in payout_limit_patterns:
        if re.search(pattern, note):
            has_payout_limit = True
            break
    
    if has_payout_limit:
        return False  # 已经有了
    
    # 添加"给付以1次为限"
    新增内容 = "给付以1次为限"
    
    if note:
        new_note = f"{新增内容}；{note}"
    else:
        new_note = 新增内容
    
    case['note'] = new_note
    return True


def fix_payment_period(case: Dict) -> int:
    """
    补充缺失的交费期条件
    
    返回: 修改的stage数量
    """
    原文 = case.get('责任原文', '')
    payment_status = detect_payment_period(原文)
    
    if not payment_status:
        return 0
    
    fixed_count = 0
    
    for stage in case.get('payoutAmount', []):
        if 'paymentPeriodStatus' in stage:
            continue  # 已经有了
        
        stage['paymentPeriodStatus'] = payment_status
        fixed_count += 1
        
        # 更新naturalLanguageDescription
        old_desc = stage.get('naturalLanguageDescription', '')
        if old_desc:
            payment_desc = "交费期内" if payment_status == 'during' else "交费期满后"
            
            # 在等待期后面插入交费期描述
            if '等待期后' in old_desc:
                new_desc = old_desc.replace('等待期后', f'等待期后、{payment_desc}')
            else:
                new_desc = f'{payment_desc}、{old_desc}'
            
            stage['naturalLanguageDescription'] = new_desc
    
    return fixed_count


def fix_description_completeness(stage: Dict, 原文: str = "") -> Optional[str]:
    """
    修复naturalLanguageDescription的完整性
    
    返回: 新的描述 或 None（如果无需修复）
    """
    is_complete, missing = check_description_completeness(stage, 原文)
    
    if is_complete:
        return None
    
    desc = stage.get('naturalLanguageDescription', '')
    parts = []
    
    # 1. 等待期
    waiting_status = stage.get('waitingPeriodStatus')
    if waiting_status:
        if waiting_status == 'during':
            parts.append('等待期内')
        elif waiting_status == 'after':
            parts.append('等待期后')
    
    # 2. 年龄条件
    age_conditions = stage.get('ageConditions', [])
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
    
    # 3. 保单年度
    policy_year = stage.get('policyYearRange')
    if policy_year:
        start = policy_year.get('start')
        end = policy_year.get('end')
        if start and end:
            parts.append(f'第{start}-{end}保单年度')
        elif start and not end:
            parts.append(f'第{start}保单年度起')
    
    # 4. 交费期
    payment_status = stage.get('paymentPeriodStatus')
    if payment_status:
        if payment_status == 'during':
            parts.append('交费期内')
        elif payment_status == 'after':
            parts.append('交费期满后')
    
    # 5. 获取当前的赔付描述
    current_payout = ''
    if '赔付' in desc:
        current_payout = desc[desc.find('按'):]
    elif '退还' in desc:
        current_payout = desc[desc.find('退还'):]
    else:
        # 从formula推断
        formula = stage.get('formula', '')
        if '已交保费' in formula:
            current_payout = '退还已交保费'
        elif '*' in formula and '%' in formula:
            match = re.search(r'(\d+(?:\.\d+)?)\s*%', formula)
            if match:
                ratio = match.group(1)
                current_payout = f'按基本保额的{ratio}%赔付'
    
    # 6. 持续给付
    continuous_payment = stage.get('continuousPayment')
    if continuous_payment:
        cp_type = continuous_payment.get('type')
        if cp_type == 'fixed_count':
            total_count = continuous_payment.get('totalCount')
            new_desc = '、'.join(parts) + f'确诊，每年{current_payout}（分{total_count}次）'
        elif cp_type == 'until_termination':
            new_desc = '、'.join(parts) + f'确诊，每年{current_payout}，持续给付至合同终止'
        else:
            new_desc = '、'.join(parts) + f'确诊，{current_payout}'
    else:
        new_desc = '、'.join(parts) + f'确诊，{current_payout}'
    
    return new_desc


def remove_stage_level_note(stage: Dict) -> bool:
    """
    移除stage级别的note（应该在案例级别）
    
    返回: 是否有修改
    """
    if 'note' in stage:
        del stage['note']
        return True
    return False


def add_continuous_payment_frequency(stage: Dict) -> bool:
    """
    为continuousPayment添加frequency字段
    
    返回: 是否有修改
    """
    cp = stage.get('continuousPayment')
    if not cp:
        return False
    
    if 'frequency' in cp:
        return False  # 已经有了
    
    # 根据type推断frequency
    cp_type = cp.get('type')
    if cp_type == 'fixed_count':
        cp['frequency'] = '年'  # 默认按年
    elif cp_type == 'until_termination':
        cp['frequency'] = '年'
    
    return True


def fix_formula_format(stage: Dict) -> bool:
    """
    修复公式格式问题
    
    返回: 是否有修改
    """
    formula = stage.get('formula', '')
    if not formula:
        return False
    
    # 移除无效字符
    invalid_chars = ['、', '，', '。', '；']
    new_formula = formula
    for char in invalid_chars:
        new_formula = new_formula.replace(char, '')
    
    # 统一乘号
    new_formula = new_formula.replace('×', '*').replace('x', '*').replace('X', '*')
    
    # 移除多余空格
    new_formula = ' '.join(new_formula.split())
    
    if new_formula != formula:
        stage['formula'] = new_formula
        return True
    
    return False
