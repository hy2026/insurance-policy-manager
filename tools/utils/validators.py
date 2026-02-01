#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
共用验证逻辑模块

从各个检查工具中提取的通用验证函数
"""

import re
from typing import Dict, List, Optional, Tuple


def has_cumulative_limit(原文: str) -> Optional[int]:
    """
    检查原文中是否有累计次数限制
    
    返回: 累计次数 或 None
    """
    match = re.search(r'累计给付以([一二三四五六七八九十\d]+)次为限', 原文)
    if not match:
        return None
    
    累计次数_原文 = match.group(1)
    累计次数 = convert_chinese_num(累计次数_原文)
    
    if isinstance(累计次数, str) and 累计次数.isdigit():
        累计次数 = int(累计次数)
    
    return 累计次数


def has_termination(原文: str) -> bool:
    """
    检查是否包含终止表述
    
    返回: True/False
    """
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


def detect_payment_period(原文: str) -> Optional[str]:
    """
    检测交费期条件
    
    返回: 'during' | 'after' | None
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


def check_description_completeness(stage: Dict, 原文: str = "") -> Tuple[bool, List[str]]:
    """
    检查naturalLanguageDescription的完整性
    
    返回: (is_complete, missing_parts)
    """
    desc = stage.get('naturalLanguageDescription', '')
    missing = []
    
    # 1. 检查等待期
    waiting_status = stage.get('waitingPeriodStatus')
    if waiting_status:
        if waiting_status == 'during' and '等待期内' not in desc:
            missing.append('等待期内')
        elif waiting_status == 'after' and '等待期后' not in desc and '等待期' not in desc:
            missing.append('等待期后')
    
    # 2. 检查年龄条件
    age_conditions = stage.get('ageConditions', [])
    if age_conditions:
        has_age_in_desc = any(f"{cond.get('limit')}周岁" in desc for cond in age_conditions)
        if not has_age_in_desc:
            missing.append('年龄条件')
    
    # 3. 检查保单年度
    policy_year = stage.get('policyYearRange')
    if policy_year:
        has_policy_year = '保单年度' in desc or '年度' in desc
        if not has_policy_year:
            missing.append('保单年度')
    
    # 4. 检查交费期
    payment_status = stage.get('paymentPeriodStatus')
    if payment_status:
        if payment_status == 'during' and '交费期内' not in desc and '缴费期内' not in desc:
            missing.append('交费期内')
        elif payment_status == 'after' and '交费期满' not in desc and '缴费期满' not in desc:
            missing.append('交费期满后')
    
    # 5. 检查持续给付
    continuous_payment = stage.get('continuousPayment')
    if continuous_payment:
        cp_type = continuous_payment.get('type')
        total_count = continuous_payment.get('totalCount')
        
        if cp_type == 'fixed_count' and total_count:
            if f'分{total_count}次' not in desc and f'共{total_count}次' not in desc:
                missing.append(f'持续给付(分{total_count}次)')
        elif cp_type == 'until_termination':
            if '持续给付' not in desc:
                missing.append('持续给付至合同终止')
    
    # 6. 检查公式描述
    formula = stage.get('formula', '')
    if formula and formula not in desc:
        match = re.search(r'(\d+(?:\.\d+)?)\s*%', formula)
        if match:
            ratio = match.group(1)
            if ratio not in desc:
                missing.append(f'赔付比例({ratio}%)')
    
    is_complete = len(missing) == 0
    return is_complete, missing


def convert_chinese_num(cn: str) -> int:
    """将中文数字转换为阿拉伯数字"""
    cn_num_map = {
        '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
        '六': 6, '七': 7, '八': 8, '九': 9, '十': 10
    }
    
    # 尝试直接转换
    if cn in cn_num_map:
        return cn_num_map[cn]
    
    # 尝试解析为数字
    if cn.isdigit():
        return int(cn)
    
    # 其他情况返回原值
    return cn


def has_stage_level_note(stage: Dict) -> bool:
    """检查stage级别是否有note（应该在案例级别）"""
    return 'note' in stage


def has_continuous_payment_frequency(stage: Dict) -> bool:
    """检查continuousPayment是否有frequency字段"""
    cp = stage.get('continuousPayment')
    if not cp:
        return True  # 没有continuousPayment，不需要frequency
    
    return 'frequency' in cp


def validate_age_operator(age_condition: Dict, 原文: str = "") -> Tuple[bool, str]:
    """
    验证年龄条件的operator方向是否正确
    
    返回: (is_valid, error_msg)
    """
    operator = age_condition.get('operator')
    limit = age_condition.get('limit')
    
    if not operator or not limit:
        return False, "缺少operator或limit"
    
    # 检查原文中的表述
    if 原文:
        # "X周岁前" 应该用 <
        if f"{limit}周岁前" in 原文 or f"{limit}岁前" in 原文:
            if operator != '<':
                return False, f"{limit}周岁前应使用 < 而非 {operator}"
        
        # "X周岁后" 应该用 >=
        if f"{limit}周岁后" in 原文 or f"{limit}岁后" in 原文:
            if operator not in ['>=', '>']:
                return False, f"{limit}周岁后应使用 >= 或 > 而非 {operator}"
        
        # "X周岁及以上" 应该用 >=
        if f"{limit}周岁及以上" in 原文:
            if operator != '>=':
                return False, f"{limit}周岁及以上应使用 >= 而非 {operator}"
    
    return True, ""


def validate_formula(formula: str) -> Tuple[bool, str]:
    """
    验证公式格式
    
    返回: (is_valid, error_msg)
    """
    if not formula:
        return False, "公式为空"
    
    # 检查是否包含无效字符
    invalid_chars = ['、', '，', '。', '；']
    for char in invalid_chars:
        if char in formula:
            return False, f"公式包含无效字符: {char}"
    
    # 检查是否是合法的表达式结构
    valid_patterns = [
        r'基本保额',
        r'已交保费',
        r'\d+(?:\.\d+)?\s*%',
        r'[\+\-\*\/\(\)]',
        r'[xX×]'
    ]
    
    # 移除所有空格
    formula_clean = formula.replace(' ', '')
    
    # 检查是否至少匹配一个模式
    matched = False
    for pattern in valid_patterns:
        if re.search(pattern, formula_clean):
            matched = True
            break
    
    if not matched:
        return False, "公式格式不符合规范"
    
    return True, ""
