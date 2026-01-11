import { useState, useRef, useEffect } from 'react'

// 保险公司数据
const INSURANCE_COMPANIES = [
  { id: '1', name: '中国人寿保险（集团）公司' },
  { id: '2', name: '中国平安保险（集团）股份有限公司' },
  { id: '3', name: '中国人民保险集团股份有限公司（PICC）', englishName: 'PICC' },
  { id: '4', name: '中国太平洋保险（集团）股份有限公司（CPIC）', englishName: 'CPIC' },
  { id: '5', name: '新华人寿保险股份有限公司' },
  { id: '6', name: '泰康保险集团股份有限公司' },
  { id: '7', name: '友邦保险（AIA）', englishName: 'AIA' },
  { id: '8', name: '中国太平保险集团有限责任公司' },
  { id: '9', name: '阳光保险集团股份有限公司' },
  { id: '10', name: '中华联合保险集团股份有限公司' }
]

interface InsuranceCompanySelectorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export default function InsuranceCompanySelector({ 
  value, 
  onChange, 
  placeholder = '请选择或输入保险公司名称（支持模糊查询）' 
}: InsuranceCompanySelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [filteredCompanies, setFilteredCompanies] = useState(INSURANCE_COMPANIES)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 搜索保险公司
  const searchCompanies = (keyword: string) => {
    if (!keyword.trim()) {
      setFilteredCompanies(INSURANCE_COMPANIES)
      return
    }

    const lowerKeyword = keyword.toLowerCase().trim()
    const filtered = INSURANCE_COMPANIES.filter(company => {
      const nameMatch = company.name.toLowerCase().includes(lowerKeyword)
      const englishMatch = company.englishName && company.englishName.toLowerCase().includes(lowerKeyword)
      return nameMatch || englishMatch
    })
    setFilteredCompanies(filtered)
  }

  // 处理输入
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value
    onChange(inputValue)
    searchCompanies(inputValue)
    setIsOpen(true)
  }

  // 处理焦点
  const handleFocus = () => {
    searchCompanies(value)
    setIsOpen(true)
  }

  // 选择公司
  const handleSelect = (companyName: string) => {
    onChange(companyName)
    setIsOpen(false)
    inputRef.current?.blur()
  }

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        className="html-input"
        placeholder={placeholder}
        value={value}
        onChange={handleInput}
        onFocus={handleFocus}
        autoComplete="off"
      />
      
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: 'white',
          border: '2px solid #01BCD6',
          borderRadius: '8px',
          maxHeight: '300px',
          overflowY: 'auto',
          zIndex: 1000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          marginTop: '4px'
        }}>
          {filteredCompanies.length === 0 ? (
            <div style={{ padding: '12px', color: '#999', textAlign: 'center' }}>
              未找到匹配的保险公司
            </div>
          ) : (
            filteredCompanies.map(company => (
              <div
                key={company.id}
                onClick={() => handleSelect(company.name)}
                style={{
                  padding: '10px 12px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                  borderBottom: '1px solid #f0f0f0'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f0f9ff'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white'
                }}
              >
                {company.name}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
































