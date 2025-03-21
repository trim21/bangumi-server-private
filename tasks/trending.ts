import { logger } from '@app/lib/logger';
import { SubjectTypeValues } from '@app/lib/subject/type.ts';
import { updateTrendingSubjects } from '@app/lib/trending/subject.ts';
import { updateTrendingSubjectTopics } from '@app/lib/trending/topic.ts';
import { TrendingPeriod } from '@app/lib/trending/type.ts';

export async function trendingSubjects() {
  logger.info('Updating trending subjects...');
  for (const subjectType of SubjectTypeValues) {
    logger.info(`Updating trending subjects for ${subjectType}...`);
    await updateTrendingSubjects(subjectType, TrendingPeriod.Month);
  }
}

export async function trendingSubjectTopics() {
  logger.info('Updating trending subject topics...');
  await updateTrendingSubjectTopics(TrendingPeriod.Week);
}
