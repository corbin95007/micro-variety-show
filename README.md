# Micro Variety Show

## 当前进度

- 已支持邮箱验证码登录、注册邮箱确认提示、忘记密码和邮件回跳重置密码。
- 已登录修改密码会要求当前密码重新认证，并要求确认新密码。
- 测试草稿已支持本地保存和云端自动同步。
- 用户每次答题会后台上传草稿，进入测试时优先恢复云端草稿，网络失败时回退本地草稿。
- 提交成功后会清理本地和云端草稿。

## 上线注意

- Supabase 必须启用 Email provider，并在 Site URL / Redirect URLs 配置 `/auth/callback`，同时确认注册确认、Magic Link、Reset Password 邮件模板可正常回跳。
- 重置密码使用 Supabase PKCE callback，找回密码邮件链接需要在发起找回请求的同一浏览器打开。
- Supabase 详细配置见 `DEPLOYMENT.md`。
- 需要先在 Supabase 执行 `supabase/migrations/007_test_drafts.sql`，创建 `test_drafts` 表。
- 本次相关接口为 `/api/test/draft`，支持 `GET`、`PUT`、`DELETE`。

## 当前验证

- `npm test`：5 files / 51 tests passed。
- `frontend` 的 `npm run build`：passed。
