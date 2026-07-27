'use strict';

function validateSnapshot(nextSnapshot, previousSnapshot, failedStores = []) {
  if (failedStores.length) {
    throw new Error(`Refresh aborted; failed stores: ${failedStores.join(', ')}`);
  }

  const nextDealCount = Number(nextSnapshot?.dealCount || 0);
  const previousDealCount = Number(previousSnapshot?.dealCount || 0);
  const minimumDealCount = Math.max(500, Math.floor(previousDealCount * 0.6));
  if (nextDealCount < minimumDealCount) {
    throw new Error(
      `Refresh aborted; deal count ${nextDealCount} is below safety minimum ${minimumDealCount}`
    );
  }

  const nextStoreCount = Number(nextSnapshot?.storeCount || 0);
  const previousStoreCount = Number(previousSnapshot?.storeCount || 0);
  const minimumStoreCount = previousStoreCount
    ? Math.max(1, Math.floor(previousStoreCount * 0.8))
    : 1;
  if (nextStoreCount < minimumStoreCount) {
    throw new Error(
      `Refresh aborted; store count ${nextStoreCount} is below safety minimum ${minimumStoreCount}`
    );
  }
}

module.exports = {
  validateSnapshot
};
