import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const productCatalog = [
  {
    name: "Classic Steel Cut Oats",
    sku: "SCO-001",
    nutrition: { calories: 150, protein: "5g", fiber: "8g" },
    dietary: ["gluten-free", "vegan"],
    best_for: ["Weight loss", "Blood sugar management", "Heart health"],
  },
  {
    name: "Protein-Enhanced Blend",
    sku: "PEB-003",
    nutrition: { calories: 220, protein: "15g", fiber: "6g" },
    dietary: ["gluten-free"],
    best_for: ["Weight loss", "Muscle recovery", "High protein"],
  },
];

function buildPrompt(profile) {
  return `
Create a personalized DailyNoats oatmeal nutrition plan.

Customer Profile:
${JSON.stringify(profile, null, 2)}

Available Products:
${productCatalog.map(p => `- ${p.name} (${p.sku}) best for: ${p.best_for.join(", ")}`).join("\n")}

Return ONLY valid JSON in this structure:

{
  "plan_markdown": "markdown content here",
  "recommended_products": [
    { "sku": "SCO-001", "reason": "Why this product is recommended" }
  ]
}
`;
}

app.post("/api/nutrition-plan", async (req, res) => {
  try {
    const messages = [
      { role: "system", content: "Return ONLY valid JSON." },
      { role: "user", content: buildPrompt(req.body) }
    ];

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.4,
    });

    const raw = completion.choices[0].message.content;

    let json;
    try {
      json = JSON.parse(raw);
    } catch (err) {
      return res.status(500).json({ error: "Invalid JSON returned by AI." });
    }

    res.json(json);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error." });
  }
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log("Server running on port", port));
