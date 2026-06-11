export const SITE = {
  name: 'Grandwitch',
  subtitle: '一次增进人与人之间了解的测试',
}

export const HOME = {
  testEntryTitle: '维度测试',
  testEntryDesc: '探索你的女性主义光谱坐标',
  voteEntryTitle: '投票入口',
  voteEntryDesc: '即将开放',
  xiaohongshuOfficial: '小红书官号',
  douyinOfficial: '抖音官号',
}

export const OFFICIAL_LINKS = {
  xiaohongshu: import.meta.env.VITE_XIAOHONGSHU_OFFICIAL_URL || '',
  douyin: import.meta.env.VITE_DOUYIN_OFFICIAL_URL || '',
}

export const TEST_HUB = {
  pageTitle: '测试',
  testName: '女性主义维度测试',
  testDesc: '四个维度，定位你在女性主义光谱上的坐标',
  testMeta: ['约 5-10 分钟', '免费参与'],
  testCta: '开始测试',
  resultListEntry: '查看测试结果列表',
  resetTestBtn: '重置测试',
  badge: 'NEW',
  rulesLabel: '规则说明',
  rulesText: '本测试免费参与，但为了支持团队筹措节目和网站经费，测试结果需要条件解锁。',
  rulesHighlight: '第一期播出后自动解锁。',
  rulesMethodsIntro: '提前解锁方式：',
  rulesMethod1: '通过用户中心的邀请链接邀请 3 位好友注册',
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
  creatorNoteTitle: '出题组的话',
  creatorNoteBody: '这里是出题组预留给用户的话。后续可以在 frontend/src/constants.js 的 RESULT.creatorNoteBody 中替换为正式文案。',
  lockedTitle: '结果尚未解锁',
  lockedDesc: '在用户中心分享邀请链接，或直接购买解锁',
  unlockBtn: '去解锁',
  dimensions: [
    { left: '本土', right: '国际', key: 'dim_local_international' },
    { left: '女本位', right: '男本位', key: 'dim_female_male' },
    { left: '平等主义', right: '优绩主义', key: 'dim_equal_merit' },
    { left: '加速主义', right: '改良主义', key: 'dim_accel_reform' },
  ],
}

export const RESULT_TAG_MEANINGS = {
  '马派女权': '更强调结构分析、劳动视角和集体政治。',
  '辱男词推广大使': '更倾向用强烈的对抗性表达处理性别议题。',
  '平权主义': '更看重形式平等、规则对齐和权益均衡。',
  '女同女权': '更强调女性之间的情感、关系与主体经验。',
  '国际激进女权主义': '更容易借助国际激进女权框架理解问题。',
  '绝望的直女': '对性别关系的失望感更强，表达上更偏向防御。',
  '社会达尔文主义': '更认可竞争、筛选和结果差异的逻辑。',
  '反宗教': '对宗教权威或宗教性解释保持明显距离。',
  '实干主义派': '更重视落地、执行和可操作路径。',
  '后现代女权主义': '更关注话语、身份和结构性建构。',
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
  friendInviteLabel: '填写好友邀请码',
  friendInvitePlaceholder: '输入好友的邀请码',
  friendInviteSubmitBtn: '提交邀请码',
  friendInviteSubmitting: '提交中...',
  friendInviteHelper: '每个账号只能填写一次，提交后不可修改。',
  friendInviteBoundLabel: '已填写好友邀请码',
  friendInviteBoundDesc: '这个账号已经绑定好友邀请关系，不能再次修改。',
  friendInviterPrefix: '邀请人',
  paymentSectionTitle: '付费解锁',
  paymentTitle: '购买解锁',
  paymentDesc: '一次购买，永久解锁所有测试结果',
  paymentPrice: '¥9.9',
  paymentBtn: '立即购买',
  feedbackBtn: '问题反馈',
  feedbackDialogTitle: '问题反馈',
  feedbackPlaceholder: '请描述你遇到的问题，越具体越方便我们排查',
  feedbackSubmitting: '提交中...',
  feedbackSubmitBtn: '提交反馈',
  feedbackExamples: [
    '邀请码、邀请人数或好友绑定状态显示异常',
    '登录、注册、支付或页面跳转时遇到问题',
  ],
  logoutBtn: '退出登录',
}

export const UNLOCK_DIALOG = {
  unlockedTitle: '测试完成',
  unlockedDesc: '您的结果已解锁，现在查看？',
  viewResultBtn: '查看结果',
  goHomeBtn: '返回主页',
  lockedTitle: '结果尚未解锁',
  lockedDesc: '您可以通过以下方式提前解锁：',
  method1: '在用户中心复制邀请链接，邀请 3 位好友注册',
  method2: '在用户中心购买解锁',
  unlockBtn: '去解锁',
  laterBtn: '稍后再说',
}

export const NAV = {
  home: '主页',
  user: '用户中心',
}

export const TOAST = {
  linkCopied: '链接已复制',
  copyFailed: '复制失败，请手动复制',
  inviteLinkCopied: '邀请链接已复制',
  friendInviteRequired: '请先填写好友邀请码',
  friendInviteSubmitted: '好友邀请码已提交',
  friendInviteSelf: '不能填写自己的邀请码',
  pleaseLogin: '请先登录',
  notLoggedIn: '请先登录后继续',
  officialLinkMissing: '官号链接尚未配置',
  feedbackRequired: '请先填写反馈内容',
  feedbackTooShort: '反馈内容至少需要 10 个字',
  feedbackTooLong: '反馈内容不能超过 1000 个字',
  feedbackSubmitted: '反馈已提交',
  paymentComingSoon: '付费功能即将上线',
  loading: '加载中',
}
