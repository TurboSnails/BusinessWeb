# 部署说明

## 获取中国指数数据

由于新浪财经 API 的 CORS 限制，需要后端代理服务才能获取中国指数数据。

### 开发环境

开发环境已配置 Vite 代理，直接运行 `npm run dev` 即可使用。

### 生产环境部署

#### 方案1：部署到 Vercel（推荐）

1. 将代码推送到 GitHub
2. 访问 [Vercel](https://vercel.com)
3. 导入 GitHub 仓库
4. Vercel 会自动检测并部署，包括 `api/china-stock.js` serverless 函数
5. 部署完成后，中国指数数据即可正常显示

#### 方案2：部署到 Netlify

1. 创建 `netlify/functions/china-stock.js`（参考 `api/china-stock.js`）
2. 在 Netlify 中部署项目
3. 配置函数路由

#### 方案3：GitHub Pages + 单独代理服务

如果使用 GitHub Pages，需要单独部署一个代理服务：

1. 创建一个简单的 Node.js 代理服务（可部署到 Vercel、Railway、Render 等）
2. 更新 `src/services/api.ts` 中的生产环境 URL
3. 确保代理服务设置了正确的 CORS 头

### 当前配置

- **开发环境**：使用 Vite proxy (`/api/proxy`)
- **生产环境**：使用相对路径 (`/api/china-stock`)，需要部署到支持 serverless 函数的平台

### 测试代理

部署后，可以访问以下 URL 测试代理是否工作：
- `https://your-domain.vercel.app/api/china-stock?symbol=sh000001`

应该返回新浪财经的原始数据。

