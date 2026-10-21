import express from "express";

const app = express();
app.use(express.json({ limit: "8mb" }));
app.use(express.static("public"));

const KEY = process.env.ANTHROPIC_API_KEY;
const CATS = {
  face: "face (overall face, symmetry, features)",
  body: "body shape (proportions; respectful, no weight or health comments)",
  outfit: "outfit (how well the clothes suit the person)",
  eyes: "eyes (shape, brightness, expression)",
  teeth: "teeth (shape and cleanliness of smile)",
  hair: "hair (style and condition)",
  skin: "skin (tone evenness, glow)",
  style: "overall style and look"
};

// simple per-IP limit: 10 requests / 10 min
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < 600000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 10;
}

app.post("/api/rate", async (req, res) => {
  try {
    if (!KEY) return res.status(500).json({ error: "API key hin qophoofne." });
    if (limited(req.ip)) return res.status(429).json({ error: "Yeroo muraasaan booda yaali." });

    const { image, categories, clothes } = req.body || {};
    if (typeof image !== "string" || image.length < 100) return res.status(400).json({ error: "Suuraan hin jiru." });
    const ids = (Array.isArray(categories) ? categories : []).filter(c => CATS[c]);
    if (!ids.length) return res.status(400).json({ error: "Yoo xiqqaate tokko filadhu." });

    const prompt =
      "You are a kind, honest, constructive appearance-feedback assistant. The image shows a person. " +
      "Rate ONLY these categories: " + ids.map(c => c + " = " + CATS[c]).join("; ") + ". " +
      (clothes ? "Also give 'outfit_rate': how good the person looks in the clothes they wear (fit, color, style), score out of 10. " : "") +
      "Rules: integer scores 1-10, kind but honest, no cruelty, no body-shaming, no comments on weight, health or medical conditions, " +
      "no guesses about race, age, religion or identity. Focus on grooming, styling, lighting, posture, fit and practical tips. " +
      "If a category is not visible, set score to null and say what is needed. " +
      "If there is no real person, or the person looks like a child or minor, return {\"error\":\"reason in Afaan Oromo\"}. " +
      "Write all text in Afaan Oromo. Return ONLY valid JSON, no markdown: " +
      "{\"overall\":number|null,\"summary\":string,\"categories\":[{\"id\":string,\"score\":number|null,\"comment\":string,\"tip\":string}]," +
      (clothes ? "\"outfit_rate\":{\"score\":number|null,\"comment\":string}," : "") + "\"error\":null}";

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-5-5",
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
            { type: "text", text: prompt }
          ]
        }]
      })
    });
    const data = await r.json();
    if (!r.ok) {
      console.error("Anthropic error:", JSON.stringify(data));
      return res.status(502).json({ error: "AI irraa deebiin hin argamne: " + (data.error?.message || r.status) });
    }

    const text = (data.content || []).map(b => b.text || "").join("").replace(/```json|```/g, "").trim();
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return res.status(502).json({ error: "AI deebii sirrii hin kennine." });
    res.json(JSON.parse(m[0]));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Rakkoon uumame: " + e.message });
  }
});

app.listen(process.env.PORT || 3000, () => console.log("Server ready"));
