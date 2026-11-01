export default async function handler(req, res) {
  // Mengambil kunci rahasia dari Environment Variables Vercel
  const apiKey = process.env.GROQ_API_KEY; 
  
  // Mengambil pesan dari iPhone/Frontend
  const userMessage = req.body.message || "Halo";

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama3-8b-8192", // Model ringan dan super cepat dari Groq
        messages: [{ role: "user", content: userMessage }]
      })
    });

    const data = await response.json();
    // Mengirim jawaban kembali ke iPhone
    res.status(200).json({ reply: data.choices[0].message.content });
  } catch (error) {
    res.status(500).json({ error: "Gagal menghubungi API pihak ketiga" });
  }
}
