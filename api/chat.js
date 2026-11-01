// Fungsi server (Vercel) yang menjadi perantara antara halaman web dan Gemini.
// API key disimpan di server (environment variable), BUKAN di halaman web.

const KEPRIBADIAN =
  "Kamu adalah K.0, asisten pribadi yang cerdas, sopan, dan sedikit jenaka. " +
  "Jawab dalam bahasa Indonesia, singkat (maksimal 2-3 kalimat) karena jawabanmu " +
  "akan diucapkan lewat suara. Jangan gunakan emoji, tanda bintang, atau format markdown.";

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metode tidak diizinkan" });
  }

  // PIN akses (opsional tapi sangat disarankan agar orang lain tidak memakai kuota-mu)
  const pin = process.env.ACCESS_PIN;
  if (pin && req.headers["x-access-pin"] !== pin) {
    return res.status(401).json({ error: "PIN salah" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res
      .status(500)
      .json({ error: "GEMINI_API_KEY belum diisi di pengaturan Vercel" });
  }

  // Validasi dan rapikan riwayat percakapan
  const mentah = req.body && Array.isArray(req.body.messages) ? req.body.messages : [];
  const contents = mentah
    .slice(-19)
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "model") &&
        typeof m.text === "string" &&
        m.text.trim()
    )
    .map((m) => ({ role: m.role, parts: [{ text: m.text.slice(0, 2000) }] }));

  while (contents.length && contents[0].role !== "user") contents.shift();
  if (!contents.length || contents[contents.length - 1].role !== "user") {
    return res.status(400).json({ error: "Pesan tidak valid" });
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: KEPRIBADIAN }] },
          contents,
        }),
      }
    );

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const pesan =
        (data.error && data.error.message) || "Gemini error " + r.status;
      return res.status(502).json({ error: pesan });
    }

    const parts =
      data.candidates && data.candidates[0] && data.candidates[0].content
        ? data.candidates[0].content.parts || []
        : [];
    const reply = parts.map((p) => p.text || "").join("").trim();
    return res
      .status(200)
      .json({ reply: reply || "Maaf, aku tidak bisa menjawab itu." });
  } catch (e) {
    return res.status(502).json({ error: "Tidak bisa menghubungi Gemini" });
  }
};
