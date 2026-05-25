const express = require("express");
const cors = require("cors");
const { readdirSync } = require("fs");
require("dotenv").config();

const app = express();

app.set("trust proxy", true);

if (process.env.NODE_ENV !== "production") {
  const morgan = require("morgan");
  app.use(morgan("dev"));
}

app.use(express.json({ limit: "2mb" }));

const allowedOrigins = [
  "https://cosmic.clavstore.com",
  "https://store.clavstore.com",
  "https://clavstore.com",
  "https://www.clavstore.com",
  "https://learnclavstore.com",
  "https://www.learnclavstore.com",
  "http://localhost:3005",
  "http://localhost:3004",
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
];

const normalizeOrigin = (origin) => origin.replace(/\/$/, "");

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    const normalizedOrigin = normalizeOrigin(origin);
    const isAllowed = allowedOrigins.some(
      (allowedOrigin) => normalizeOrigin(allowedOrigin) === normalizedOrigin,
    );

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

readdirSync("./routes").map((file) =>
  app.use("/" + process.env.API_ROUTES, require("./routes/" + file)),
);

const port = process.env.PORT || 8000;
app.listen(port, () => console.log(`Server is running on port ${port}`));
