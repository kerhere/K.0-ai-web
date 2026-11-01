// Fungsi server (Vercel) yang menjadi perantara antara halaman web dan Gemini.
// API key disimpan di server (environment variable), BUKAN di halaman web.

const KEPRIBADIAN =
  "Kamu adalah K.0 (dibaca 'ka nol'), teman ngobrol AI yang asik untuk anak muda Indonesia. " +
  "Gaya bicaramu santai, hangat, dan sedikit jenaka, memakai bahasa Indonesia gaul sehari-hari " +
  "(boleh pakai kata seperti 'nih', 'sih', 'banget', 'yuk', 'santai aja'), tetapi jangan berlebihan " +
  "dan tetap jelas, sopan, serta akurat. Jawab singkat, maksimal 2-3 kalimat, karena jawabanmu akan " +
  "diucapkan lewat suara. Jangan gunakan emoji, tanda bintang, atau format markdown.";

// Batas tunggu jawaban Gemini. Setelah itu server membalas dengan pesan error
// (bukan menggantung selamanya).
const BATAS_WAKTU_MS = 25000;

function buatBody(contents, level) {
  const body = {
    system_instruction: { parts: [{ text: KEPRIBADIAN }] },
    contents,
  };
  // "Tingkat berpikir" rendah membuat Gemini 3.x menjawab jauh lebih cepat.
  if (level) body.generationConfig = { thinkingConfig: { thinkingLevel: level } };
  return body;
}

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

  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";

  // GEMINI_THINKING: low (bawaan, cepat) | medium | high | off (pakai bawaan model)
  const levelMentah = (process.env.GEMINI_THINKING || "low").trim().toLowerCase();
  const level = ["off", "none", "default"].includes(levelMentah) ? "" : levelMentah;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BATAS_WAKTU_MS);

  const panggil = async (body) => {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await r.json().catch(() => ({}));
    return { r, data };
  };

  try {
    let { r, data } = await panggil(buatBody(contents, level));

    // Jika model tidak mengenal pengaturan thinking, coba lagi tanpa pengaturan itu
    if (!r.ok && r.status === 400 && level && /thinking/i.test(JSON.stringify(data.error || {}))) {
      ({ r, data } = await panggil(buatBody(contents, "")));
    }

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
    if (e && e.name === "AbortError") {
      return res
        .status(504)
        .json({ error: "Gemini terlalu lama menjawab. Coba lagi sebentar." });
    }
    return res.status(502).json({ error: "Tidak bisa menghubungi Gemini" });
  } finally {
    clearTimeout(timer);
  }
};
