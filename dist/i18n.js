// i18n 多语言配置文件
// 支持简体中文和英文，可扩展更多语言
// 用法：window.i18n.t(key)
window.i18n = (function(){
  const locales = {
    en: {
      title: 'Free URL Shortener with Custom Links & Analytics | 35 Shortlink',
      home: 'Home',
      brand: '35 Shortlink',
      heroBadge: 'Free · No sign-up · Ready to share',
      heroTitle: 'Free URL shortener,',
      heroAccent: 'ready in one click',
      slogan: 'Shorten long URLs with custom aliases, expiration dates, and accurate visit analytics.',
      apiDoc: 'API Doc',
      longUrlLabel: 'Original Long URL',
      longUrlPlaceholder: 'Paste the https:// link to shorten',
      longUrlTip: 'The URL you want to shorten.',
      customCodeLabel: 'Custom Short Code (Optional)',
      customCodePlaceholder: 'e.g., mylink (6-12 chars)',
      customCodeTip: 'Letters and numbers only. Leave empty to auto-generate.',
      expireDaysLabel: 'Expiration (Days)',
      expireDaysTip: 'Default 30 days, max 365 days.',
      generateBtn: 'Generate',
      resultSuccess: 'Shortlink generated successfully!',
      resultCopy: 'Copy',
      resultCopied: 'Copied!',
      resultExpire: 'Expires in: ',
      resultExpireDays: '{days} days',
      resultExpire365: 'approx. 1 year',
      resultExpireExpired: 'Expired',
      resultForever: 'Never expires',
      resultExpireDate: 'Expiry Date: {date}',
      errorLongUrl: 'Please enter a valid long URL.',
      errorCustomCode: 'Custom code must be 6-12 alphanumeric characters.',
      errorExpire: 'Expiration days must be between 1 and 365.',
      errorFailed: 'Failed to generate shortlink. Please try again.',
      errorNetwork: 'Network error. Please check your connection.',
      friendLinks: 'Friend Links:',
      featureTitle: 'More than a shorter URL',
      featureIntro: 'From creation and redirects to analytics, 35 Shortlink keeps the essentials in one lightweight, fast tool.',
      featureFastTitle: 'Fast redirects',
      featureFastDesc: 'A lean redirect path keeps your short links opening quickly across regions and devices.',
      featureCustomTitle: 'Recognizable links',
      featureCustomDesc: 'Choose a 6-12 character alias and expiration date for campaigns, communities, and resources.',
      featureStatsTitle: 'Accurate analytics',
      featureStatsDesc: 'Atomic visit counting prevents lost numbers under concurrency and keeps daily trends.',
      stepsEyebrow: 'How it works',
      stepsTitle: 'Create a short link in three steps',
      stepsIntro: 'No learning curve: paste, generate, share.',
      step1Title: 'Paste the long URL',
      step1Desc: 'Copy the address you want to share into the generator above.',
      step2Title: 'Generate the short link',
      step2Desc: 'Use a custom alias or let the system pick one for you.',
      step3Title: 'Share and track',
      step3Desc: 'Send it anywhere and watch visits accumulate in real time.',
      faqEyebrow: 'FAQ',
      faqTitle: 'Frequently asked questions',
      faqCustomQuestion: 'Can I choose a custom short code?',
      faqCustomAnswer: 'Yes. Codes support 6-12 letters and numbers, with format, sensitive-word, and duplicate checks.',
      faqExpireQuestion: 'Can short links expire?',
      faqExpireAnswer: 'Yes. Choose 1-365 days. Expired links stop redirecting and old records are cleaned by a scheduled task.',
      faqStatsQuestion: 'Are visit analytics accurate?',
      faqStatsAnswer: 'Visits are recorded with atomic increments, so simultaneous access never overwrites counts, and daily trends are retained.',
      // doc.html specific
      apiDocTitle: 'URL Shortener API Documentation | 35 Shortlink',
      docKicker: 'Developer API',
      docTitle: '35 Shortlink API Documentation',
      docIntro: 'Create short links with custom aliases and expiration through one straightforward HTTP endpoint.',
      apiCreateTitle: 'Generate Shortlink API',
      apiCreateDesc: 'Convert a long URL to a shortlink, with support for custom short codes.',
      apiTableParam: 'Parameter',
      apiTableDesc: 'Description',
      apiTableRequired: 'Required',
      apiLongUrl: 'The original long URL to be shortened.',
      apiCustomCode: 'Custom short code (6-12 alphanumeric characters, unique, no sensitive words).',
      apiExpireDays: 'Validity period (days), default 30 days, max 365 days.',
      apiRespTitle: 'Response Example',
      apiRespDesc: 'status=1 indicates success, shortUrl is the generated shortlink, expire is the expiration timestamp (optional).',
      apiQueryCode: 'The short code to query.',
      copyBtnText: 'Copy',
      copyTipSuccess: 'Copied!',
      copyTipError: 'Copy Failed',
      themeToggleTitle: 'Toggle Dark/Light Mode',
      yes: 'Yes',
      no: 'No',
      apiTablePath: 'API Path',
      apiRequestParamsTitle: 'Request Parameters',
      apiTableMethod: 'Request Method',
      apiRequestExampleTitle: 'Request Example',
      apiErrorTitle: 'Error Codes',
      apiErrorDesc: 'Description of the error code, explaining the cause of the error.',
      apiTableType: 'Type'
    },
    zh: {
      title: '免费短链接生成器 - 自定义短链与访问统计 | 35短链',
      home: '首页',
      brand: '35短链接',
      heroBadge: '免费 · 无需注册 · 打开即用',
      heroTitle: '免费短链接，',
      heroAccent: '一键生成与分享',
      slogan: '快速缩短长网址，支持自定义短码、有效期与精确访问统计。',
      apiDoc: 'API文档',
      longUrlLabel: '原始长链接',
      longUrlPlaceholder: '请输入需要缩短的 https:// 链接',
      longUrlTip: '您希望缩短的网址。',
      customCodeLabel: '自定义短码 (可选)',
      customCodePlaceholder: '例如 mylink (6-12位)',
      customCodeTip: '仅限字母和数字；留空将自动生成。',
      expireDaysLabel: '有效期 (天)',
      expireDaysTip: '默认30天，最大365天。',
      generateBtn: '生成短链',
      resultSuccess: '短链接生成成功！',
      resultCopy: '复制',
      resultCopied: '已复制！',
      resultExpire: '有效期剩余：',
      resultExpireDays: '{days} 天',
      resultExpire365: '约1年',
      resultExpireExpired: '已过期',
      resultForever: '永久有效',
      resultExpireDate: '到期时间：{date}',
      errorLongUrl: '请输入有效的长链接。',
      errorCustomCode: '自定义短码必须是6-12位字母数字。',
      errorExpire: '有效期天数必须在1到365之间。',
      errorFailed: '生成短链接失败，请重试。',
      errorNetwork: '网络错误，请检查您的连接。',
      friendLinks: '友情链接：',
      featureTitle: '不只是把网址变短',
      featureIntro: '从生成、跳转到统计，35短链把常用能力放进一个轻量、快速的链接工具中。',
      featureFastTitle: '极速跳转',
      featureFastDesc: '精简跳转链路，让短链接在不同地区、不同设备上都能快速打开。',
      featureCustomTitle: '链接更易识别',
      featureCustomDesc: '可自定义 6 至 12 位短码并设置有效期，适合活动、社群和资料分享。',
      featureStatsTitle: '精确访问统计',
      featureStatsDesc: '原子计数避免并发丢失访问量，并保留每日访问趋势。',
      stepsEyebrow: '使用流程',
      stepsTitle: '三步生成短链接',
      stepsIntro: '没有学习成本：粘贴、生成、分享。',
      step1Title: '粘贴长链接',
      step1Desc: '把要分享的网址复制到上方输入框。',
      step2Title: '生成短链接',
      step2Desc: '使用自定义短码，或由系统自动生成。',
      step3Title: '分享与追踪',
      step3Desc: '发到任意渠道，访问量实时累计。',
      faqEyebrow: '常见问题',
      faqTitle: '关于短链接的常见问题',
      faqCustomQuestion: '可以自定义短码吗？',
      faqCustomAnswer: '可以。短码支持 6 至 12 位字母和数字，系统会检查格式、敏感词与重复情况。',
      faqExpireQuestion: '短链接可以设置有效期吗？',
      faqExpireAnswer: '可以设置 1 至 365 天。到期后链接停止跳转，并由定时任务清理长期过期数据。',
      faqStatsQuestion: '访问统计准确吗？',
      faqStatsAnswer: '访问量采用原子计数记录，多人同时访问也不会丢失数据，并保留每日访问趋势。',
      // doc.html specific
      apiDocTitle: '短链接 API 文档 - 接口参数与调用示例 | 35短链',
      docKicker: '开发者接口',
      docTitle: '35短链 API 文档',
      docIntro: '通过一个简单的 HTTP 接口生成支持自定义短码和有效期的短链接。',
      apiCreateTitle: '生成短链接 API',
      apiCreateDesc: '用于将长链接转换为短链接，支持自定义短链。',
      apiTableParam: '参数名',
      apiTableDesc: '说明',
      apiTableRequired: '必填',
      apiLongUrl: '需要生成短链的原始长链接。',
      apiCustomCode: '自定义短链（6-12位字母数字，不能重复、不能包含敏感词）。',
      apiExpireDays: '有效期（天），默认30天，最大365天。',
      apiRespTitle: '返回示例',
      apiRespDesc: 'status=1 表示成功，shortUrl为生成的短链，expire为到期时间戳（可选）。',
      apiQueryCode: '需要查询的短码。',
      copyBtnText: '复制',
      copyTipSuccess: '已复制!',
      copyTipError: '复制失败',
      themeToggleTitle: '切换日夜模式',
      yes: '是',
      no: '否',
      apiTablePath: '接口路径',
      apiRequestParamsTitle: '请求参数',
      apiTableMethod: '请求方法',
      apiRequestExampleTitle: '请求示例',
      apiErrorTitle: '错误代码',
      apiErrorDesc: '错误代码的描述，解释错误发生的原因。',
      apiTableType: '类型'
    }
  };

  let currentLang = localStorage.getItem('lang') || (navigator.language.startsWith('zh') ? 'zh' : 'en');

  function getLang() {
    return currentLang;
  }

  function setLang(lang) {
    if (locales[lang]) {
      currentLang = lang;
      localStorage.setItem('lang', lang);
    }
  }

  function t(key, replacements) {
    let translation = (locales[currentLang] && locales[currentLang][key]) || (locales.zh && locales.zh[key]) || key;
    if (replacements) {
      for (const placeholder in replacements) {
        translation = translation.replace(new RegExp('{' + placeholder + '}', 'g'), replacements[placeholder]);
      }
    }
    return translation;
  }

  function getAllLangs() {
    return Object.keys(locales);
  }

  return { t, setLang, getLang, getAllLangs, locales };
})();
