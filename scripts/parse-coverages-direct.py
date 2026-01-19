#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
直接解析保险责任条款，参照字段定义文档生成CSV
"""

import csv
import re
import json
import os
from typing import Dict, List, Optional, Tuple

def escape_csv_field(field):
    """转义CSV字段中的特殊字符"""
    if not isinstance(field, str):
        field = str(field)
    if ',' in field or '"' in field or '\n' in field or '\r' in field:
        return f'"{field.replace('"', '""')}"'
    return field

def parse_waiting_period_status(clause_text: str) -> str:
    """解析等待期状态"""
    if "等待期内" in clause_text or "观察期内" in clause_text:
        return "during"
    elif "等待期后" in clause_text or "等待期满后" in clause_text or "意外" in clause_text or "意外伤害" in clause_text:
        return "after"
    else:
        # 默认等待期后
        return "after"

def parse_formula(clause_text: str) -> Tuple[str, str]:
    """解析赔付公式，返回(公式, 公式变量)"""
    # 统一使用"投保金额"
    formula = ""
    formula_variables = ""
    
    # 匹配百分比：基本保额/保险金额的XX%
    percent_match = re.search(r'(基本保额|保险金额|投保金额|基本保险金额)的?(\d+(?:\.\d+)?)%', clause_text)
    if percent_match:
        percent = percent_match.group(2)
        formula = f"投保金额×{percent}%"
        return formula, formula_variables
    
    # 匹配倍数：基本保额×XX%
    ratio_match = re.search(r'(基本保额|保险金额|投保金额|基本保险金额)×\s*(\d+(?:\.\d+)?)%', clause_text)
    if ratio_match:
        ratio = ratio_match.group(2)
        formula = f"投保金额×{ratio}%"
        return formula, formula_variables
    
    # 匹配倍数：基本保额×XX（无%）
    multiplier_match = re.search(r'(基本保额|保险金额|投保金额|基本保险金额)×\s*(\d+(?:\.\d+)?)(?!%)', clause_text)
    if multiplier_match:
        multiplier = multiplier_match.group(2)
        formula = f"投保金额×{multiplier}"
        return formula, formula_variables
    
    # 匹配已交保费
    if "已交保费" in clause_text or "已交保险费" in clause_text or "所交保费" in clause_text:
        formula = "已交保费"
        return formula, formula_variables
    
    # 匹配现金价值
    if "现金价值" in clause_text:
        formula = "现金价值"
        return formula, formula_variables
    
    # 匹配Max/Min公式
    if "较大者" in clause_text or "较大" in clause_text:
        if "基本保额" in clause_text or "保险金额" in clause_text:
            if "已交保费" in clause_text:
                formula = "Max(投保金额, 已交保费)"
            elif "现金价值" in clause_text:
                formula = "Max(投保金额, 现金价值)"
        return formula, formula_variables
    
    # 匹配变量公式（如赔付比例）
    if "赔付比例" in clause_text or "给付比例" in clause_text:
        formula = "投保金额×赔付比例"
        formula_variables = "赔付比例"
        return formula, formula_variables
    
    # 默认：投保金额
    if "基本保额" in clause_text or "保险金额" in clause_text or "投保金额" in clause_text:
        formula = "投保金额"
        return formula, formula_variables
    
    # 如果都没有，返回空
    return "", ""

def parse_age_condition(clause_text: str) -> Optional[str]:
    """解析年龄条件"""
    # 匹配年龄条件：未满XX周岁、满XX周岁、XX周岁前/后等
    age_patterns = [
        (r'未满(\d+)\s*周岁', '<', '确诊时'),
        (r'(\d+)\s*周岁前', '<', '确诊时'),
        (r'(\d+)\s*周岁以下', '<', '确诊时'),
        (r'年满(\d+)\s*周岁', '>=', '确诊时'),
        (r'(\d+)\s*周岁后', '>=', '确诊时'),
        (r'(\d+)\s*周岁及以上', '>=', '确诊时'),
        (r'超过(\d+)\s*周岁', '>', '确诊时'),
        (r'不超过(\d+)\s*周岁', '<=', '确诊时'),
        (r'满(\d+)\s*周岁', '>=', '确诊时'),
    ]
    
    # 检查是否有"投保时"的明确表述
    is_at_insurance = "投保时" in clause_text or "投保" in clause_text and "周岁" in clause_text
    is_at_diagnosis = "确诊时" in clause_text or "确诊" in clause_text and "周岁" in clause_text
    
    for pattern, operator, default_type in age_patterns:
        match = re.search(pattern, clause_text)
        if match:
            limit = int(match.group(1))
            age_type = default_type
            
            # 判断是"投保时"还是"确诊时"
            if is_at_insurance and not is_at_diagnosis:
                age_type = "投保时"
            elif is_at_diagnosis:
                age_type = "确诊时"
            elif "投保" in clause_text and "周岁" in clause_text:
                # 如果提到"投保"和"周岁"，优先判断为"投保时"
                age_type = "投保时"
            
            return json.dumps({"limit": limit, "operator": operator, "type": age_type})
    
    return ""

def parse_policy_year_range(clause_text: str) -> Optional[str]:
    """解析保单年度范围"""
    # 匹配：第X个保单周年日前/后
    policy_year_match = re.search(r'第(\d+)个保单周年日(前|后)', clause_text)
    if policy_year_match:
        year = int(policy_year_match.group(1))
        position = policy_year_match.group(2)
        if position == "前":
            return json.dumps({"start": 1, "end": year - 1})
        else:
            return json.dumps({"start": year, "end": None})
    
    # 匹配：第X-Y个保单年度
    range_match = re.search(r'第(\d+)-(\d+)个?保单年度', clause_text)
    if range_match:
        start = int(range_match.group(1))
        end = int(range_match.group(2))
        return json.dumps({"start": start, "end": end})
    
    # 匹配：前X年
    before_match = re.search(r'前(\d+)年', clause_text)
    if before_match:
        years = int(before_match.group(1))
        return json.dumps({"start": 1, "end": years})
    
    return ""

def generate_natural_language_description(clause_text: str, waiting_period: str, formula: str, age_condition: Optional[str], policy_year_range: Optional[str]) -> str:
    """生成自然语言描述（不超过50字）"""
    desc_parts = []
    
    # 等待期状态
    if waiting_period == "after":
        desc_parts.append("等待期后")
    elif waiting_period == "during":
        desc_parts.append("等待期内")
    
    # 疾病类型（简化）
    if "重大疾病" in clause_text:
        desc_parts.append("确诊重大疾病")
    elif "中症疾病" in clause_text or "中度疾病" in clause_text:
        desc_parts.append("确诊中症疾病")
    elif "轻症疾病" in clause_text or "轻度疾病" in clause_text:
        desc_parts.append("确诊轻症疾病")
    elif "恶性肿瘤" in clause_text:
        desc_parts.append("确诊恶性肿瘤")
    elif "特定疾病" in clause_text:
        desc_parts.append("确诊特定疾病")
    else:
        desc_parts.append("确诊")
    
    # 年龄条件
    if age_condition:
        age_obj = json.loads(age_condition)
        limit = age_obj["limit"]
        operator = age_obj["operator"]
        age_type = age_obj.get("type", "确诊时")
        
        if operator == "<":
            desc_parts.append(f"{age_type}未满{limit}周岁")
        elif operator == ">=":
            desc_parts.append(f"{age_type}满{limit}周岁")
    
    # 保单年度范围
    if policy_year_range:
        year_obj = json.loads(policy_year_range)
        if year_obj.get("end"):
            desc_parts.append(f"且第{year_obj['end'] + 1}个保单周年日前")
        elif year_obj.get("start"):
            desc_parts.append(f"且第{year_obj['start']}个保单周年日后")
    
    # 公式
    if formula:
        if "已交保费" in formula:
            desc_parts.append("，按已交保费给付")
        elif "×" in formula:
            # 提取比例
            ratio_match = re.search(r'×\s*(\d+(?:\.\d+)?%?)', formula)
            if ratio_match:
                ratio = ratio_match.group(1)
                desc_parts.append(f"，按投保金额×{ratio}给付")
            else:
                desc_parts.append("，按投保金额给付")
        else:
            desc_parts.append("，按投保金额给付")
    
    desc = "".join(desc_parts)
    
    # 限制长度
    if len(desc) > 50:
        desc = desc[:47] + "..."
    
    return desc

def generate_period_description(clause_text: str, waiting_period: str, age_condition: Optional[str], policy_year_range: Optional[str]) -> str:
    """生成阶段描述"""
    period_parts = []
    
    if waiting_period == "after":
        period_parts.append("等待期后")
    elif waiting_period == "during":
        period_parts.append("等待期内")
    
    # 年龄条件
    if age_condition:
        age_obj = json.loads(age_condition)
        limit = age_obj["limit"]
        operator = age_obj["operator"]
        age_type = age_obj.get("type", "确诊时")
        
        if operator == "<":
            period_parts.append(f"{age_type}未满{limit}周岁")
        elif operator == ">=":
            period_parts.append(f"{age_type}满{limit}周岁")
    
    # 保单年度范围
    if policy_year_range:
        year_obj = json.loads(policy_year_range)
        if year_obj.get("end"):
            period_parts.append(f"且第{year_obj['end'] + 1}个保单周年日前")
        elif year_obj.get("start"):
            period_parts.append(f"且第{year_obj['start']}个保单周年日后")
    
    return "".join(period_parts) if period_parts else "等待期后"

def generate_remarks(clause_text: str, formula: str, formula_variables: str) -> str:
    """生成备注信息"""
    remarks_parts = []
    
    # 给付次数限制
    if "以一次为限" in clause_text or "给付次数以一次为限" in clause_text:
        remarks_parts.append("给付次数以一次为限")
    elif "累计给付" in clause_text:
        count_match = re.search(r'累计给付.*?以(\d+)次为限', clause_text)
        if count_match:
            remarks_parts.append(f"累计给付以{count_match.group(1)}次为限")
    
    # 公式变量说明
    if formula_variables:
        if "赔付比例" in formula_variables:
            remarks_parts.append(f"公式中包含变量\"{formula_variables}\"，具体比例需根据条款确定")
    
    # 其他重要信息
    if "间隔" in clause_text:
        interval_match = re.search(r'(\d+)日|(\d+)年', clause_text)
        if interval_match:
            days = interval_match.group(1) if interval_match.group(1) else interval_match.group(2)
            remarks_parts.append(f"间隔期{days}日/年")
    
    return "，".join(remarks_parts) if remarks_parts else ""

def parse_clause(clause_text: str) -> Dict:
    """解析单个条款"""
    # 解析各个字段
    waiting_period = parse_waiting_period_status(clause_text)
    formula, formula_variables = parse_formula(clause_text)
    age_condition = parse_age_condition(clause_text)
    policy_year_range = parse_policy_year_range(clause_text)
    
    # 生成描述
    natural_language_description = generate_natural_language_description(
        clause_text, waiting_period, formula, age_condition, policy_year_range
    )
    period = generate_period_description(clause_text, waiting_period, age_condition, policy_year_range)
    remarks = generate_remarks(clause_text, formula, formula_variables)
    
    return {
        "naturalLanguageDescription": natural_language_description,
        "waitingPeriodStatus": waiting_period,
        "formula": formula,
        "formulaVariables": formula_variables,
        "ageCondition": age_condition or "",
        "policyYearRange": policy_year_range or "",
        "period": period,
        "remarks": remarks
    }

def parse_md_file(md_file_path: str) -> List[Dict]:
    """解析Markdown文件"""
    records = []
    
    with open(md_file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    lines = content.split('\n')
    
    for line in lines:
        line = line.strip()
        
        # 跳过代码块标记和注释
        if line == '```' or line.startswith('#'):
            continue
        
        # 跳过空行
        if not line:
            continue
        
        # 检查是否是数据行（包含|||分隔符）
        if '|||' not in line:
            continue
        
        # 分割字段
        parts = line.split('|||')
        
        if len(parts) < 5:
            continue
        
        # 清理字段
        cleaned_parts = [p.strip() for p in parts]
        
        serial_number, policy_document_id, coverage_type, coverage_name, clause_text = cleaned_parts[:5]
        
        # 验证序号
        try:
            num = int(serial_number)
            if num <= 0:
                continue
        except ValueError:
            continue
        
        records.append({
            "serialNumber": num,
            "policyDocumentId": policy_document_id,
            "coverageType": coverage_type,
            "coverageName": coverage_name,
            "clauseText": clause_text
        })
    
    return records

def main():
    md_file_path = '原文条款-批次1.md'
    csv_file_path = '责任解析结果-批次1.csv'
    
    # 解析MD文件
    print(f"📖 正在读取 {md_file_path}...")
    records = parse_md_file(md_file_path)
    print(f"✅ 共找到 {len(records)} 条记录")
    
    # 读取现有CSV
    existing_serial_numbers = set()
    existing_rows = []
    
    if os.path.exists(csv_file_path):
        with open(csv_file_path, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            existing_rows = list(reader)
            if len(existing_rows) > 0:
                # 提取已有序号
                for row in existing_rows[1:]:  # 跳过表头
                    if row and row[0].isdigit():
                        existing_serial_numbers.add(int(row[0]))
                print(f"📊 现有CSV中有 {len(existing_serial_numbers)} 条记录")
    
    # 解析新记录
    new_rows = []
    success_count = 0
    fail_count = 0
    
    for record in records:
        serial_num = record["serialNumber"]
        
        # 跳过已存在的记录
        if serial_num in existing_serial_numbers:
            continue
        
        try:
            # 解析条款
            parsed_data = parse_clause(record["clauseText"])
            
            # 构建CSV行
            row = [
                serial_num,
                record["policyDocumentId"],
                record["coverageType"],
                record["coverageName"],
                record["clauseText"],
                parsed_data["naturalLanguageDescription"],
                1,  # 阶段序号（默认1）
                parsed_data["period"],
                parsed_data["waitingPeriodStatus"],
                "",  # paymentPeriodStatus
                "",  # paymentMode
                parsed_data["ageCondition"],
                parsed_data["policyYearRange"],
                "",  # coveragePeriodConditions
                parsed_data["formula"],
                parsed_data["formulaVariables"],
                parsed_data["remarks"],
                "",  # insuranceCompany
                "",  # policyName
                ""   # insuranceType
            ]
            
            # 转义字段
            escaped_row = [escape_csv_field(f) for f in row]
            new_rows.append(escaped_row)
            
            success_count += 1
            print(f"✅ 已解析序号 {serial_num}: {record['coverageName']}")
            
        except Exception as e:
            fail_count += 1
            print(f"❌ 解析序号 {serial_num} 失败: {e}")
    
    # 追加到CSV
    if new_rows:
        with open(csv_file_path, 'a', encoding='utf-8', newline='') as f:
            writer = csv.writer(f)
            writer.writerows(new_rows)
        
        print(f"\n✅ 已追加 {len(new_rows)} 条新记录到 {csv_file_path}")
        print(f"📊 成功: {success_count}, 失败: {fail_count}")
    else:
        print("\nℹ️ 没有新的记录需要解析")

if __name__ == "__main__":
    main()


























