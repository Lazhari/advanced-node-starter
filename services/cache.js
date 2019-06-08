const mongoose = require("mongoose");
const redis = require("redis");
const util = require("util");

const redisUrl = "redis://127.0.0.1:6379";
const client = redis.createClient(redisUrl);
client.get = util.promisify(client.get);
const exec = mongoose.Query.prototype.exec;

// Add the cache method to the query prototype
mongoose.Query.prototype.cache = function() {
  this.useCache = true;
  // Just to make cache method chainable
  return this;
};

mongoose.Query.prototype.exec = async function() {
  if (!this.useCache) {
    return exec.apply(this, arguments);
  }
  const key = JSON.stringify(
    Object.assign({}, this.getQuery(), {
      collection: this.mongooseCollection.name
    })
  );

  // See if we have a value for 'key' in redis
  const cachedValue = await client.get(key);
  // if we do, return that
  if (cachedValue) {
    const result = JSON.parse(cachedValue);
    return Array.isArray(result)
      ? result.map(r => new this.model(r))
      : new this.model(result);
  }

  // Otherwise, issue the query and store the result in redis
  const result = await exec.apply(this, arguments);

  client.set(key, JSON.stringify(result), "EX", 10);

  return result;
};
