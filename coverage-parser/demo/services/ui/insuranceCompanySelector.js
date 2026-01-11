// ==================== 保险公司选择器服务（职责：仅负责保险公司下拉选择和模糊查询的UI交互）====================
class InsuranceCompanySelectorService {
  /**
   * 初始化保险公司选择器
   * @param {string} inputId - 输入框ID
   * @param {string} dropdownId - 下拉列表容器ID
   */
  static init(inputId, dropdownId) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    
    if (!input || !dropdown) {
      console.error('保险公司选择器元素不存在');
      return;
    }

    let selectedCompany = null;
    let isDropdownOpen = false;

    // 输入框获得焦点时显示下拉列表
    input.addEventListener('focus', () => {
      this.showDropdown(input, dropdown);
      isDropdownOpen = true;
    });

    // 输入框输入时进行模糊搜索
    input.addEventListener('input', (e) => {
      const keyword = e.target.value.trim();
      this.filterAndShowOptions(input, dropdown, keyword);
      isDropdownOpen = true;
    });

    // 点击外部时关闭下拉列表
    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) {
        this.hideDropdown(dropdown);
        isDropdownOpen = false;
        
        // 如果输入框有值但没有选中公司，尝试匹配
        if (input.value.trim() && !selectedCompany) {
          const matched = InsuranceCompanyDataService.getCompanyByName(input.value.trim());
          if (matched) {
            selectedCompany = matched;
            input.value = matched.name;
          }
        }
      }
    });

    // 输入框失去焦点时，如果值不匹配任何公司，清空或保持原值
    input.addEventListener('blur', () => {
      setTimeout(() => {
        if (!isDropdownOpen && input.value.trim()) {
          const matched = InsuranceCompanyDataService.getCompanyByName(input.value.trim());
          if (!matched) {
            // 可以保持用户输入的值，或者清空
            // 这里选择保持用户输入的值，允许自由输入
          }
        }
      }, 200);
    });
  }

  /**
   * 显示下拉列表
   */
  static showDropdown(input, dropdown) {
    const keyword = input.value.trim();
    this.filterAndShowOptions(input, dropdown, keyword);
    dropdown.style.display = 'block';
  }

  /**
   * 隐藏下拉列表
   */
  static hideDropdown(dropdown) {
    dropdown.style.display = 'none';
  }

  /**
   * 过滤并显示选项
   */
  static filterAndShowOptions(input, dropdown, keyword) {
    const companies = InsuranceCompanyDataService.searchCompanies(keyword);
    
    dropdown.innerHTML = '';
    
    if (companies.length === 0) {
      dropdown.innerHTML = '<div style="padding: 12px; color: #999; text-align: center;">未找到匹配的保险公司</div>';
      return;
    }

    companies.forEach(company => {
      const option = document.createElement('div');
      option.className = 'insurance-company-option';
      option.style.cssText = 'padding: 10px 12px; cursor: pointer; transition: background-color 0.2s; border-bottom: 1px solid #f0f0f0;';
      option.textContent = company.name;
      
      option.addEventListener('mouseenter', () => {
        option.style.backgroundColor = '#f0f9ff';
      });
      
      option.addEventListener('mouseleave', () => {
        option.style.backgroundColor = 'white';
      });
      
      option.addEventListener('click', () => {
        input.value = company.name;
        input.setAttribute('data-company-id', company.id);
        this.hideDropdown(dropdown);
        // 触发change事件，通知其他组件
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      
      dropdown.appendChild(option);
    });
  }

  /**
   * 设置选中的保险公司
   * @param {string} inputId - 输入框ID
   * @param {string} companyName - 保险公司名称
   */
  static setSelectedCompany(inputId, companyName) {
    const input = document.getElementById(inputId);
    if (input && companyName) {
      const company = InsuranceCompanyDataService.getCompanyByName(companyName);
      if (company) {
        input.value = company.name;
        input.setAttribute('data-company-id', company.id);
      } else {
        // 如果不在列表中，也允许用户自由输入的值
        input.value = companyName;
        input.removeAttribute('data-company-id');
      }
    }
  }

  /**
   * 获取选中的保险公司
   * @param {string} inputId - 输入框ID
   * @returns {Object|null} 保险公司对象
   */
  static getSelectedCompany(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return null;
    
    const companyId = input.getAttribute('data-company-id');
    if (companyId) {
      return InsuranceCompanyDataService.getCompanyById(companyId);
    }
    
    const companyName = input.value.trim();
    if (companyName) {
      return InsuranceCompanyDataService.getCompanyByName(companyName);
    }
    
    return null;
  }
}

