#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
直接解析第31-40条条款，生成CSV格式
"""

import csv
import json
import re

def escape_csv_field(field):
    """转义CSV字段"""
    if not field:
        return ''
    if ',' in field or '"' in field or '\n' in field:
        return '"' + field.replace('"', '""') + '"'
    return field

def parse_coverage(clause_text, coverage_name):
    """解析单条条款"""
    result = {
        'naturalLanguageDescription': '',
        'period': '',
        'waitingPeriodStatus': '',
        'paymentPeriodStatus': '',
        'paymentMode': '',
        'ageCondition': '',
        'policyYearRange': '',
        'coveragePeriodConditions': '',
        'formula': '',
        'formulaVariables': '',
        'remarks': ''
    }
    
    # 提取等待期状态
    if '等待期后' in clause_text or '等待期以后' in clause_text:
        result['waitingPeriodStatus'] = 'after'
    elif '等待期内' in clause_text:
        result['waitingPeriodStatus'] = 'during'
    
    # 提取年龄条件
    age_match = re.search(r'未满(\d+)周岁|已满(\d+)周岁|(\d+)周岁.*?前|(\d+)周岁.*?后', clause_text)
    if age_match:
        age = age_match.group(1) or age_match.group(2) or age_match.group(3) or age_match.group(4)
        age_type = '确诊时' if '确诊时' in clause_text else '投保时'
        operator = '<' if '未满' in clause_text or '前' in clause_text else '>='
        result['ageCondition'] = json.dumps({
            'limit': int(age),
            'operator': operator,
            'type': age_type
        }, ensure_ascii=False)
    
    # 提取保单年度范围
    year_match = re.search(r'第(\d+)个保单周年日.*?前|第(\d+)个保单周年日.*?后', clause_text)
    if year_match:
        year = year_match.group(1) or year_match.group(2)
        if '前' in clause_text:
            result['policyYearRange'] = json.dumps({
                'start': 1,
                'end': int(year) - 1
            }, ensure_ascii=False)
    
    # 提取赔付公式
    if '基本保额' in clause_text or '基本保险金额' in clause_text:
        percent_match = re.search(r'基本保[额险金额].*?(\d+)%', clause_text)
        if percent_match:
            percent = percent_match.group(1)
            result['formula'] = f'投保金额×{percent}%'
        else:
            result['formula'] = '投保金额'
    
    # 生成自然语言描述（简化版）
    if '轻症' in coverage_name:
        if '30%' in clause_text:
            result['naturalLanguageDescription'] = '等待期后确诊轻症，按投保金额×30%给付'
        elif '20%' in clause_text:
            result['naturalLanguageDescription'] = '等待期后确诊轻症，按投保金额×20%给付'
    elif '中症' in coverage_name:
        if '60%' in clause_text:
            result['naturalLanguageDescription'] = '等待期后确诊中症，按投保金额×60%给付'
        elif '50%' in clause_text:
            result['naturalLanguageDescription'] = '等待期后确诊中症，按投保金额×50%给付'
    elif '重大疾病' in coverage_name or '重度疾病' in coverage_name:
        result['naturalLanguageDescription'] = '等待期后确诊重疾，按投保金额给付'
    
    result['period'] = result['naturalLanguageDescription']
    
    return result

# 读取MD文件
with open('原文条款-批次1.md', 'r', encoding='utf-8') as f:
    md_content = f.read()

# 提取31-40条
records = []
lines = md_content.split('\n')
for line in lines:
    line = line.strip()
    if not line or line.startswith('#') or line == '```':
        continue
    if '|||' not in line:
        continue
    
    parts = line.split('|||')
    if len(parts) < 5:
        continue
    
    num = parts[0].strip()
    try:
        num_int = int(num)
        if 31 <= num_int <= 40:
            records.append({
                'serialNumber': num_int,
                'policyDocumentId': parts[1].strip(),
                'coverageType': parts[2].strip(),
                'coverageName': parts[3].strip(),
                'clauseText': parts[4].strip()
            })
    except:
        continue

# 解析并生成CSV行
csv_rows = []
for record in sorted(records, key=lambda x: x['serialNumber']):
    parsed = parse_coverage(record['clauseText'], record['coverageName'])
    
    row = [
        str(record['serialNumber']),
        escape_csv_field(record['policyDocumentId']),
        escape_csv_field(record['coverageType']),
        escape_csv_field(record['coverageName']),
        escape_csv_field(record['clauseText']),
        escape_csv_field(parsed['naturalLanguageDescription']),
        '1',  # 阶段序号
        escape_csv_field(parsed['period']),
        escape_csv_field(parsed['waitingPeriodStatus']),
        escape_csv_field(parsed['paymentPeriodStatus']),
        escape_csv_field(parsed['paymentMode']),
        escape_csv_field(parsed['ageCondition']),
        escape_csv_field(parsed['policyYearRange']),
        escape_csv_field(parsed['coveragePeriodConditions']),
        escape_csv_field(parsed['formula']),
        escape_csv_field(parsed['formulaVariables']),
        escape_csv_field(parsed['remarks']),
        '',  # 保险公司名称(待补充)
        '',  # 保单名称(待补充)
        ''   # 保险类型(待补充)
    ]
    csv_rows.append(','.join(row))

# 追加到CSV文件
with open('责任解析结果-批次1.csv', 'a', encoding='utf-8') as f:
    for row in csv_rows:
        f.write(row + '\n')

print(f"✅ 已解析并追加 {len(csv_rows)} 条记录到CSV文件")
























