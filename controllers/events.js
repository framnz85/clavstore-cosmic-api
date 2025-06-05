const crypto = require("crypto");
const axios = require("axios");

const graphApiVer = process.env.FB_GRAPH_API_VERSION || "v19.0";
const pixelId = process.env.FB_PIXEL_ID;
const accessToken = process.env.FB_ACCESS_TOKEN;

const hashData = (data) => {
  return crypto.createHash("sha256").update(data).digest("hex");
};

exports.sendPurchase = async (req, res) => {
  const { eventID, userData } = req.body;

  const event_time = Math.floor(Date.now() / 1000);

  const data = {
    data: [
      {
        event_name: "Purchase",
        event_time,
        action_source: "website",
        event_id: eventID,
        user_data: {
          em: hashData(userData.email),
          ph: hashData(userData.phone),
          fn: hashData(userData.firstName),
          ln: hashData(userData.lastName),
          zp: hashData(userData.zipcode),
          country: hashData(userData.country),
          ct: hashData(userData.city),
          client_user_agent: userData.userAgent,
          fbc: userData.fbc,
          fbp: userData.fbp,
          external_id: userData.externalID,
          client_ip_address: userData.ip,
        },
        attribution_data: {
          attribution_share: "0.3",
        },
        custom_data: {
          content_name: "Cosmic Clavstore",
          content_ids: "123456789",
          content_type: "product",
          currency: userData.currency,
          value: userData.value,
        },
        original_event_data: {
          event_name: "Purchase",
          event_time,
        },
      },
    ],
  };

  try {
    const response = await axios.post(
      `https://graph.facebook.com/v18.0/${pixelId}/events`,
      data,
      { params: { access_token: accessToken } }
    );
    res.status(200).send({ success: true, response: response.data });
  } catch (error) {
    res.status(500).send({ success: false, error: error.message });
  }
};

exports.sendAnyEvent = async (req, res) => {
  const { event_id, event_name, event_source_url, user_data, ...rest } =
    req.body;

  const event_time = Math.floor(Date.now() / 1000);

  const data = {
    data: [
      {
        event_name,
        event_time,
        event_source_url,
        action_source: "website",
        event_id,
        user_data: {
          em: hashData(user_data.email),
          ph: hashData(user_data.phone),
          fn: hashData(user_data.firstName),
          ln: hashData(user_data.lastName),
          zp: hashData(user_data.zipcode),
          country: hashData(user_data.country),
          ct: hashData(user_data.city),
          client_user_agent: user_data.userAgent,
          fbc: user_data.fbc,
          fbp: user_data.fbp,
          external_id: user_data.externalID,
          client_ip_address: user_data.ip,
        },
        ...rest,
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
