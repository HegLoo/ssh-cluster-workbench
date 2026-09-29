# SSH Cluster Workbench

面向 Windows 10/11 x64 的 SSH 集群工作台。应用把「账号预设」「远端文件管理」和后续的终端、可视化桌面集中在一个窗口里，目标目录中的配置与源码、Git 仓库完全隔离。

当前版本为 **v0.1.0（一期）**：登录与远端文件管理。终端、终端日志与可视化桌面属于二期。

## 一期功能

- **工作目录**：启动时选择本机工作目录，记录最近使用的目录。
- **账号预设**：下拉菜单按行展示预设，每行带设置与删除按钮，底部固定「新建预设」。
- **连接表单**：常用页签维护主机、端口、用户名、认证方式（密码 / 私钥）、远端起始目录；高级页签维护跳板机、超时、KeepAlive、压缩、IP 偏好、算法与受校验的附加参数。
- **凭据保护**：密码、私钥口令、跳板机密码通过 Electron `safeStorage` 加密后落盘，界面永不回显明文，私钥内容不进入配置文件。
- **主机指纹**：首次连接采用首次信任模式并弹出确认框；指纹与已保存记录不一致时直接阻断连接。
- **远端文件管理器**：面包屑与可编辑路径、前进 / 后退 / 上级 / 家目录 / 刷新、排序、隐藏文件切换、虚拟滚动。
- **文件操作**：新建文件夹、重命名、删除（二次确认）、上传、下载、资源管理器拖入上传、拖出下载。
- **传输队列**：进度、速度、取消、重试，冲突支持覆盖 / 跳过 / 重命名并可批量应用。
- **安全边界**：递归操作使用流式读写，不跟随远端符号链接；断线、权限错误与取消都会落为可恢复的任务状态。

## 安全模型

- 渲染进程通过 `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false` 运行，只能调用 preload 暴露的类型化 IPC。
- 主进程独占 SSH/SFTP 客户端与凭据读写，渲染进程拿不到私钥内容或明文口令。
- 每个工作目录下创建 `.ssh-cluster-workbench/`，保存版本化配置：

```
<工作目录>/.ssh-cluster-workbench/
├── workspace.json     # 账号预设（不含任何明文凭据）
├── known_hosts.json   # 已信任的主机指纹
└── secrets.json       # safeStorage 加密后的凭据
```

- 应用级设置（最近工作目录）保存在 Electron `userData`，与工作目录配置分离。
- `.ssh-cluster-workbench/` 已加入 `.gitignore`，不会随源码提交。

## 技术栈

Electron 44、React 19、TypeScript 5.9（严格模式）、Vite / electron-vite、pnpm、electron-builder、ssh2、Zustand、Radix UI、Tailwind CSS 4、TanStack Virtual、Vitest、Playwright。

## 开发环境

要求 Windows 10/11 x64、Node.js 22+、pnpm 10+。

```powershell
pnpm install
pnpm dev          # 启动开发版
pnpm typecheck    # 主进程 + 渲染进程类型检查
pnpm lint         # ESLint
pnpm test         # Vitest 单元与集成测试
pnpm test:e2e     # Playwright Electron 冒烟测试
pnpm build        # 编译到 out/
```

## 打包

```powershell
pnpm package:win    # NSIS 安装版 + 便携版，输出到 release/
pnpm package:dir    # 仅生成未打包目录，便于快速验证
```

产物：

```
release/SSH Cluster Workbench-0.1.0-x64-setup.exe
release/SSH Cluster Workbench-0.1.0-x64-portable.exe
```

## 目录结构

```
src/
├── main/          # 主进程：窗口、IPC、SSH/SFTP、传输与本地存储
│   ├── services/  # workspaceStore / secretStore / hostKeyStore / sshManager / sftpService / transferManager
│   └── lib/       # 路径、模式位、JSON 原子写入等工具
├── preload/       # contextBridge 暴露的 DesktopApi 实现
├── renderer/      # React 界面
│   └── src/components/
└── shared/        # 主进程与渲染进程共用的类型、默认值与 Zod 校验
tests/
├── unit/          # 配置迁移、路径处理、凭据保护、校验
├── integration/   # 基于本地模拟 SSH/SFTP 服务的目录与传输流程
└── e2e/           # Playwright 驱动的 Electron 冒烟测试
```

## 测试范围

- 单元测试：配置迁移、凭据保护、远端/本地路径处理、冲突策略与 IPC 校验。
- 集成测试：本地模拟 SSH/SFTP 服务，覆盖密码与私钥认证、目录操作、大文件、取消、覆盖与断线。
- E2E：工作目录选择、预设增删改查、连接状态、文件操作入口与分栏布局。

真实集群验收需要自备环境凭据，未提供凭据时不会执行，也不会影响自动化测试。

## 二期规划

- 终端（xterm.js）与终端日志下拉面板。
- 可视化桌面（VNC / noVNC）窗口，默认不显示，点击可视化按钮后出现。
- 左右可拖动分栏的右侧区域接入上述两个视图。

## 默认边界

仅支持 Windows 10/11 x64。一期不含终端、终端日志、VNC、双向同步、MFA、SSH Agent、代码签名与自动更新。同一时间只维护一个活动 SSH 客户端，传输使用有限并发队列。

## 许可证

MIT，见 [LICENSE](LICENSE)。
