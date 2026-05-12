// netlify/functions/save-absences.js
// Netlify Functions v2 — uses esbuild bundler and built-in Blobs context.
import { getStore } from "@netlify/blobs";

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
const VALID_REASONS  = ["Vacation", "Conference", "Personal", "MYOB", "Other", ""];
const DEFAULT_PICKER = "#1B6CA8";

export default async (req, context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch (_) {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const store = getStore({ name: "ace-team-calendar", consistency: "strong" });

  // ── Admin: delete member ──────────────────────────────────────────────
  if (body.adminAction === "delete-member") {
    if (body.adminPassword !== ADMIN_PASSWORD) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const { targetEmail } = body;
    if (!targetEmail) {
      return new Response(JSON.stringify({ error: "targetEmail required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    let members = [];
    try {
      const raw = await store.get("members");
      if (raw) members = JSON.parse(raw);
    } catch (_) { members = []; }

    const before = members.length;
    members = members.filter(m => m.email.toLowerCase() !== targetEmail.toLowerCase());
    if (members.length === before) {
      return new Response(JSON.stringify({ error: "Member not found" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    await store.set("members", JSON.stringify(members));
    return new Response(JSON.stringify({ success: true, members }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // ── Admin: reassign color ─────────────────────────────────────────────
  if (body.adminAction === "reassign-color") {
    if (body.adminPassword !== ADMIN_PASSWORD) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const { targetEmail, newColor } = body;
    if (!targetEmail || !newColor) {
      return new Response(JSON.stringify({ error: "targetEmail and newColor required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    let members = [];
    try {
      const raw = await store.get("members");
      if (raw) members = JSON.parse(raw);
    } catch (_) { members = []; }

    const idx = members.findIndex(
      m => m.email.toLowerCase() === targetEmail.toLowerCase()
    );
    if (idx < 0) {
      return new Response(JSON.stringify({ error: "Member not found" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    members[idx].color     = newColor;
    members[idx].updatedAt = new Date().toISOString();
    await store.set("members", JSON.stringify(members));

    return new Response(JSON.stringify({ success: true, members }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // ── Normal: save member absences ──────────────────────────────────────
  const { name, email, color, absences } = body;

  if (!name || !email) {
    return new Response(JSON.stringify({ error: "Name and email are required" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  if (!Array.isArray(absences)) {
    return new Response(JSON.stringify({ error: "Absences must be an array" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  for (const absence of absences) {
    if (!absence.date || !/^\d{4}-\d{2}-\d{2}$/.test(absence.date)) {
      return new Response(JSON.stringify({ error: "Each absence needs a valid YYYY-MM-DD date" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    if (!VALID_REASONS.includes(absence.reason)) {
      return new Response(JSON.stringify({ error: "Invalid reason: " + absence.reason }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
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
    const existingIndex   = members.findIndex(
      m => m.email.toLowerCase() === normalizedEmail
    );

    let assignedColor;
    if (existingIndex >= 0) {
      assignedColor = (color && color !== DEFAULT_PICKER)
        ? color
        : members[existingIndex].color;
    } else {
      const usedColors  = members.map(m => m.color);
      const nextPalette = PALETTE.find(c => !usedColors.includes(c))
                       || PALETTE[members.length % PALETTE.length];
      assignedColor = (color && color !== DEFAULT_PICKER) ? color : nextPalette;
    }

    const memberRecord = {
      name:      name.trim(),
      email:     normalizedEmail,
      color:     assignedColor,
      absences,
      updatedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      members[existingIndex] = memberRecord;
    } else {
      members.push(memberRecord);
    }

    await store.set("members", JSON.stringify(members));

    return new Response(JSON.stringify({ success: true, member: memberRecord }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("save-absences error:", e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
};

export const config = { path: "/.netlify/functions/save-absences" };
