import json

files = [
    '解析结果-批次1-序号1-200.json',
    '解析结果-批次2-序号201-400.json',
    '解析结果-批次3-序号401-600.json',
    '解析结果-批次4-序号601-800.json',
    '解析结果-批次5-序号801-1000.json',
    '解析结果-批次6-序号1001-1200.json',
    '解析结果-批次7-序号1201-1400.json',
    '解析结果-批次8-序号1401-1600.json',
    '解析结果-批次9-序号1601-1800.json',
    '解析结果-批次10-序号1801-2000.json',
    '解析结果-批次11-序号2001-2200.json',
    '解析结果-批次12-序号2201-2400.json',
    '解析结果-批次13-序号2401-2600.json',
    '解析结果-批次14-序号2601-2800.json',
    '解析结果-批次15-序号2801-3000.json',
]

missing = {
    'waitingPeriodStatus': set(),
    'naturalLanguageDescription': set(),
}

for file in files:
    try:
        with open(file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        if 'cases' in data:
            for case in data['cases']:
                case_num = case.get('序号')
                
                if 'payoutAmount' in case:
                    for stage in case['payoutAmount']:
                        if 'waitingPeriodStatus' not in stage:
                            missing['waitingPeriodStatus'].add(case_num)
                        
                        if 'naturalLanguageDescription' not in stage:
                            missing['naturalLanguageDescription'].add(case_num)
    
    except Exception as e:
        print(f"Error: {e}")

print("缺少必填字段的案例:")
print("=" * 60)
for field, cases in missing.items():
    cases_list = sorted(cases)
    print(f"\n缺少{field}: {len(cases_list)}个案例")
    if len(cases_list) <= 30:
        print(f"  案例: {cases_list}")
    else:
        print(f"  前30个: {cases_list[:30]}")

EOF
python3 check_required_fields.py
