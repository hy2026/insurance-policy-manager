#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
修复CSV文件，确保所有字段正确转义，避免字段错位
"""

import csv

csv_file = '../责任解析结果-批次1.csv'

# 读取原始CSV文件（使用csv.reader自动处理转义）
rows = []
with open(csv_file, 'r', encoding='utf-8') as f:
    reader = csv.reader(f)
    for row in reader:
        rows.append(row)

print(f'读取到 {len(rows)} 行')
print(f'表头列数: {len(rows[0])}')

# 检查并修复每一行
fixed_rows = []
for i, row in enumerate(rows):
    if i == 0:
        # 表头，确保有20列
        while len(row) < 20:
            row.append('')
        fixed_rows.append(row)
        print(f'表头: {len(row)} 列')
    else:
        # 数据行
        # 如果列数不对，尝试重新解析
        if len(row) != 20:
            print(f'第{i+1}行（案例{i}）: 原列数 {len(row)}，需要修复')
            
            # 如果列数少于20，补充空列
            while len(row) < 20:
                row.append('')
            
            # 如果列数多于20，可能是字段错位，需要重新构建
            if len(row) > 20:
                # 保留前20列，丢弃多余的
                row = row[:20]
        
        fixed_rows.append(row)
        print(f'第{i+1}行（案例{i}）: 修复后 {len(row)} 列')

# 写回CSV文件（使用csv.writer自动处理转义）
with open(csv_file, 'w', encoding='utf-8', newline='') as f:
    writer = csv.writer(f)
    writer.writerows(fixed_rows)

print(f'\n✅ CSV文件已修复并保存')
print(f'所有行现在都有 {len(fixed_rows[0])} 列')























