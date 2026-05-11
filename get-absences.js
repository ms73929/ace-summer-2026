const { getStore } = require("@netlify/blobs");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const store = getStore({ name: "ace-team-calendar", consistency: "strong" });
    let members = [];
    try {
      const raw = await store.get("members");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) members = parsed;
      }
    } catch (_) {
      members = [];
    }

    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ members }),
    };
  } catch (e) {
    console.error("get-absences error:", e);
    return {
      statusCode: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal server error", detail: e.message }),
    };
  }
};
