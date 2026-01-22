import { useState, useRef, useEffect } from 'react'

interface ProductIdSelectorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  options: string[] // 产品ID列表从外部传入
}

export default function ProductIdSelector({ 
  value, 
  onChange, 
  placeholder = '请选择或输入保险产品ID号',
  options = []
}: ProductIdSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [filteredIds, setFilteredIds] = useState<string[]>(options)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 当 options 更新时，同步更新 filteredIds
  useEffect(() => {
    setFilteredIds(options)
  }, [options])

  // 规范化ID（只保留中文+数字）
  const normalizeId = (id: string) => {
    if (!id) return ''
    return id.replace(/[^\u4e00-\u9fa5\d]/g, '')
  }

  // 搜索产品ID
  const searchProductIds = (keyword: string) => {
    if (!keyword.trim()) {
      setFilteredIds(options)
      return
    }

    const normalizedKeyword = normalizeId(keyword.toLowerCase())
    const filtered = options.filter(id => {
      const normalizedId = normalizeId(id.toLowerCase())
      return normalizedId.includes(normalizedKeyword) || 
             id.toLowerCase().includes(keyword.toLowerCase())
    })
    setFilteredIds(filtered)
  }

  // 处理输入
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value
    onChange(inputValue)
    searchProductIds(inputValue)
    setIsOpen(true)
  }

  // 处理焦点
  const handleFocus = () => {
    searchProductIds(value)
    setIsOpen(true)
  }

  // 选择产品ID
  const handleSelect = (id: string) => {
    onChange(id)
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
          {filteredIds.length === 0 ? (
            <div style={{ padding: '12px', color: '#999', textAlign: 'center' }}>
              {options.length === 0 ? '正在加载...' : '未找到匹配的保险产品ID号'}
            </div>
          ) : (
            filteredIds.slice(0, 100).map((id, index) => (
              <div
                key={index}
                onClick={() => handleSelect(id)}
                style={{
                  padding: '10px 12px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                  borderBottom: index < Math.min(filteredIds.length, 100) - 1 ? '1px solid #f0f0f0' : 'none'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f0f9ff'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white'
                }}
              >
                {id}
              </div>
            ))
          )}
          {filteredIds.length > 100 && (
            <div style={{ padding: '8px 12px', color: '#999', fontSize: '12px', textAlign: 'center' }}>
              还有 {filteredIds.length - 100} 条，请输入关键字筛选
            </div>
          )}
        </div>
      )}
    </div>
  )
}
