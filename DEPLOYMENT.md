# 部署步骤指南

## 步骤1: 上传到GitHub

### 1.1 初始化Git仓库
```bash
cd "D:\qzm的文档\企划\微综艺\micro-variety-show"
git init
git add .
git commit -m "Initial commit: micro variety show project"
```

### 1.2 创建GitHub仓库
1. 访问 https://github.com/new
2. 仓库名: `micro-variety-show`
3. 设置为 Private（如果不想公开）
4. 不要勾选 "Initialize with README"（因为本地已有代码）
5. 点击 "Create repository"

### 1.3 推送到GitHub
```bash
# 替换 YOUR_USERNAME 为你的GitHub用户名
git remote add origin https://github.com/YOUR_USERNAME/micro-variety-show.git
git branch -M main
git push -u origin main
```

---

## 步骤2: 配置Supabase

### 2.1 创建Supabase项目
1. 访问 https://supabase.com
2. 点击 "New Project"
3. 填写信息：
   - Name: `micro-variety-show`
   - Database Password: 设置一个强密码（记住它）
   - Region: 选择离你最近的区域（如 Northeast Asia (Tokyo)）
4. 点击 "Create new project"，等待约2分钟

### 2.2 执行数据库迁移
1. 进入项目 → 左侧菜单 "SQL Editor"
2. 点击 "New query"
3. 按文件名顺序执行 `supabase/migrations/` 中尚未执行过的迁移，不要只执行 `001_init.sql`
4. 粘贴每个迁移文件内容到编辑器
5. 点击 "Run" 执行；当前认证找回密码还需要 `008_auth_handoff_consumptions.sql`，测试草稿需要 `007_test_drafts.sql`
6. 确认右下角显示 "Success. No rows returned"

### 2.3 配置认证与邮件回跳
1. Authentication → Providers → Email：启用 Email provider。
2. Authentication → URL Configuration：
   - Site URL：生产站点域名，例如 `https://your-app.vercel.app`
   - Redirect URLs：可保留生产域和本地开发域用于 Dashboard 兼容校验，例如 `https://your-app.vercel.app/**`、`http://localhost:5173/**`。实际邮件模板固定走生产 API callback，不依赖前端 PKCE 回跳。
3. Authentication → Email Templates：手动改以下模板链接，不要继续使用默认 `{{ .ConfirmationURL }}`：
   - Confirm signup：
     ```html
     <a href="https://your-app.vercel.app/api/auth/callback?token_hash={{ .TokenHash }}&type=signup">确认邮箱</a>
     ```
   - Reset password：
     ```html
     <a href="https://your-app.vercel.app/api/auth/callback?token_hash={{ .TokenHash }}&type=recovery">重置密码</a>
     ```
     必须使用 `{{ .TokenHash }}` 加服务端 `/api/auth/callback`。不要使用默认 `{{ .ConfirmationURL }}`、不要链接到前端 `/auth/callback`，否则服务端拿不到可验证的 `token_hash`，用户会回到登录页并看到 `verification_failed`。
   - Magic Link：当前登录 UI 不提供 Magic Link 登录；如以后启用，才使用：
     ```html
     <a href="https://your-app.vercel.app/api/auth/callback?token_hash={{ .TokenHash }}&type=magiclink">登录</a>
     ```
   - 登录邮箱验证码模板必须显示 Supabase 8 位数字验证码：
     ```html
     你的登录验证码是：{{ .Token }}
     ```
4. 邮件 callback 由服务端使用 anon/auth client 执行 `verifyOtp({ token_hash, type })`。成功后重定向到 `/auth/session`，access/refresh token 只放在 URL fragment，前端立即 `setSession` 并清理地址。找回密码会额外携带服务端签名 grant，前端必须 POST `/api/auth/recovery/consume` 并由服务端核对 bearer、用户、签名、过期时间和一次性 nonce 后才进入重置页。
5. 不要为方便测试关闭邮箱验证；注册确认、OTP 和找回密码都依赖真实邮件链路。

### 2.4 获取API密钥
1. 左侧菜单 → Settings → API
2. 复制以下三个值：
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public**: `eyJhbGc...`（很长的字符串）
   - **service_role**: `eyJhbGc...`（另一个很长的字符串，点击"Reveal"显示）

---

## 步骤3: 配置环境变量

### 3.1 后端环境变量
编辑 `micro-variety-show/.env`：
```bash
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...你的anon密钥
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...你的service_role密钥
APP_BASE_URL=https://your-app.vercel.app
AUTH_HANDOFF_SECRET=生成一个长随机密钥
EPISODE_ONE_AIRED=false
```

### 3.2 前端环境变量
编辑 `micro-variety-show/frontend/.env`：
```bash
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...你的anon密钥
```

---

## 步骤4: 安装依赖

### 4.1 安装根目录依赖（测试用）
```bash
cd "D:\qzm的文档\企划\微综艺\micro-variety-show"
npm install
```

### 4.2 安装前端依赖
```bash
cd frontend
npm install
```

---

## 步骤5: 本地测试

### 5.1 运行单元测试（可选）
```bash
cd "D:\qzm的文档\企划\微综艺\micro-variety-show"
npm test
```

### 5.2 一键启动本地开发环境
```bash
cd "D:\qzm的文档\企划\微综艺\micro-variety-show"
npm run dev:local
```
访问 http://localhost:5173，API 会同时运行在 http://localhost:3000。

### 5.3 后端API依赖（需要Vercel CLI）
```bash
# 安装Vercel CLI（如果还没安装）
npm install -g vercel
```
正常本地开发使用 `npm run dev:local`，脚本会复用 `npm run dev:api` 的本地 API 启动和清代理逻辑。

---

## 步骤6: 部署到Vercel

### 6.1 部署项目
```bash
cd "D:\qzm的文档\企划\微综艺\micro-variety-show"
vercel
```
按提示操作：
- Link to existing project? → No
- Project name? → micro-variety-show
- In which directory is your code located? → ./
- Want to override the settings? → No

### 6.2 配置Vercel环境变量
1. 访问 https://vercel.com/dashboard
2. 进入你的项目 → Settings → Environment Variables
3. 添加以下变量（所有环境都选：Production, Preview, Development）：
   - `SUPABASE_URL` = `https://xxxxx.supabase.co`
   - `SUPABASE_ANON_KEY` = `你的anon密钥`
   - `SUPABASE_SERVICE_ROLE_KEY` = `你的service_role密钥`
   - `VITE_SUPABASE_URL` = `https://xxxxx.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `你的anon密钥`
   - `APP_BASE_URL` = `https://your-app.vercel.app`（生产必须是 HTTPS；只有本地开发允许 `http://localhost` 或 `http://127.0.0.1`）
   - `AUTH_HANDOFF_SECRET` = `生成一个长随机密钥`
   - `EPISODE_ONE_AIRED` = `false`

### 6.3 重新部署
```bash
vercel --prod
```

---

## 步骤7: 验证功能

### 7.1 测试注册登录
1. 访问你的Vercel部署URL
2. 进入登录页面
3. 注册新账号（邮箱+密码+昵称）
4. 打开注册确认邮件，确认链接域名为 `https://your-app.vercel.app/api/auth/callback?...type=signup`
5. 回到站点后应已登录；如果带邀请码注册，确认用户中心的邀请码绑定状态
6. 在登录页切到“邮箱验证码”，收到的邮件应展示 `{{ .Token }}` 生成的 Supabase 8 位数字验证码，而不是确认链接

### 7.2 测试找回密码
1. 退出登录，进入“忘记密码”
2. 提交邮箱并打开 Reset password 邮件，确认链接域名为 `https://your-app.vercel.app/api/auth/callback?...type=recovery`
3. 跳转到 `/reset-password` 后设置新密码
4. 使用新密码重新登录
5. 直接用普通登录态访问 `/reset-password` 应显示链接无效并要求重新发送邮件

### 7.3 检查数据库
1. 回到Supabase → Table Editor
2. 查看 `profiles` 表，应该能看到新注册的用户
3. 检查 `invite_code` 字段是否自动生成

---

## 常见问题

### Q: 前端无法连接后端API
A: 前端通过同域 `/api` 调用 Vercel API，不需要配置 `VITE_API_BASE_URL`；检查部署域名、Vercel API 函数和 Supabase 环境变量是否正确

### Q: 注册后提示"未登录"
A: 检查Supabase认证是否正确配置，确认 `anon` 密钥正确

### Q: 数据库连接失败
A: 检查 `service_role` 密钥是否正确，确认SQL迁移已执行

### Q: Vercel部署后API 500错误
A: 检查Vercel环境变量是否正确配置

### Q: 重置密码邮件点击后回到登录页并提示验证失败
A: 对用户统一显示 `verification_failed`，敏感细节不会放进 URL。到 Vercel Function Logs 搜索 `Auth callback verification failed:`，检查 `type`、`hasTokenHash`、`supabaseUrlHost`、`reason`、`errorName`、`errorMessage`、`errorStatus`、`errorCode`。日志不会打印 `token_hash`、`access_token`、`refresh_token`、`recovery_grant` 或完整 query。优先确认 Reset password 模板是 `https://your-app.vercel.app/api/auth/callback?token_hash={{ .TokenHash }}&type=recovery`，且 `SUPABASE_URL` 指向同一个 Supabase 项目。

---

## 下一步

上线前必须完成：
1. 按顺序执行尚未应用的数据库迁移，至少确认 `007_test_drafts.sql` 和 `008_auth_handoff_consumptions.sql` 已生效
2. 在 Supabase 配好 Email Templates、Vercel 环境变量和 `APP_BASE_URL`
3. 用真实邮箱验收注册确认、邮箱验证码登录和找回密码链路
