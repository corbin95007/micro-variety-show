export const SITE = {
  name: '微综艺',
  subtitle: '一档关于观点与立场的实验',
}

export const HOME = {
  testEntryTitle: '维度测试',
  testEntryDesc: '探索你的女性主义光谱坐标',
  voteEntryTitle: '投票入口',
  voteEntryDesc: '即将开放',
}

export const TEST_HUB = {
  pageTitle: '测试',
  testName: '女性主义维度测试',
  testDesc: '四个维度，定位你在女性主义光谱上的坐标',
  testMeta: ['约 5 分钟', '免费参与'],
  testCta: '开始测试',
  resultListEntry: '查看测试结果列表',
  badge: 'NEW',
  rulesLabel: '规则说明',
  rulesText: '本测试免费参与，但为了支持团队筹措节目和网站经费，测试结果需要条件解锁。',
  rulesHighlight: '第一期播出后自动解锁。',
  rulesMethodsIntro: '提前解锁方式：',
  rulesMethod1: '通过底部「分享链接」邀请 3 位好友注册',
  rulesMethod2: '在「用户中心」购买解锁',
}

export const QUIZ = {
  pageTitle: '女性主义维度测试',
  submitBtn: '确认提交',
  options: [
    { label: '极度不赞同', value: 1 },
    { label: '不赞同', value: 2 },
    { label: '中立', value: 3 },
    { label: '赞同', value: 4 },
    { label: '极度赞同', value: 5 },
  ],
}

export const RESULT = {
  pageTitle: '维度测试结果',
  spectrumLabel: '四维光谱',
  tagsLabel: '特殊标签',
  portraitLabel: '你的画像',
  portraitPlaceholder: '画像分析内容将在后续版本中上线。',
  lockedTitle: '结果尚未解锁',
  lockedDesc: '分享邀请链接或在用户中心购买解锁',
  unlockBtn: '去解锁',
  dimensions: [
    { left: '本土', right: '国际', key: 'dim_local_international' },
    { left: '女本位', right: '男本位', key: 'dim_female_male' },
    { left: '平等主义', right: '优绩主义', key: 'dim_equal_merit' },
    { left: '加速主义', right: '改良主义', key: 'dim_accel_reform' },
  ],
}

export const RESULT_LIST = {
  pageTitle: '测试结果列表',
  empty: '暂无测试记录',
  goTest: '去测试',
  unlocked: '已解锁',
  locked: '未解锁',
}

export const LOGIN = {
  loginTitle: '欢迎回来',
  loginSubtitle: '登录以查看你的测试结果',
  registerTitle: '加入我们',
  registerSubtitle: '注册账号，开始你的维度测试',
  nicknameLabel: '昵称',
  nicknamePlaceholder: '你的昵称',
  emailLabel: '邮箱',
  emailPlaceholder: 'your@email.com',
  passwordLabel: '密码',
  passwordPlaceholder: '至少 6 位',
  inviteLabel: '邀请码',
  invitePlaceholder: '好友的邀请码',
  inviteOptional: '选填',
  loginBtn: '登录',
  registerBtn: '注册',
  toRegister: '没有账号？去注册',
  toLogin: '已有账号？去登录',
}

export const USER = {
  referralSectionTitle: '邀请解锁',
  inviteCodeLabel: '我的邀请码',
  referralCountLabel: '已邀请人数',
  copyLinkBtn: '复制邀请链接',
  paymentSectionTitle: '付费解锁',
  paymentTitle: '购买解锁',
  paymentDesc: '一次购买，永久解锁所有测试结果',
  paymentPrice: '¥9.9',
  paymentBtn: '立即购买',
  logoutBtn: '退出登录',
}

export const UNLOCK_DIALOG = {
  unlockedTitle: '测试完成',
  unlockedDesc: '您的结果已解锁，现在查看？',
  viewResultBtn: '查看结果',
  goHomeBtn: '返回主页',
  lockedTitle: '结果尚未解锁',
  lockedDesc: '您可以通过以下方式提前解锁：',
  method1: '分享邀请链接给 3 位好友注册',
  method2: '在用户中心购买解锁',
  unlockBtn: '去解锁',
  laterBtn: '稍后再说',
}

export const NAV = {
  share: '分享链接',
  user: '用户中心',
}

export const TOAST = {
  linkCopied: '链接已复制',
  copyFailed: '复制失败，请手动复制',
  inviteLinkCopied: '邀请链接已复制',
  pleaseLogin: '请先登录',
  notLoggedIn: '您还未登录，登录后才能生成专属邀请链接',
  paymentComingSoon: '付费功能即将上线',
  loading: '加载中',
}
