#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
修复CSV文件中案例3的自然语言描述
"""

import csv
import sys

csv_file = '../责任解析结果-批次1.csv'

# 读取CSV文件
rows = []
with open(csv_file, 'r', encoding='utf-8') as f:
    reader = csv.reader(f)
    for row in reader:
        rows.append(row)

print(f'读取到 {len(rows)} 行')

# 修复案例3（第4行，索引3，因为第1行是表头）
if len(rows) > 3:
    print(f'修复前，案例3第6列（自然语言描述）: {rows[3][5] if len(rows[3]) > 5 else "N/A"}')
    print(f'修复前，案例3第6列长度: {len(rows[3][5]) if len(rows[3]) > 5 else 0} 字符')
    
    # 确保有足够的列
    while len(rows[3]) < 20:
        rows[3].append('')
    
    # 更新第6列（索引5）为简化版本
    rows[3][5] = '等待期后确诊，按投保金额×比例给付'
    
    print(f'修复后，案例3第6列（自然语言描述）: {rows[3][5]}')
    print(f'修复后，案例3第6列长度: {len(rows[3][5])} 字符')
else:
    print('❌ 找不到案例3')
    sys.exit(1)

# 写回CSV文件
with open(csv_file, 'w', encoding='utf-8', newline='') as f:
    writer = csv.writer(f)
    writer.writerows(rows)

print(f'✅ CSV文件已修复并保存')























