/* eslint-disable no-underscore-dangle */
import * as R from 'ramda';
import { Promise } from 'bluebird';
import { INDEX_STIX_DOMAIN_OBJECTS } from '../database/utils';
import { ENTITY_TYPE_ATTACK_PATTERN, ENTITY_TYPE_COURSE_OF_ACTION } from '../schema/stixDomainObject';
import { BULK_TIMEOUT, elBulk, elList, ES_MAX_CONCURRENCY, MAX_SPLIT } from '../database/elasticSearch';
import { generateStandardId } from '../schema/identifier';
import { logger } from '../config/conf';

export const up = async (next) => {
  const start = new Date().getTime();
  logger.info(`[MIGRATION] Rewriting standard ids for Attack pattern and Course of action`);
  const bulkOperations = [];
  const callback = (attacks) => {
    const op = attacks
      .map((att) => {
        const newId = generateStandardId(att.entity_type, att);
        return [{ update: { _index: att._index, _id: att.id } }, { doc: { standard_id: newId } }];
      })
      .flat();
    bulkOperations.push(...op);
  };
  const opts = { types: [ENTITY_TYPE_ATTACK_PATTERN, ENTITY_TYPE_COURSE_OF_ACTION], callback };
  await elList(INDEX_STIX_DOMAIN_OBJECTS, opts);
  // Apply operations.
  let currentProcessing = 0;
  const groupsOfOperations = R.splitEvery(MAX_SPLIT, bulkOperations);
  const concurrentUpdate = async (bulk) => {
    await elBulk({ refresh: true, timeout: BULK_TIMEOUT, body: bulk });
    currentProcessing += bulk.length;
    logger.info(`[OPENCTI] Rewriting standard ids: ${currentProcessing} / ${bulkOperations.length}`);
  };
  await Promise.map(groupsOfOperations, concurrentUpdate, { concurrency: ES_MAX_CONCURRENCY });
  logger.info(`[MIGRATION] Rewriting standard ids done in ${new Date() - start} ms`);
  next();
};

export const down = async (next) => {
  next();
};
