const crypto = require("crypto");
const axios = require("axios");

const accessToken = process.env.FB_ACCESS_TOKEN;
const pixelId = "837512104717815";

const hashData = (data) => {
  return crypto.createHash("sha256").update(data).digest("hex");
};

exports.sendPurchase = async (req, res) => {
  const { eventID, product, userData } = req.body;

  const data = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventID, // Deduplication ID
        event_source_url: "http://francisclavano.clavstore.com/cosmic-thankyou",
        action_source: "website",
        user_data: {
          client_user_agent: userData.userAgent,
          client_ip_address: userData.ip,
          em: hashData(userData.email), // Hashed email
          ph: hashData(userData.phone), // Hashed phone
        },
        custom_data: {
          content_name: "Cosmic Clavstore",
          content_ids: "123456789",
          content_type: "product",
          value: "480",
          currency: "PHP",
        },
      },
    ],
  };

  try {
    const response = await axios.post(
      `https://graph.facebook.com/v17.0/${pixelId}/events`,
      data,
      { params: { access_token: accessToken } }
    );
    res.status(200).send({ success: true, response: response.data });
  } catch (error) {
    res.status(500).send({ success: false, error: error.message });
  }
};
