// ==================== 保险公司数据服务（职责：仅负责提供保险公司列表数据）====================
class InsuranceCompanyDataService {
  /**
   * 获取所有保险公司列表
   * @returns {Array<{id: string, name: string, englishName?: string}>} 保险公司列表
   */
  static getAllCompanies() {
    return [
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
    ];
  }

  /**
   * 根据关键词搜索保险公司（支持中文和英文名称模糊匹配）
   * @param {string} keyword - 搜索关键词
   * @returns {Array} 匹配的保险公司列表
   */
  static searchCompanies(keyword) {
    if (!keyword || keyword.trim() === '') {
      return this.getAllCompanies();
    }

    const lowerKeyword = keyword.toLowerCase().trim();
    return this.getAllCompanies().filter(company => {
      const nameMatch = company.name.toLowerCase().includes(lowerKeyword);
      const englishMatch = company.englishName && company.englishName.toLowerCase().includes(lowerKeyword);
      return nameMatch || englishMatch;
    });
  }

  /**
   * 根据ID获取保险公司
   * @param {string} id - 保险公司ID
   * @returns {Object|null} 保险公司对象
   */
  static getCompanyById(id) {
    return this.getAllCompanies().find(company => company.id === id) || null;
  }

  /**
   * 根据名称获取保险公司
   * @param {string} name - 保险公司名称
   * @returns {Object|null} 保险公司对象
   */
  static getCompanyByName(name) {
    return this.getAllCompanies().find(company => company.name === name) || null;
  }
}


