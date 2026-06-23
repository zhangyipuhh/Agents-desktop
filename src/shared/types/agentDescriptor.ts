/**
 * 鍏变韩绫诲瀷锛欰gentDescriptor锛堝０鏄庡紡 Agent 鎻忚堪绗︼級
 *
 * **鏍稿績鍒涙柊锛坰pec 搂3.1锛?*锛? * Agent 涓嶅啀鏄?浠ｇ爜妯″潡"锛岃€屾槸澹版槑寮?descriptor
 * 锛坄{id, systemPrompt, tools[], model, stream}`锛夈€? * 鐢?`/command/{agentId}` 鍗曚竴鍏ュ彛 + 妗岄潰绔缃〉閰嶇疆銆? *
 * 鏈枃浠跺畾涔夛細
 * - AgentDescriptorSchema锛氬畬鏁?descriptor 鏍￠獙
 * - ToolRefSchema锛氬伐鍏峰紩鐢紙builtin / local / mcp锛? * - MiddlewareRefSchema锛氫腑闂翠欢寮曠敤
 * - RuntimeContextSchema锛氳繍琛屾椂涓婁笅鏂? * - CommandRequestSchema锛歚/command` 鍏ュ弬
 * - CommandChunkSchema锛氭祦寮忚緭鍑轰簨浠讹紙9 绉?type 鍒ゅ埆鑱斿悎锛? * - BUILTIN_AGENT_ID_PATTERN锛氬唴缃?Agent ID 鍛藉悕绾︽潫
 *
 * 璺ㄨ繘绋嬪叡浜細涓昏繘绋?SettingsService 搴忓垪鍖栥€両PC payload銆乸reload 杞彂銆? * 娓叉煋灞?store 鍏ㄩ儴璧拌繖涓€浠藉绾︺€? */
import { z } from 'zod';
import { ModelRefSchema, type ModelRef } from './llm';

/** 鍐呯疆 Agent ID 鍛藉悕绾︽潫锛氬皬鍐欏瓧姣?鏁板瓧 + kebab-case */
export const BUILTIN_AGENT_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * 宸ュ叿寮曠敤锛堝垽鍒仈鍚堬級
 *
 * - builtin锛歀angChain 鍐呯疆宸ュ叿锛堝 get_current_time锛? * - local锛氶」鐩唴鑷畾涔夊伐鍏凤紙濡?explore锛? * - mcp锛歁CP 鏈嶅姟宸ュ叿锛堥渶 serverName锛? */
export const ToolRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('builtin'), name: z.string().min(1, "must not be empty") }),
  z.object({ kind: z.literal('local'), name: z.string().min(1, "must not be empty") }),
  z.object({
    kind: z.literal('mcp'),
    name: z.string().min(1, "must not be empty"),
    serverName: z.string().min(1, "must not be empty"),
    configOverride: z.record(z.string(), z.unknown()).optional(),
  }),
]);
export type ToolRef = z.infer<typeof ToolRefSchema>;

/**
 * 涓棿浠跺紩鐢? *
 * Phase 1 浠呭０鏄庡绾︼紱鍏蜂綋涓棿浠跺疄鐜帮紙TodoListMiddleware /
 * ContextEditingMiddleware 绛夛級鍦?AgentEngine.buildGraph 闃舵瑁呴厤銆? */
export const MiddlewareRefSchema = z.object({
  kind: z.string().min(1, "must not be empty"),
  config: z.record(z.string(), z.unknown()).optional(),
});
export type MiddlewareRef = z.infer<typeof MiddlewareRefSchema>;

/**
 * AgentDescriptor锛堝０鏄庡紡 Agent 鎻忚堪绗︼級
 *
 * 瀛楁锛? * - id锛氬敮涓€ ID锛堝 'map', 'contract-host'锛夛紱蹇呴』鍖归厤 BUILTIN_AGENT_ID_PATTERN
 * - displayName锛氫腑鏂囧睍绀哄悕
 * - description锛氬湪 /command 鍒楄〃鏄剧ず鐨勬弿杩? * - systemPrompt锛氬繀濉郴缁熸彁绀鸿瘝
 * - tools锛氬伐鍏峰紩鐢ㄥ垪琛? * - model锛氭ā鍨嬪紩鐢紙閫氳繃 ModelRefSchema 澶嶇敤锛? * - stream锛氭槸鍚?SSE 娴佸紡
 * - middleware锛氬彲閫変腑闂翠欢鍒楄〃
 * - skills锛氬彲閫夊惎鐢ㄧ殑 skill 璺緞
 * - tags锛氬彲閫夎繃婊?鍒嗙粍鏍囩
 * - enabled锛氬紑鍏? * - builtin锛氭槸鍚﹀唴缃紙涓嶅彲鍒狅級
 * - configPath锛氱敤鎴疯嚜瀹氫箟 descriptor 鐨勬簮
 */
export const AgentDescriptorSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(BUILTIN_AGENT_ID_PATTERN, 'id 蹇呴』灏忓啓瀛楁瘝寮€澶?+ 鏁板瓧/kebab-case'),
  displayName: z.string().min(1, "must not be empty"),
  description: z.string(),
  systemPrompt: z.string().min(1, "must not be empty"),
  tools: z.array(ToolRefSchema),
  model: ModelRefSchema,
  stream: z.boolean(),
  middleware: z.array(MiddlewareRefSchema).optional(),
  skills: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  enabled: z.boolean(),
  builtin: z.boolean().optional(),
  configPath: z.string().optional(),
});
export type AgentDescriptor = z.infer<typeof AgentDescriptorSchema>;

/**
 * 杩愯鏃朵笂涓嬫枃锛圓gentEngine.run 鐨?ctx 鍙傛暟锛? *
 * - sessionId锛氫細璇?ID锛堟湰鍦?UUID v4锛? * - profileId锛氱敤鎴锋。妗?ID锛堥粯璁?'default'锛? * - abortSignal锛氬彲閫夌敤鎴峰仠姝俊鍙? * - metadata锛氬彲閫夐€忎紶瀛楁
 */
export const RuntimeContextSchema = z.object({
  sessionId: z.string().min(1, "must not be empty"),
  profileId: z.string().min(1, "must not be empty"),
  abortSignal: z.instanceof(AbortSignal).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type RuntimeContext = z.infer<typeof RuntimeContextSchema>;

/**
 * `/command/{agentId}` 鍏ュ弬
 *
 * - agentId锛氭潵鑷?URL
 * - input锛氱敤鎴疯緭鍏? * - sessionId锛氭湰鍦?session UUID
 * - attachments锛氬彲閫?file id 鍒楄〃
 * - configOverrides锛氬彲閫?partial descriptor锛堣繍琛屾椂瑕嗙洊锛? */
export const CommandRequestSchema = z.object({
  agentId: z.string().min(1, "must not be empty"),
  input: z.string(),
  sessionId: z.string().min(1, "must not be empty"),
  attachments: z.array(z.string()).optional(),
  configOverrides: z
    .object({
      systemPrompt: z.string().optional(),
      model: ModelRefSchema.partial().optional(),
      stream: z.boolean().optional(),
      temperature: z.number().optional(),
    })
    .partial()
    .optional(),
  abortSignal: z.instanceof(AbortSignal).optional(),
});
export type CommandRequest = z.infer<typeof CommandRequestSchema>;

/**
 * CommandChunk锛堟祦寮忚緭鍑轰簨浠讹紝9 绉?type 鍒ゅ埆鑱斿悎锛? *
 * - queue锛欶IFO 闃熷垪绛夊緟/灏辩华浜嬩欢
 * - thinking锛氭ā鍨嬫帹鐞嗗唴瀹? * - text锛氭ā鍨嬫枃鏈緭鍑? * - tool锛氬伐鍏疯皟鐢?start/progress/stop
 * - subagent锛氬瓙鏅鸿兘浣撲簨浠? * - timeline锛氭椂闂寸嚎鏉＄洰
 * - interrupt锛欻ITL 涓柇璇锋眰
 * - error锛氶敊璇? * - done锛氱粨鏉燂紙甯?usage锛? */
export const CommandChunkSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('queue'),
    event: z.enum(['waiting', 'ready']),
    waitingCount: z.number().int().nonnegative(),
    activeCount: z.number().int().nonnegative(),
    maxConcurrency: z.number().int().positive(),
    position: z.number().int().nonnegative(),
    timestamp: z.number(),
  }),
  z.object({ type: z.literal('thinking'), content: z.string() }),
  z.object({ type: z.literal('text'), content: z.string() }),
  z.object({
    type: z.literal('tool'),
    event: z.enum(['start', 'progress', 'stop']),
    tool: z.string(),
    toolCallId: z.string(),
    data: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('subagent'),
    name: z.string(),
    event: z.enum(['start', 'chunk', 'stop']),
    data: z.unknown().optional(),
  }),
  z.object({ type: z.literal('timeline'), event: z.string(), data: z.unknown().optional() }),
  z.object({
    type: z.literal('interrupt'),
    tool: z.string(),
    toolCallId: z.string(),
    payload: z.unknown(),
  }),
  z.object({ type: z.literal('error'), message: z.string(), code: z.string().optional() }),
  z.object({
    type: z.literal('done'),
    usage: z
      .object({
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
      })
      .optional(),
  }),
]);
export type CommandChunk = z.infer<typeof CommandChunkSchema>;

/**
 * 杩愯鏃跺悎骞?helper锛氭妸 configOverrides 瑕嗙洊鍒?base descriptor
 *
 * @param base 鍩虹 descriptor
 * @param overrides 杩愯鏃惰鐩? * @returns 鍚堝苟鍚庣殑 descriptor锛堟柊寤哄璞★級
 */
export function applyConfigOverrides(
  base: AgentDescriptor,
  overrides: NonNullable<CommandRequest['configOverrides']>,
): AgentDescriptor {
  const out: AgentDescriptor = { ...base };
  if (overrides.systemPrompt !== undefined) out.systemPrompt = overrides.systemPrompt;
  if (overrides.stream !== undefined) out.stream = overrides.stream;
  if (overrides.temperature !== undefined) {
    out.model = { ...base.model, temperature: overrides.temperature };
  }
  if (overrides.model) {
    const m = overrides.model as Partial<ModelRef>;
    out.model = { ...base.model, ...m };
  }
  return out;
}
