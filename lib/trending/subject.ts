import { db, op } from '@app/drizzle/db.ts';
import * as schema from '@app/drizzle/schema';
import { logger } from '@app/lib/logger';
import redis from '@app/lib/redis.ts';
import { SubjectType } from '@app/lib/subject/type.ts';
import type { TrendingItem } from '@app/lib/trending/type.ts';
import { getTrendingPeriodDuration, TrendingPeriod } from '@app/lib/trending/type.ts';

function getSubjectTrendingKey(type: SubjectType, period: TrendingPeriod) {
  return `trending:subjects:${type}:${period}`;
}

export async function updateTrendingSubjects(
  subjectType: SubjectType,
  period = TrendingPeriod.Month,
  flush = false,
) {
  const trendingKey = getSubjectTrendingKey(subjectType, period);
  const lockKey = `lock:${trendingKey}`;
  if (flush) {
    await redis.del(lockKey);
  }
  if (await redis.get(lockKey)) {
    logger.info('Already calculating trending subjects for %s(%s)...', subjectType, period);
    return;
  }
  await redis.set(lockKey, 1, 'EX', 3600);
  logger.info('Calculating trending subjects for %s(%s)...', subjectType, period);

  const now = Date.now();
  const duration = getTrendingPeriodDuration(period);
  if (!duration) {
    logger.error('Invalid period: %s', period);
    return;
  }
  const minDateline = now - duration;
  let doingDateline = true;
  if (subjectType === SubjectType.Book || subjectType === SubjectType.Music) {
    doingDateline = false;
  }

  const data = await db
    .select({ subjectID: schema.chiiSubjects.id, total: op.count(schema.chiiSubjects.id) })
    .from(schema.chiiSubjectInterests)
    .innerJoin(
      schema.chiiSubjects,
      op.eq(schema.chiiSubjects.id, schema.chiiSubjectInterests.subjectID),
    )
    .where(
      op.and(
        op.eq(schema.chiiSubjects.typeID, subjectType),
        op.ne(schema.chiiSubjects.ban, 1),
        op.eq(schema.chiiSubjects.nsfw, false),
        doingDateline
          ? op.gt(schema.chiiSubjectInterests.doingDateline, minDateline)
          : op.gt(schema.chiiSubjectInterests.updatedAt, minDateline),
      ),
    )
    .groupBy(schema.chiiSubjects.id)
    .orderBy(op.desc(op.count(schema.chiiSubjects.id)))
    .limit(1000)
    .execute();

  const ids = [];
  for (const item of data) {
    ids.push({ id: item.subjectID, total: item.total } as TrendingItem);
  }
  await redis.set(trendingKey, JSON.stringify(ids));
  await redis.del(lockKey);
}

export async function getTrendingSubjects(
  subjectType: SubjectType,
  period = TrendingPeriod.Month,
  limit = 20,
  offset = 0,
): Promise<TrendingItem[]> {
  const trendingKey = getSubjectTrendingKey(subjectType, period);
  const data = await redis.get(trendingKey);
  if (!data) {
    return [];
  }
  const ids = JSON.parse(data) as TrendingItem[];
  return ids.slice(offset, offset + limit);
}