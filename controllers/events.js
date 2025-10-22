const crypto = require("crypto");
const axios = require("axios");

const graphApiVer = process.env.FB_GRAPH_API_VERSION || "v19.0";
const pixelId = process.env.FB_PIXEL_ID;
const accessToken = process.env.FB_ACCESS_TOKEN;

const hashData = (data) => {
  return crypto.createHash("sha256").update(data).digest("hex");
};

const getClientIp = (req) => {
  const ip =
    req.headers["cf-connecting-ip"] || // Cloudflare
    req.headers["x-real-ip"] || // Vercel / Nginx
    req.headers["x-forwarded-for"]?.split(",")[0] || // Proxies
    req.ip;

  return ip?.replace("::ffff:", "").trim();
};

exports.sendPurchase = async (req, res) => {
  const clientIp = getClientIp(req);
  const { eventID, eventSourceUrl, userData } = req.body;

  const event_time = Math.floor(Date.now() / 1000);

  const user_data = {};
  if (userData.email) user_data.em = hashData(userData.email);
  if (userData.phone) user_data.ph = hashData(userData.phone);
  if (userData.firstName) user_data.fn = hashData(userData.firstName);
  if (userData.lastName) user_data.ln = hashData(userData.lastName);
  if (userData.zipcode) user_data.zp = hashData(userData.zipcode);
  if (userData.country) user_data.country = hashData(userData.country);
  if (userData.city) user_data.ct = hashData(userData.city);
  if (userData.externalID)
    user_data.external_id = hashData(userData.externalID);
  if (userData.userAgent) user_data.client_user_agent = userData.userAgent;
  if (userData.fbc) user_data.fbc = userData.fbc;
  if (userData.fbp) user_data.fbp = userData.fbp;
  user_data.client_ip_address = clientIp;

  const data = {
    data: [
      {
        event_name: "Purchase",
        event_time,
        event_source_url: eventSourceUrl || "https://cosmic.clavstore.com",
        action_source: "website",
        event_id: eventID,
        user_data,
        attribution_data: {
          attribution_share: "0.3",
        },
        custom_data: {
          content_name: "Cosmic Clavstore",
          content_ids: ["123456789"],
          content_type: "product",
          currency: userData.currency || "PHP",
          value: userData.value || 0,
          page_name: userData.page_name || "",
          page_url: userData.page_url || "",
        },
      },
    ],
  };

  try {
    const response = await axios.post(
      `https://graph.facebook.com/${graphApiVer}/${pixelId}/events`,
      data,
      { params: { access_token: accessToken } }
    );
    res.status(200).send({ success: true, response: response.data });
  } catch (error) {
    res.status(500).send({ success: false, error: error.message });
  }
};

exports.sendAnyEvent = async (req, res) => {
  const clientIp = getClientIp(req);
  const { event_id, event_name, event_source_url, user_data, ...rest } =
    req.body;

  console.log(event_source_url + " => ", event_id);

  const event_time = Math.floor(Date.now() / 1000);

  const hashedUserData = {};
  if (user_data.email) hashedUserData.em = hashData(user_data.email);
  if (user_data.phone) hashedUserData.ph = hashData(user_data.phone);
  if (user_data.firstName) hashedUserData.fn = hashData(user_data.firstName);
  if (user_data.lastName) hashedUserData.ln = hashData(user_data.lastName);
  if (user_data.zipcode) hashedUserData.zp = hashData(user_data.zipcode);
  if (user_data.country) hashedUserData.country = hashData(user_data.country);
  if (user_data.city) hashedUserData.ct = hashData(user_data.city);
  if (user_data.userAgent)
    hashedUserData.client_user_agent = user_data.userAgent;
  if (user_data.fbc) hashedUserData.fbc = user_data.fbc;
  if (user_data.fbp) hashedUserData.fbp = user_data.fbp;
  if (user_data.externalID)
    hashedUserData.external_id = hashData(user_data.externalID);
  hashedUserData.client_ip_address = clientIp;

  const data = {
    data: [
      {
        event_name,
        event_time,
        event_source_url: event_source_url || "https://cosmic.clavstore.com",
        action_source: "website",
        event_id,
        user_data: hashedUserData,
        custom_data: rest || {},
      },
    ],
  };

  try {
    const response = await axios.post(
      `https://graph.facebook.com/${graphApiVer}/${pixelId}/events`,
      data,
      { params: { access_token: accessToken } }
    );
    res.status(200).send({ success: true, response: response.data });
  } catch (error) {
    res.status(500).send({ success: false, error: error.message });
  }
};
