// Fungsi server (Vercel) yang menjadi perantara antara K.0 dan Groq API.

const KEPRIBADIAN =
  "Kamu adalah K.0 (dibaca 'ka nol'), teman ngobrol AI yang asik untuk anak muda Indonesia. " +
  "Gaya bicaramu santai, hangat, dan sedikit jenaka, memakai bahasa Indonesia gaul sehari-hari " +
  "(boleh pakai kata seperti 'nih', 'sih', 'banget', 'yuk', 'santai aja'), tetapi jangan berlebihan " +
  "dan tetap jelas, sopan, serta akurat. Jawab singkat, maksimal 2-3 kalimat, karena jawabanmu akan " +
  "diucapkan lewat suara. Jangan gunakan emoji, tanda bintang, atau format markdown.";

const BATAS_WAKTU_MS = 25000;

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metode tidak diizinkan" });
  }

  // Cek PIN akses dari frontend
  const pin = process.env.ACCESS_PIN;
  if (pin && req.headers["x-access-pin"] !== pin) {
    return res.status(401).json({ error: "PIN salah" });
  }

  // Menggunakan GROQ_API_KEY, pastikan ini sudah disetel di Vercel
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res
      .status(500)
      .json({ error: "GROQ_API_KEY belum diisi di pengaturan Vercel" });
  }

  // Validasi dan rapikan riwayat percakapan K.0 (Frontend)
  const mentah = req.body && Array.isArray(req.body.messages) ? req.body.messages : [];
  
  // Format K.0 (model) diubah ke format Groq/OpenAI (assistant)
  const contents = mentah
    .slice(-19)
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "model") &&
        typeof m.text === "string" &&
        m.text.trim()
    )
    .map((m) => ({ 
      role: m.role === "model" ? "assistant" : "user", 
      content: m.text.slice(0, 2000) 
    }));

  // Tambahkan kepribadian K.0 di urutan paling atas sebagai 'system'
  contents.unshift({ role: "system", content: KEPRIBADIAN });

  // Gunakan Llama 3 ukuran 8B yang sangat cepat dan gratis dari Groq
  const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
  const url = "https://api.groq.com/openai/v1/chat/completions";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BATAS_WAKTU_MS);

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${apiKey}` 
      },
      body: JSON.stringify({
        model: model,
        messages: contents,
        temperature: 0.7, // Sedikit kreativitas untuk gaya bahasa asyik
      }),
      signal: ctrl.signal,
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      const pesan =
        (data.error && data.error.message) || "Groq error " + r.status;
      return res.status(502).json({ error: pesan });
    }

    const reply = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content.trim()
      : "";
      
    return res
      .status(200)
      .json({ reply: reply || "Maaf, aku bingung mau jawab apa nih." });
      
  } catch (e) {
    if (e && e.name === "AbortError") {
      return res
        .status(504)
        .json({ error: "Groq API terlalu lama merespons. Coba lagi ya." });
    }
    return res.status(502).json({ error: "Koneksi ke server Groq terputus." });
  } finally {
    clearTimeout(timer);
  }
};
