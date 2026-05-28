# Micro Variety Show

## 当前进度

- 已支持邮箱验证码登录、注册邮箱确认、忘记密码和服务端 TokenHash 邮件回跳重置密码。
- 邮件链接统一进入 `/api/auth/callback`，服务端验证后通过 `/auth/session#access_token=...` 建立现有 Supabase 浏览器 session；找回密码还必须经服务端签名 grant 和 `/api/auth/recovery/consume` 一次性消费后才允许进入重置页。
- 忘记密码页已补齐发送后、重新发送、换邮箱和错误状态；重置页已补齐链接失效、重置成功和返回登录状态。
- 已登录修改密码改为向当前邮箱发送 Supabase 重置密码邮件。
- 用户设置页已补齐修改密码邮件的发送中、成功和失败行内状态。
- 测试草稿已支持本地保存和云端自动同步。
- 用户每次答题会后台上传草稿，进入测试时优先恢复云端草稿，网络失败时回退本地草稿。
- 提交成功后会清理本地和云端草稿。

## 上线注意

- Supabase 必须启用 Email provider，并手动修改 Dashboard 邮件模板：
  - Confirm signup：`https://你的生产域名/api/auth/callback?token_hash={{ .TokenHash }}&type=signup`
  - Reset password：`https://你的生产域名/api/auth/callback?token_hash={{ .TokenHash }}&type=recovery`
  - 登录验证码模板使用 `{{ .Token }}`，当前为 Supabase 8 位验证码；当前登录 UI 不提供 Magic Link 登录。
- `APP_BASE_URL` 必须配置为固定生产前端域名，生产只允许 `https://`；本地开发仅允许 `http://localhost` 或 `http://127.0.0.1`。
- `AUTH_HANDOFF_SECRET` 为必填长随机密钥，用于签名找回密码 handoff，前端不能持有。
- Site URL 保持生产站点域名；Redirect URLs 可保留生产域和本地开发域用于兼容 Supabase Dashboard 校验，但实际邮件模板固定走 `/api/auth/callback`。
- 如果登录页出现 `verification_failed`，不要把完整邮件链接或 token 贴进日志。检查服务端日志 `Auth callback verification failed:`，它只记录 `type`、是否带 `token_hash`、Supabase host、错误 name/message/status/code 的脱敏摘要。
- Supabase 详细配置见 `DEPLOYMENT.md`。
- 需要按尚未执行的顺序应用 `supabase/migrations/`：至少包含 `007_test_drafts.sql` 和 `008_auth_handoff_consumptions.sql`。
- 本次相关接口为 `/api/test/draft`，支持 `GET`、`PUT`、`DELETE`。

## 当前验证

- `npm test -- tests/auth-recovery.test.js`：24 passed。
- `npm test`：5 files / 62 tests passed。
- `frontend` 的 `npm run build`：passed。
