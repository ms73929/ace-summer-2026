const { getStore } = require("@netlify/blobs");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const PALETTE = [
  "#1B6CA8", "#C0392B", "#1E8449", "#7D3C98",
  "#CA6F1E", "#117A65", "#884EA0", "#1A5276",
  "#B03A2E", "#196F3D", "#6C3483", "#9A7D0A",
];

const ADMIN_PASSWORD = "ace-calendar-2026";
const VALID_REASONS = ["Vacation", "Conference", "Sick", "Personal", "Other"];

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (_) {
    return {
      statusCode: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid JSON" }),
    };
  }

  const store = getStore({ name: "ace-team-calendar", consistency: "strong" });

  // ── Admin: reassign color ──────────────────────────────────────────────
  if (body.adminAction === "reassign-color") {
    if (body.adminPassword !== ADMIN_PASSWORD) {
      return {
        statusCode: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    const { targetEmail, newColor } = body;
    if (!targetEmail || !newColor) {
      return {
        statusCode: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "targetEmail and newColor required" }),
      };
    }

    let members = [];
    try {
      const raw = await store.get("members");
      if (raw) members = JSON.parse(raw);
    } catch (_) { members = []; }

    const idx = members.findIndex(
      (m) => m.email.toLowerCase() === targetEmail.toLowerCase()
    );
    if (idx < 0) {
      return {
        statusCode: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Member not found" }),
      };
    }

    members[idx].color = newColor;
    members[idx].updatedAt = new Date().toISOString();
    await store.set("members", JSON.stringify(members));

    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, members }),
    };
  }

  // ── Normal: save member absences ──────────────────────────────────────
  const { name, email, color, absences } = body;

  if (!name || !email) {
    return {
      statusCode: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Name and email are required" }),
    };
  }
  if (!Array.isArray(absences)) {
    return {
      statusCode: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Absences must be an array" }),
    };
  }
  for (const absence of absences) {
    if (!absence.date || !/^\d{4}-\d{2}-\d{2}$/.test(absence.date)) {
      return {
        statusCode: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Each absence must have a valid YYYY-MM-DD date" }),
      };
    }
    if (!VALID_REASONS.includes(absence.reason)) {
      return {
        statusCode: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: `Invalid reason: ${absence.reason}` }),
      };
    }
  }

  try {
    let members = [];
    try {
      const raw = await store.get("members");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) members = parsed;
      }
    } catch (_) { members = []; }

    const normalizedEmail = email.toLowerCase().trim();
    const existingIndex = members.findIndex(
      (m) => m.email.toLowerCase() === normalizedEmail
    );

    let assignedColor;
    const DEFAULT_PICKER = "#1B6CA8";
    if (existingIndex >= 0) {
      // Keep existing color unless user explicitly changed it
      assignedColor =
        color && color !== DEFAULT_PICKER
          ? color
          : members[existingIndex].color;
    } else {
      // Auto-assign next unused palette slot
      const usedColors = members.map((m) => m.color);
      const nextPalette =
        PALETTE.find((c) => !usedColors.includes(c)) ||
        PALETTE[members.length % PALETTE.length];
      assignedColor =
        color && color !== DEFAULT_PICKER ? color : nextPalette;
    }

    const memberRecord = {
      name: name.trim(),
      email: normalizedEmail,
      color: assignedColor,
      absences,
      updatedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      members[existingIndex] = memberRecord;
    } else {
      members.push(memberRecord);
    }

    await store.set("members", JSON.stringify(members));

    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, member: memberRecord }),
    };
  } catch (e) {
    console.error("save-absences error:", e);
    return {
      statusCode: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal server error", detail: e.message }),
    };
  }
};
