// Cloudflare Worker: AI proxy (API key asitti kuufama, fuula keessa hin jiru)
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

export default {
  async fetch(request, env) {
    // Gara website keetii qofa eeyyamuuf: env.ALLOWED_ORIGIN = "https://USERNAME.github.io"
    const origin = env.ALLOWED_ORIGIN || "*";
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return json({ error: "POST qofa." }, 405);
    if (!env.ANTHROPIC_API_KEY) return json({ error: "API key hin qophoofne." }, 500);

    try {
      const { image, categories, clothes } = await request.json();
      if (typeof image !== "string" || image.length < 100 || image.length > 8_000_000)
        return json({ error: "Suuraan hin jiru ykn guddaadha." }, 400);
      const ids = (Array.isArray(categories) ? categories : []).filter(c => CATS[c]);
      if (!ids.length) return json({ error: "Yoo xiqqaate tokko filadhu." }, 400);

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
        headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
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
      if (!r.ok) return json({ error: "AI irraa deebiin hin argamne: " + (data.error?.message || r.status) }, 502);

      const text = (data.content || []).map(b => b.text || "").join("");
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return json({ error: "AI deebii sirrii hin kennine." }, 502);
      return json(JSON.parse(m[0]));
    } catch (e) {
      return json({ error: "Rakkoon uumame: " + e.message }, 500);
    }
  }
};
