import { ReservedPlanId } from '@logto/schemas';
import { type Nullable } from '@silverhand/essentials';

/**
 * We may have more than one pro planId in the future.
 * E.g grandfathered {@link ReservedPlanId.Pro}, {@link ReservedPlanId.Pro202411} and new {@link ReservedPlanId.Pro202509}.
 * User this function to check if the planId can be considered as a pro plan.
 */
export const isProPlan = (planId: string) =>
  [ReservedPlanId.Pro, ReservedPlanId.Pro202411, ReservedPlanId.Pro202509].includes(
    // eslint-disable-next-line no-restricted-syntax
    planId as ReservedPlanId
  );

export const isPaidPlan = (planId: string, isEnterprisePlan: boolean) =>
  isProPlan(planId) || isEnterprisePlan;

export const isFeatureEnabled = (quota: Nullable<number>): boolean => {
  return quota === null || quota > 0;
};
