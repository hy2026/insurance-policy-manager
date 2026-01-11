import { Form, InputNumber, Select } from 'antd'

const currentYear = new Date().getFullYear()

export default function PolicyInfoForm() {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Form.Item label="出生年份" name="birthYear">
          <InputNumber
            placeholder="1990"
            min={1900}
            max={currentYear}
            style={{ width: '100%' }}
          />
        </Form.Item>

        <Form.Item label="投保年份" name="policyStartYear">
          <InputNumber
            placeholder={currentYear.toString()}
            min={1900}
            max={currentYear + 10}
            style={{ width: '100%' }}
          />
        </Form.Item>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Form.Item label="保障至" name="coverageEndYear">
          <Select>
            <Select.Option value="lifetime">终身</Select.Option>
            {Array.from({ length: 31 }, (_, i) => {
              const year = currentYear + i
              return <Select.Option key={year} value={year}>{year}年</Select.Option>
            })}
          </Select>
        </Form.Item>

        <Form.Item label="基本保额(万)" name="basicSumInsured">
          <InputNumber
            placeholder="50"
            min={0}
            step={10}
            style={{ width: '100%' }}
          />
        </Form.Item>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Form.Item label="年交保费(元)" name="annualPremium">
          <InputNumber
            placeholder="5000"
            min={0}
            style={{ width: '100%' }}
          />
        </Form.Item>

        <Form.Item label="缴费期(年)" name="totalPaymentPeriod">
          <Select placeholder="选择缴费期">
            <Select.Option value="1">趸交</Select.Option>
            <Select.Option value="5">5年</Select.Option>
            <Select.Option value="10">10年</Select.Option>
            <Select.Option value="15">15年</Select.Option>
            <Select.Option value="20">20年</Select.Option>
            <Select.Option value="30">30年</Select.Option>
          </Select>
        </Form.Item>
      </div>
    </>
  )
}
































