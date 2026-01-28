const { google } = require("googleapis");
const fs = require("fs");

const credentials = JSON.parse(fs.readFileSync("credentials.json"));
const { client_id, client_secret } = credentials.web;

const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  "http://localhost"
);

(async () => {
  const { tokens } = await oAuth2Client.getToken("4/0ASc3gC2sbtmD7pu02VsSr8caNYpd3tNw8CsqiPjcw3isoWx2lM6Z5fz-MW3j90_0_QVFaw&scope=https://www.googleapis.com/auth/gmail.send");
  console.log(tokens);
})();
