import { getStore } from "@netlify/blobs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
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
    } catch { members = []; }

    return new Response(JSON.stringify({ members }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("get-absences error:", e);
    return new Response(JSON.stringify({ error: "Internal server error", detail: e.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/.netlify/functions/get-absences" };
