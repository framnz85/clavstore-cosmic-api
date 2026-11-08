const crypto = require("crypto");
const storeRegistration = (() => {
const net = require('net');
const proxyaddr = require('proxy-addr');

class RegistrationError extends Error {
  constructor(status, code, message, retryAfter) {
    super(message); Object.assign(this, { status, code, retryAfter });
  }
}
const fail = (status, code, message) => { throw new RegistrationError(status, code, message); };
const unavailable = () => fail(503, 'REGISTRATION_UNAVAILABLE', 'Registration is temporarily unavailable. Please try again later.');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function positive(env, name, fallback) {
  const n = Number(env[name] === undefined ? fallback : env[name]);
  if (!Number.isSafeInteger(n) || n < 1) unavailable();
  return n;
}
function validate(body, resellerId) {
  const id = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
  if (!body || Array.isArray(body) || typeof body !== 'object' || !id(resellerId)) fail(400, 'INVALID_REGISTRATION', 'Invalid registration data.');
  if (Buffer.byteLength(JSON.stringify(body)) > 16384) fail(400, 'INVALID_REGISTRATION', 'Registration data is too large.');
  if (body.registrationHoneypot !== undefined && (typeof body.registrationHoneypot !== 'string' || body.registrationHoneypot.trim())) fail(400, 'INVALID_REGISTRATION', 'Invalid registration data.');
  if (typeof body.name !== 'string' || body.name.trim().length < 3 || body.name.trim().length > 80 || /[\x00-\x1f\x7f]/.test(body.name)) fail(400, 'INVALID_REGISTRATION', 'Store name must contain 3 to 80 characters.');
  if (typeof body.email !== 'string' || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) fail(400, 'INVALID_REGISTRATION', 'A valid email address is required.');
  if (!id(body.country) || ['refid', 'upPackage'].some(k => body[k] && !id(body[k]))) fail(400, 'INVALID_REGISTRATION', 'Invalid country, referral, or package identifier.');
  if (body.reseller !== undefined && (!body.reseller || typeof body.reseller !== 'object' || Array.isArray(body.reseller) || Object.entries(body.reseller).some(([k,v]) => k.startsWith('$') || k.includes('.') || !['string','boolean','number'].includes(typeof v) || (typeof v === 'string' && v.length > 2048)))) fail(400, 'INVALID_REGISTRATION', 'Invalid reseller data.');
  return { ...body, name: body.name.trim(), email: body.email.trim().toLowerCase() };
}
// All counters and their first-attempt TTLs are updated in one Redis execution.
// The shared hash tag also keeps these keys in one slot on Redis Cluster.
const LIMIT_SCRIPT = `
local retry = 0
for i, key in ipairs(KEYS) do
  local count = redis.call('INCR', key)
  local ttl = redis.call('TTL', key)
  if count == 1 or ttl < 0 then
    redis.call('EXPIRE', key, tonumber(ARGV[(i-1)*2+2]))
    ttl = tonumber(ARGV[(i-1)*2+2])
  end
  if count > tonumber(ARGV[(i-1)*2+1]) then retry = math.max(retry, ttl, 1) end
end
return retry`;
async function protect(req, body, redis, env = process.env, fetcher = globalThis.fetch) {
  let ip;
  try {
    const trusted = (env.ESTORE_REG_TRUSTED_PROXIES || '').split(',').map(x => x.trim()).filter(Boolean);
    ip = proxyaddr(req, trusted.length ? proxyaddr.compile(trusted) : () => false);
    if (!net.isIP(ip)) unavailable();
    if (ip.startsWith('::ffff:') && net.isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  } catch (_) { unavailable(); }
  try {
    if (!redis.isReady) unavailable();
    const retry = Number(await redis.eval(LIMIT_SCRIPT, {
      keys: [`estore-reg:{registration}:ip-hour:${hash(ip)}`, `estore-reg:{registration}:ip-day:${hash(ip)}`, `estore-reg:{registration}:email-day:${hash(body.email)}`],
      arguments: [String(positive(env,'ESTORE_REG_IP_HOURLY_LIMIT',3)), '3600', String(positive(env,'ESTORE_REG_IP_DAILY_LIMIT',5)), '86400', String(positive(env,'ESTORE_REG_EMAIL_DAILY_LIMIT',2)), '86400']
    }));
    if (!Number.isFinite(retry) || retry < 0) unavailable();
    if (retry > 0) throw new RegistrationError(429, 'REGISTRATION_RATE_LIMIT', 'Too many registration attempts. Please try again later.', Math.ceil(retry));
  } catch (error) { if (error instanceof RegistrationError) throw error; unavailable(); }
  const token = req.get('x-turnstile-token');
  if (typeof token !== 'string' || !token.trim()) fail(400, 'CAPTCHA_REQUIRED', 'Please complete the security challenge.');
  if (token.length > 2048) fail(400, 'CAPTCHA_INVALID', 'Security challenge failed. Please try again.');
  if (!env.TURNSTILE_SECRET_KEY) unavailable();
  let result;
  try {
    const response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(positive(env, 'TURNSTILE_TIMEOUT_MS', 5000))
    });
    if (!response.ok) unavailable();
    result = await response.json();
  } catch (_) { unavailable(); }
  const hosts = (env.TURNSTILE_EXPECTED_HOSTNAMES || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  const age = Date.now() - Date.parse(result && result.challenge_ts);
  if (!result || result.success !== true || !Number.isFinite(age) || age < -30000 || age > 300000 || (hosts.length && !hosts.includes(String(result.hostname).toLowerCase())) || (env.TURNSTILE_EXPECTED_ACTION && result.action !== env.TURNSTILE_EXPECTED_ACTION)) fail(400, 'CAPTCHA_INVALID', 'Security challenge expired or failed. Please complete it again.');
  // Defense in depth: reject reuse even if an upstream verification response is repeated.
  try {
    const accepted = await redis.set(`estore-reg:{registration}:captcha:${hash(token)}`, '1', { NX: true, EX: 330 });
    if (accepted !== 'OK') fail(400, 'CAPTCHA_INVALID', 'Security challenge already used. Please complete it again.');
  } catch (error) { if (error instanceof RegistrationError) throw error; unavailable(); }
}
function respond(res, error) {
  const safe = error instanceof RegistrationError ? error : new RegistrationError(503, 'REGISTRATION_UNAVAILABLE', 'Registration is temporarily unavailable.');
  if (safe.retryAfter) res.set('Retry-After', String(safe.retryAfter));
  return res.status(safe.status).json({ code: safe.code, err: safe.message, error: safe.message });
}
return { validate, protect, respond, RegistrationError };

})();
const ObjectId = require("mongoose").Types.ObjectId;
const slugify = require("slugify");

const Estore = require("../models/estore");
const Package = require("../models/package");
const User = require("../models/user");
const Payment = require("../models/payment");
const Product = require("../models/product");
const Category = require("../models/category");
const Brand = require("../models/brand");
const Cart = require("../models/cart");
const Order = require("../models/order");
const Raffle = require("../models/raffle");
const Rating = require("../models/rating");

const MyCountry = require("../models/myCountry");
const MyAddiv1 = require("../models/myAddiv1");
const MyAddiv2 = require("../models/myAddiv2");
const MyAddiv3 = require("../models/myAddiv3");

const { populateEstore } = require("./common");
const { redisClient } = require("../config/redis");

exports.getEstore = async (req, res) => {
  const resellid = req.headers.resellid;
  try {
    const estore = await Estore.findOne({
      slug: req.params.slug,
      resellid: new ObjectId(resellid),
    })
      .populate("country")
      .exec();
    res.json(estore);
  } catch (error) {
    res.json({ err: "Fetching store information fails. " + error.message });
  }
};

exports.getDefaultEstore = async (req, res) => {
  const resellid = req.headers.resellid;
  const branchid = req.headers.branchid;
  const defaultslug = req.headers.defaultslug;

  try {
    let defaultEstore = {};
    if (defaultslug === "branch") {
      defaultEstore = await Estore.findOne({
        _id: new ObjectId(branchid),
      })
        .populate("country")
        .exec();
    } else {
      defaultEstore = await Estore.findOne({
        defaultEstore: true,
        resellid: new ObjectId(resellid),
      })
        .populate("country")
        .exec();
    }
    if (defaultEstore) {
      res.json(defaultEstore);
    } else {
      res.json({ err: "Sorry, no default store found for this website." });
    }
  } catch (error) {
    res.json({ err: "Fetching store information fails. " + error.message });
  }
};

exports.getReseller = async (req, res) => {
  try {
    const estore = await Estore.findOne({ _id: new ObjectId(req.params.id) })
      .populate("country")
      .exec();
    if (estore && estore.reseller) {
      const payments = await Payment.find({
        estoreid: new ObjectId(req.params.id),
      });
      res.json({
        reseller: estore.reseller,
        currency: estore.country.currency,
        estoreChange: estore.estoreChange,
        resellid: estore.resellid,
        payments,
      });
    } else {
      res.json({ err: "The website is temporarily offline." });
    }
  } catch (error) {
    res.json({ err: "Fetching reseller information fails. " + error.message });
  }
};

exports.getPackage = async (req, res) => {
  const id = req.params.id;
  const packid = req.params.packid;
  let package = {};

  try {
    if (ObjectId.isValid(packid)) {
      package = await Package.findOne({
        _id: new ObjectId(packid),
      }).exec();
    } else {
      package = await Package.findOne({
        defaultPackage: "basic",
        default: true,
      }).exec();
    }
    if (package) {
      const estore = await Estore.findOne({
        _id: new ObjectId(id),
      })
        .populate("country")
        .exec();
      const payments = await Payment.find({
        estoreid: new ObjectId(id),
        purpose: { $ne: "dedicated" },
      }).exec();
      res.json({
        ...package._doc,
        currency: estore.country.currency,
        reseller: estore.reseller,
        payments,
      });
    }
  } catch (error) {
    res.json({ err: "Fetching reseller information fails. " + error.message });
  }
};

exports.getPackages = async (req, res) => {
  const finalPackages = [];
  const estoreid = req.headers.estoreid;
  const packDefault = req.params.packDefault;
  try {
    let packages = [];
    if (packDefault === "all") {
      packages = await Package.find().exec();
    } else {
      packages = await Package.find({
        defaultPackage: packDefault,
      }).exec();
    }
    const estore = await Estore.findOne({
      _id: new ObjectId(estoreid),
    }).exec();
    for (let i = 0; i < packages.length; i++) {
      const payments = await Payment.find({
        estoreid: new ObjectId(estoreid),
        purpose: packages[i].defaultPackage,
        active: true,
      }).exec();
      finalPackages.push({
        ...packages[i]._doc,
        payments,
        reseller: estore.reseller,
      });
    }
    res.json(finalPackages);
  } catch (error) {
    res.json({ err: "Getting packages fails. " + error.message });
  }
};

exports.getDedicatedEstores = async (req, res) => {
  try {
    let estores = await Estore.find({
      upgradeType: "2",
      upStatus2: "Active",
    }).exec();

    estores = await populateEstore(estores);

    res.json(estores);
  } catch (error) {
    res.json({ err: "Fetching dedicated stores fails. " + error.message });
  }
};

exports.getEstoreCounters = async (req, res) => {
  try {
    const estore = await Estore.findOne({
      _id: new ObjectId(req.params.estoreid),
    })
      .populate("country")
      .select(
        "estoreChange userChange productChange categoryChange paymentChange orderChange locationChange jobsChange",
      )
      .exec();
    res.json(estore);
  } catch (error) {
    res.json({ err: "Fetching store information fails. " + error.message });
  }
};

exports.getAllowedEstores = async (req, res) => {
  const { sortkey, sort, currentPage, pageSize } = req.body;

  try {
    let estores = await Estore.find({
      status: "active",
      $or: [{ showInApp: true, showInList: true }],
    })
      .skip((currentPage - 1) * pageSize)
      .sort({ [sortkey]: sort })
      .limit(pageSize)
      .exec();

    estores = await populateEstore(estores);

    res.json(estores);
  } catch (error) {
    res.json({ err: "Fetching allowed stores fails. " + error.message });
  }
};

exports.searchEstoreByText = async (req, res) => {
  const resellid = req.headers.resellid;
  const searchText = req.body.searchText;

  try {
    if (ObjectId.isValid(searchText)) {
      const estore = await Estore.find({
        _id: new ObjectId(searchText),
        status: "active",
        resellid: new ObjectId(resellid),
        showInApp: true,
      })
        .populate("country")
        .exec();
      res.json(estore);
    } else {
      const estore = await Estore.find({
        $and: [
          {
            $or: [
              { name: { $regex: searchText, $options: "i" } },
              { slug: { $regex: searchText, $options: "i" } },
              { email: { $regex: searchText, $options: "i" } },
              { storeDescription: { $regex: searchText, $options: "i" } },
              { storeAddress: { $regex: searchText, $options: "i" } },
              { storeContact: { $regex: searchText, $options: "i" } },
            ],
          },
          { status: "active" },
          { resellid: new ObjectId(resellid) },
          { showInApp: true },
        ],
      })
        .populate("country")
        .exec();

      res.json(estore);
    }
  } catch (error) {
    res.json({ err: "Fetching store information fails. " + error.message });
  }
};

exports.searchWarehouseByText = async (req, res) => {
  const resellid = req.headers.resellid;
  const searchText = req.body.searchText ? req.body.searchText.trim() : "";

  try {
    if (!searchText) {
      res.json([]);
      return;
    }

    const query = {
      storeType: "warehouse",
      status: "active",
      $or: [
        { name: { $regex: searchText, $options: "i" } },
        { slug: { $regex: searchText, $options: "i" } },
        { email: { $regex: searchText, $options: "i" } },
      ],
    };

    if (resellid) {
      query.resellid = new ObjectId(resellid);
    }

    const estores = await Estore.find(query)
      .select("name storeAddress storeContact slug")
      .limit(20)
      .exec();

    res.json(estores);
  } catch (error) {
    res.json({
      err: "Fetching warehouse store information fails. " + error.message,
    });
  }
};

exports.updateEstore = async (req, res) => {
  const estoreid = req.headers.estoreid;
  let values = req.body;
  const name = req.body.name;
  const type = values.type;
  const typeEstoreid = values.typeEstoreid;

  if (type === "warehouse" && ObjectId.isValid(typeEstoreid)) {
    delete values.type;
    delete values.typeEstoreid;
  }

  if (name) {
    values = {
      ...values,
      slug: slugify(name.toString().toLowerCase()),
    };
  }

  try {
    const estore = await Estore.findByIdAndUpdate(estoreid, values, {
      new: true,
    })
      .populate("country")
      .exec();
    if (!estore) {
      res.json({ err: "No eStore exist under ID: " + estoreid });
      return;
    }
    if (type === "warehouse" && ObjectId.isValid(typeEstoreid)) {
      await Estore.findByIdAndUpdate(typeEstoreid, values, {
        new: true,
      }).exec();
    }
    res.json(estore);
  } catch (error) {
    res.json({ err: "Fetching store information fails. " + error.message });
  }
};

exports.createEstore = async (req, res) => {
  const configuredKey = process.env.ESTORE_CREATE_PRIVATE_KEY;
  if (!configuredKey) {
    return res.status(503).json({ error: "Store creation encryption is not configured." });
  }
  const code = req.get("x-estore-create-code");
  if (!code || code.length > 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(code)) {
    return res.status(403).json({ error: "Missing or invalid store creation code." });
  }
  let key;
  try {
    key = crypto.createPrivateKey({
      key: Buffer.from(configuredKey, "base64"), format: "der", type: "pkcs8",
    });
  } catch (_) {
    return res.status(503).json({ error: "Store creation encryption is not configured correctly." });
  }
  try {
    const payload = JSON.parse(crypto.privateDecrypt({
      key, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256",
    }, Buffer.from(code, "base64")).toString("utf8"));
    const digest = crypto.createHash("sha256").update(JSON.stringify(req.body)).digest("hex");
    const age = Date.now() - payload.t;
    if (payload.v !== 1 || !Number.isSafeInteger(payload.t) || age < -30000 || age > 120000 ||
        payload.r !== String(req.params.resellid) || payload.h !== digest) {
      throw new Error("Invalid code");
    }
    // The decrypted code matches; continue with store creation.
  } catch (_) {
    return res.status(403).json({ error: "Missing, expired, or invalid store creation code." });
  }

  try {
    const normalized = storeRegistration.validate(req.body, req.params.resellid);
    await storeRegistration.protect(req, normalized, redisClient);
    req.body = normalized;
  } catch (error) {
    return storeRegistration.respond(res, error);
  }

  const resellid = req.params.resellid;
  const refid = req.body.refid;
  const upPackage = req.body.upPackage;
  const reseller = req.body.reseller;
  try {
    // Resolve referrals before any writes so an invalid referral cannot leave a store behind.
    const referralUser = refid ? await User.findOne({ _id: new ObjectId(refid), role: "admin" }).exec() : null;
    if (refid && !referralUser) {
      return res.status(400).json({ code: "INVALID_REFERRAL", err: "Invalid referral." });
    }
    const checkStoreExist = await Estore.findOne({
      slug: slugify(req.body.name.toString().toLowerCase()),
    });
    if (!checkStoreExist) {
      const checkEmailExist = await Estore.findOne({
        email: req.body.email,
      });
      if (!checkEmailExist) {
        const estore = new Estore(
          reseller && reseller.type
            ? upPackage
              ? {
                  name: req.body.name,
                  email: req.body.email,
                  slug: slugify(req.body.name.toString().toLowerCase()),
                  country: new ObjectId(req.body.country),
                  resellid: new ObjectId(resellid),
                  reseller,
                  upgradeType: "1",
                  upStatus: "Pending",
                  upPackage: new ObjectId(upPackage),
                }
              : {
                  name: req.body.name,
                  email: req.body.email,
                  slug: slugify(req.body.name.toString().toLowerCase()),
                  country: new ObjectId(req.body.country),
                  resellid: new ObjectId(resellid),
                  reseller,
                  upgradeType: "1",
                  upStatus: "Pending",
                }
            : upPackage
              ? {
                  name: req.body.name,
                  email: req.body.email,
                  slug: slugify(req.body.name.toString().toLowerCase()),
                  country: new ObjectId(req.body.country),
                  resellid: new ObjectId(resellid),
                  upgradeType: "1",
                  upStatus: "Pending",
                  upPackage: new ObjectId(upPackage),
                }
              : {
                  name: req.body.name,
                  email: req.body.email,
                  slug: slugify(req.body.name.toString().toLowerCase()),
                  country: new ObjectId(req.body.country),
                  resellid: new ObjectId(resellid),
                  upgradeType: "1",
                  upStatus: "Pending",
                },
        );
        await estore.save();

        if (refid) {
          const user = referralUser;

          await Estore.findOneAndUpdate(
            { _id: user.estoreid },
            {
              $inc: {
                productLimit: 10,
                categoryLimit: 1,
                userLimit: 5,
                invites: 1,
              },
            },
          );
        }

        res.json(estore);
      } else if (checkEmailExist && reseller && reseller.resellerType) {
        if (checkEmailExist.reseller && checkEmailExist.reseller.status) {
          res.status(409).json({
            code: "STORE_EXISTS",
            note: `Your email ${req.body.email} is already has an active reseller account. Login Now!`,
          });
        } else {
          await Estore.findOneAndUpdate(
            { _id: checkEmailExist._id },
            {
              reseller:
                checkEmailExist.reseller && checkEmailExist.reseller.status
                  ? {
                      ...checkEmailExist.reseller,
                      resellerType: reseller.resellerType,
                    }
                  : { resellerType: reseller.resellerType },
            },
          );
          res.json(checkEmailExist);
        }
      } else {
        res.status(409).json({
          code: "STORE_EXISTS",
          err: `Store with an email ${req.body.email} is already existing. Please choose another Email Address.`,
        });
      }
    } else {
      res.status(409).json({
        code: "STORE_EXISTS",
        err: `Store or App with a name ${req.body.name} is already existing. Please choose another Store Name.`,
      });
    }
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ code: "STORE_EXISTS", err: "Store already exists. Please choose another name or email." });
    }
    return res.status(503).json({ code: "REGISTRATION_UNAVAILABLE", err: "Registration is temporarily unavailable. Please try again later." });
  }
};

exports.addNewEstore = async (req, res) => {
  const resellid = req.params.resellid;
  const email = req.user.email;
  try {
    const user = await User.findOne({ email }).exec();
    if (user) {
      await storeRegistration.protect(req, { email: user.email.trim().toLowerCase() }, redisClient);
      const checkStoreExist = await Estore.findOne({
        slug: slugify(req.body.name.toString().toLowerCase()),
      });
      if (!checkStoreExist) {
        const estore = new Estore({
          storeType: req.body.storeType || "store",
          name: req.body.name,
          email: user.email,
          slug: slugify(req.body.name.toString().toLowerCase()),
          country: new ObjectId(req.body.country),
          resellid: new ObjectId(resellid),
          upgradeType: "2",
          upStatus: "Active",
          upStatus2: "Active",
          headerColor:
            req.body.storeType === "warehouse" ? "#4A4A4A" : "#009A57",
        });
        await estore.save();

        res.json(estore);
      } else {
        res.json({
          err: `Store or App with a name ${req.body.name} is already existing. Please choose another Store Name.`,
        });
      }
    } else {
      res.json({ err: "Cannot fetch the user." });
    }
  } catch (error) {
    if (error instanceof storeRegistration.RegistrationError) return storeRegistration.respond(res, error);
    res.json({ err: "Creating store fails. " + error.message });
  }
};

exports.copyingEstore = async (req, res) => {
  const resellid = req.params.resellid;
  const fromid = req.body.fromid;
  const email = req.user.email;
  try {
    const user = await User.findOne({ email }).exec();
    if (user) {
      await storeRegistration.protect(req, { email: user.email.trim().toLowerCase() }, redisClient);
      const checkStoreExist = await Estore.findOne({
        slug: slugify(req.body.name.toString().toLowerCase()),
      });
      if (!checkStoreExist) {
        const estore = new Estore({
          storeType: req.body.storeType || "store",
          name: req.body.name,
          email: user.email,
          slug: slugify(req.body.name.toString().toLowerCase()),
          country: new ObjectId(req.body.country),
          resellid: new ObjectId(resellid),
          upgradeType: "2",
          upStatus: "Active",
          upStatus2: "Active",
          headerColor:
            req.body.storeType === "warehouse" ? "#4A4A4A" : "#009A57",
        });
        await estore.save();

        const productCacheKey = `products:${fromid}`;

        let products = [];

        const cachedProductsData = await redisClient.get(productCacheKey);

        if (cachedProductsData) {
          const parsedData = JSON.parse(cachedProductsData);

          const cachedProducts = Array.isArray(parsedData.products)
            ? parsedData.products
            : [];

          products = cachedProducts.map((product) => {
            const {
              _id,
              discounttype,
              quantity,
              sold,
              createdAt,
              updatedAt,
              __v,
              ...productData
            } = product;

            return productData;
          });
        } else {
          products = await Product.find({
            estoreid: new ObjectId(fromid),
          })
            .select(
              "-_id -discounttype -quantity -sold -createdAt -updatedAt -__v",
            )
            .lean()
            .exec();
        }

        const copyingProducts = products.map((product) => {
          const images = product.images.map((img) => {
            return {
              ...img,
              fromid: img.fromid ? img.fromid : new ObjectId(fromid),
            };
          });
          return { ...product._doc, images, estoreid: estore._id };
        });
        const newProducts = await Product.insertMany(copyingProducts);

        const categoryIds = copyingProducts.map((prod) => prod.category);
        const brandIds = copyingProducts.map((prod) => prod.brand);

        if (newProducts.length) {
          const categories = await Category.find({
            _id: { $in: categoryIds },
            estoreid: new ObjectId(fromid),
          });

          categories.forEach(async (category) => {
            const images = category.images.map((img) => {
              return {
                ...img,
                fromid: img.fromid ? img.fromid : new ObjectId(fromid),
              };
            });
            const newCategory = new Category({
              name: category.name,
              slug: category.slug,
              images,
              estoreid: estore._id,
            });
            await newCategory.save();
            await Product.updateMany(
              { category: new ObjectId(category._id), estoreid: estore._id },
              { category: new ObjectId(newCategory._id) },
              { new: true },
            );
          });

          const brands = await Brand.find({
            _id: { $in: brandIds },
            estoreid: new ObjectId(fromid),
          });

          brands.forEach(async (brand) => {
            const newBrand = new Brand({
              name: brand.name,
              slug: brand.slug,
              estoreid: estore._id,
            });
            await newBrand.save();
            await Product.updateMany(
              { brand: new ObjectId(brand._id), estoreid: estore._id },
              { brand: new ObjectId(newBrand._id) },
              { new: true },
            );
          });

          res.json({ ok: true });
        }
      } else {
        res.json({
          err: `Store or App with a name ${req.body.name} is already existing. Please choose another Store Name.`,
        });
      }
    } else {
      res.json({ err: "Cannot fetch the user." });
    }
  } catch (error) {
    if (error instanceof storeRegistration.RegistrationError) return storeRegistration.respond(res, error);
    res.json({ err: "Creating store fails. " + error.message });
  }
};

exports.updateEstoreCounters = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const orderChange = req.body.orderChange;
  const paymentChange = req.body.paymentChange;
  const categoryChange = req.body.categoryChange;
  const productChange = req.body.productChange;
  const userChange = req.body.userChange;
  const estoreChange = req.body.estoreChange;

  try {
    const estore = await Estore.findByIdAndUpdate(
      estoreid,
      {
        orderChange,
        paymentChange,
        categoryChange,
        productChange,
        userChange,
        estoreChange,
      },
      {
        new: true,
      },
    ).exec();
    res.json(estore);
  } catch (error) {
    res.json({ err: "Updating estore counters fails. " + error.message });
  }
};

exports.updateEstoresDefault = async (req, res) => {
  const estoreid = req.body.estoreid;

  try {
    await Estore.updateMany({}, { $set: { defaultEstore: false } }).exec();
    await Estore.findByIdAndUpdate(
      estoreid,
      {
        defaultEstore: true,
      },
      {
        new: true,
      },
    ).exec();
    res.json({ ok: true });
  } catch (error) {
    res.json({ err: "Updating estore default fails. " + error.message });
  }
};

exports.updateEstoresVissible = async (req, res) => {
  const estoreid = req.headers.estoreid;

  try {
    await Estore.findByIdAndUpdate(estoreid, req.body, {
      new: true,
    }).exec();
    res.json({ ok: true });
  } catch (error) {
    res.json({ err: "Updating estore vissibility fails. " + error.message });
  }
};

exports.deletingEstore = async (req, res) => {
  const deleteid = req.params.deleteid;
  const resellid = req.headers.resellid;
  const email = req.user.email;

  try {
    const user = await User.findOne({ email }).exec();
    if (user) {
      await Estore.findOneAndDelete({
        _id: new ObjectId(deleteid),
      }).exec();

      await Brand.deleteMany({ estoreid: new ObjectId(deleteid) });
      await Cart.deleteMany({ estoreid: new ObjectId(deleteid) });
      await Category.deleteMany({ estoreid: new ObjectId(deleteid) });
      await Order.deleteMany({ estoreid: new ObjectId(deleteid) });
      await Payment.deleteMany({ estoreid: new ObjectId(deleteid) });
      await Product.deleteMany({ estoreid: new ObjectId(deleteid) });
      await Raffle.deleteMany({ estoreid: new ObjectId(deleteid) });
      await Rating.deleteMany({ estoreid: new ObjectId(deleteid) });
      await User.deleteMany({
        estoreid: new ObjectId(deleteid),
        role: { $ne: "admin" },
      });

      const oldEstore = await Estore.findOne({
        _id: new ObjectId(resellid),
      }).exec();
      await User.updateMany(
        {
          estoreid: new ObjectId(deleteid),
          role: "admin",
        },
        { $set: { estoreid: oldEstore._id } },
      ).exec();

      await MyCountry.deleteMany({ estoreid: new ObjectId(deleteid) });
      await MyAddiv1.deleteMany({ estoreid: new ObjectId(deleteid) });
      await MyAddiv2.deleteMany({ estoreid: new ObjectId(deleteid) });
      await MyAddiv3.deleteMany({ estoreid: new ObjectId(deleteid) });

      res.json({ ok: true });
    } else {
      res.json({ err: "Cannot fetch the user." });
    }
  } catch (error) {
    res.json({ err: "Deleting an estore failed. " + error.message });
  }
};
