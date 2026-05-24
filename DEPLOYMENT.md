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
3. 复制 `supabase/migrations/001_init.sql` 的全部内容
4. 粘贴到编辑器
5. 点击 "Run" 执行
6. 确认右下角显示 "Success. No rows returned"

### 2.3 配置认证与邮件回跳
1. Authentication → Providers → Email：启用 Email provider。
2. Authentication → URL Configuration：
   - Site URL：生产站点域名，例如 `https://your-app.vercel.app`
   - Redirect URLs：加入生产与本地回调，例如：
     - `https://your-app.vercel.app/auth/callback`
     - `http://localhost:5173/auth/callback`
3. Authentication → Email Templates：确认注册确认、Magic Link、Reset Password 模板里的确认链接使用 Supabase 默认确认地址，最终会带 `code` 回跳到 `/auth/callback`。
4. 当前前端使用 Supabase PKCE：找回密码邮件必须在发起请求的同一浏览器中打开，否则缺少 code verifier 和本地找回密码待确认状态，跨设备或邮件 App 内置浏览器可能验证失败。通过验证后会跳转到 `/reset-password` 设置新密码。
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
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...你的service_role密钥
EPISODE_ONE_AIRED=false
```

### 3.2 前端环境变量
编辑 `micro-variety-show/frontend/.env`：
```bash
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...你的anon密钥
VITE_API_BASE_URL=/api
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
   - `SUPABASE_SERVICE_ROLE_KEY` = `你的service_role密钥`
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
4. 登录成功

### 7.2 检查数据库
1. 回到Supabase → Table Editor
2. 查看 `profiles` 表，应该能看到新注册的用户
3. 检查 `invite_code` 字段是否自动生成

---

## 常见问题

### Q: 前端无法连接后端API
A: 检查 `frontend/.env` 中的 `VITE_API_BASE_URL` 是否正确

### Q: 注册后提示"未登录"
A: 检查Supabase认证是否正确配置，确认 `anon` 密钥正确

### Q: 数据库连接失败
A: 检查 `service_role` 密钥是否正确，确认SQL迁移已执行

### Q: Vercel部署后API 500错误
A: 检查Vercel环境变量是否正确配置

---

## 下一步

完成以上步骤后，你可以：
1. 导入题库数据（从Excel解析并插入到 `tests` 表）
2. 实现前端页面组件
3. 测试完整的答题流程
