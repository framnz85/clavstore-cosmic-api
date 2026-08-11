const { redisClient } = require("../../config/redis");

exports.clearProductsCache = async (estoreid) => {
  await redisClient.del(`products:${estoreid}`);
};

exports.clearMultiItemsCache = async (estoreid, cacheName) => {
  const pattern = `${cacheName}:${estoreid}:*`;

  let cursor = "0";

  do {
    const result1 = await redisClient.scan(cursor, {
      MATCH: pattern,
      COUNT: 100,
    });

    cursor = result1.cursor;

    if (result1.keys && result1.keys.length > 0) {
      for (const key of result1.keys) {
        await redisClient.del(key);
      }
    }
  } while (cursor !== "0");
};
