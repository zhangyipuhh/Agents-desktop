/**
 * 共享类型：通用基础 schema
 *
 * 提供跨进程复用的小型 Zod schema（uuid / 时间戳 / 非空字符串等）。
 * 所有需要校验入参的 IPC handler、Service 构造函数都应优先复用这些 schema。
 *
 * 文档参考：原 `feature-agent-core` 项目中散落在各处的 Pydantic 校验，
 * 这里统一收敛到 Zod，便于渲染层和主进程共享。
 */

import { z } from 'zod';

/**
 * 非空字符串 schema
 *
 * 用于 ID、name、channel 等不允许为空的字段。
 * 接受任何 `length >= 1` 的字符串。
 */
export const NonEmptyStringSchema = z.string().min(1);

/**
 * 时间戳 schema
 *
 * 接受：
 * - 正整数（Unix 毫秒或秒，按调用方约定）
 * - ISO 8601 字符串
 */
export const TimestampSchema = z.union([z.number().int().positive(), z.string().datetime()]);

/**
 * UUID v4 schema
 *
 * 接受任何符合 RFC 4122 的 UUID（不限版本，兼容原 Python 端 uuid.uuid4()）。
 */
export const UuidSchema = z.string().uuid();
