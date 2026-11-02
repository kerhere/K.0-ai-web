export default async function handler(req, res) {
  // 1. Ambil API Key Groq dari Vercel Environment Variables
  const apiKey = process.env.GROQ_API_KEY; 
  if (!apiKey) {
    return res.status(500).json({ error: "API Key Groq belum dipasang di pengaturan Vercel." });
  }

  // 2. Ambil riwayat chat yang dikirim oleh K.0 (frontend)
  const incomingMessages = req.body.messages || [];

  // 3. Ubah format K.0 ke format yang dimengerti oleh Groq
  // K.0 mengirim: { role: "model"|"user", text: "..." }
  // Groq butuh: { role: "assistant"|"user", content: "..." }
  const formattedMessages = incomingMessages.map(msg => ({
    role: msg.role === 'model' ? 'assistant' : 'user',
    content: msg.text
  }));

  // 4. Tambahkan kepribadian sistem di baris paling atas
  formattedMessages.unshift({
    role: "system",
    content: "Kamu adalah K.0 (Ka Nol). Kamu adalah asisten AI yang gaul, santai, dan asyik berbahasa Indonesia. Jawablah pertanyaan dengan singkat, ramah, dan seperti anak muda. Jangan terlalu kaku."
  });

  try {
    // 5. Kirim permintaan ke Groq Cloud
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama3-8b-8192", // Model super cepat dari Groq
        messages: formattedMessages
      })
    });

    const data = await response.json();

    // Jika dari Groq ada error
    if (!response.ok) {
      return res.status(500).json({ error: data.error?.message || "Groq API menolak koneksi." });
    }

    // 6. Kembalikan jawaban Groq ke K.0
    res.status(200).json({ reply: data.choices[0].message.content });

  } catch (error) {
    res.status(500).json({ error: "Server Vercel gagal menghubungi Groq." });
  }
}
