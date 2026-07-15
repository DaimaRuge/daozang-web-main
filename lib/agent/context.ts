/**
 * Agent 上下文模型（Web as Agent 架构的数据契约）。
 *
 * 为什么先定义上下文而不是先接大模型：
 * 「网站即 Agent」的核心不是聊天框，而是让 Agent 随时知道
 * 「用户是谁、正在读什么、读到哪一段、选中了什么」。
 * 这些信息由前端各组件（阅读器、搜索、书房）分别持有，
 * 必须先约定统一的 AgentContext 结构，未来任何 Agent（问答、推荐、
 * 笔记整理）以及任何模型供应商都消费同一份上下文，避免各功能私自拼参数。
 *
 * 本文件是纯类型定义，前后端共用。
 */

/** 用户上下文：当前无登录体系，仅有本地匿名数据；字段为未来账号体系预留 */
export interface UserContext {
  userId?: string;
  /** 是否登录用户（匿名用户与登录用户的数据处理策略不同） */
  isAuthenticated: boolean;
  /** 用户偏好（阅读主题、是否允许主动提示等） */
  preferences?: Record<string, unknown>;
}

/** 会话上下文：一次浏览会话的标识与起始时间 */
export interface SessionContext {
  sessionId: string;
  startedAt: number;
}

/** 页面上下文：Agent 需要知道用户此刻在站内什么位置 */
export interface PageContext {
  /** 路由路径，如 /text/abc123 */
  path: string;
  /** 页面类型，便于 Agent 选择服务策略 */
  pageType: 'home' | 'catalog' | 'search' | 'reader' | 'library' | 'about' | 'other';
}

/** 阅读上下文：阅读器实时维护，是「划词解释 / 推荐相关典籍」的关键输入 */
export interface ReadingContext {
  bookId: string;
  bookTitle?: string;
  volumeId?: string;
  chapterId?: string;
  sectionId?: string;
  /** 当前视口内最近的内容块 ID */
  blockId?: string;
  /** 阅读进度 0~1 */
  scrollProgress?: number;
  /** 用户当前选中的文字 */
  selectedText?: string;
  /** 最近阅读过的块 ID 序列（用于理解上下文语境） */
  recentBlocks?: string[];
}

/** 选中文本上下文：划词场景下比 ReadingContext.selectedText 更完整 */
export interface SelectedTextContext {
  text: string;
  blockId?: string;
  bookId?: string;
}

/** 对话上下文：AI 问答的历史消息（供应商无关的通用消息格式） */
export interface ConversationContext {
  messages: AgentMessage[];
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** AI 回答必须携带引用来源，与原文严格区分 */
  citations?: Citation[];
}

/** 引用来源：AI 输出的每条论断都应尽可能回溯到具体典籍位置 */
export interface Citation {
  bookId: string;
  bookTitle: string;
  blockId?: string;
  /** 所引原文片段 */
  quote?: string;
}

/** 权限上下文：工具调用前的权限检查依据 */
export interface PermissionContext {
  /** 是否允许读取用户本地数据（笔记、收藏） */
  canReadUserData: boolean;
  /** 是否允许写入（创建笔记、收藏） */
  canWriteUserData: boolean;
  /** 是否允许调用外部模型服务 */
  canUseAI: boolean;
}

/** 统一 Agent 上下文：所有 Agent 请求的标准载荷 */
export interface AgentContext {
  user?: UserContext;
  session: SessionContext;
  page: PageContext;
  reading?: ReadingContext;
  selectedText?: SelectedTextContext;
  conversation?: ConversationContext;
  permissions: PermissionContext;
}

/** 构造一份默认（最小权限）上下文，调用方按需覆盖 */
export function createDefaultContext(page: PageContext): AgentContext {
  return {
    session: {
      sessionId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      startedAt: Date.now(),
    },
    page,
    permissions: {
      canReadUserData: false,
      canWriteUserData: false,
      canUseAI: false,
    },
  };
}
