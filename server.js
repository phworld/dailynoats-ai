// server.js
// Daily N'Oats AI Nutrition Planner backend
// - Uses products from products_catalog.js
// - Only recommends real Daily N'Oats products
// - Returns structured JSON: { plan_markdown, recommended_products }

import express from "express";
import cors from "cors";
import OpenAI from "openai";
import products from "./products_catalog.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

if (!process.env.OPENAI_API_KEY) {
  console.warn(
    "WARNING: OPENAI_API_KEY is not set. Start the server with:\n" +
      'OPENAI_API_KEY="sk-..." npm start'
  );
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 🔹 Helper: sync AI plan to Shopify (customer + metaobject + metafield)
async function syncPlanToShopify(email, plan_markdown, recommended_products) {
  try {
    if (!email) return;

    const store = process.env.SHOPIFY_STORE;
    const token = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
    if (!store || !token) {
      console.warn("Shopify env vars missing, skipping sync");
      return;
    }

    const baseUrl = `https://${store}.myshopify.com/admin/api/2024-10`;

    // 1) Find or create customer by email
    const searchRes = await fetch(
      `${baseUrl}/customers/search.json?query=email:${encodeURIComponent(email)}`,
      {
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
        },
      }
    );
    const searchData = await searchRes.json();
    let customer = searchData.customers?.[0];

    if (!customer) {
      // Create customer if not found
      const createRes = await fetch(`${baseUrl}/customers.json`, {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customer: {
            email,
            tags: "AI_Nutrition_Quiz",
          },
        }),
      });
      const createData = await createRes.json();
      customer = createData.customer;
    }

    if (!customer) {
      console.warn("Could not create or find customer for email:", email);
      return;
    }

    // 2) Create metaobject instance of type ai_plan
    const metaRes = await fetch(`${baseUrl}/metaobjects/ai_plan.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        metaobject: {
          type: "ai_plan",
          fields: [
            { key: "plan_text", value: plan_markdown || "" },
            {
              key: "products",
              value: JSON.stringify(recommended_products || []),
            },
          ],
        },
      }),
    });

    const metaData = await metaRes.json();
    const metaobjectId = metaData?.metaobject?.id;
    if (!metaobjectId) {
      console.warn("Failed to create ai_plan metaobject:", metaData);
      return;
    }

    // 3) Attach metaobject to customer via metafield ai.plan
    await fetch(`${baseUrl}/customers/${customer.id}.json`, {
      method: "PUT",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customer: {
          id: customer.id,
          tags: `${customer.tags || ""},AI_Nutrition_Quiz`.trim(),
          metafields: [
            {
              namespace: "ai",
              key: "plan",
              type: "metaobject_reference",
              value: metaobjectId,
            },
          ],
        },
      }),
    });

    console.log("Synced AI plan to Shopify for", email);
  } catch (err) {
    console.error("Failed to sync plan to Shopify:", err);
  }
}

// 🔹 Helper: sync AI plan + products to MailerLite
async function syncPlanToMailerLite(email, plan_markdown, recommended_products) {
  try {
    if (!email) return;

    const apiKey = process.env.MAILERLITE_API_KEY;
    const groupId = process.env.MAILERLITE_GROUP_ID;

    if (!apiKey || !groupId) {
      console.warn("MailerLite env vars missing, skipping MailerLite sync");
      return;
    }

    // Build a simple HTML-ish product list for {$ai_products}
    const productsHtml = (recommended_products || [])
      .map((p) => {
        const name = p.name || p.id;
        const reason = p.reason || "";
        return `<p><strong>${name}</strong><br>${reason}</p>`;
      })
      .join("\n");

    // MailerLite (new API) upsert subscriber
    // Docs pattern: POST https://connect.mailerlite.com/api/subscribers
    const resp = await fetch("https://connect.mailerlite.com/api/subscribers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        groups: [groupId],
        fields: {
          ai_plan: plan_markdown || "",
          ai_products: productsHtml || "",
        },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.warn("MailerLite sync failed:", resp.status, text);
    } else {
      console.log("Synced AI plan to MailerLite for", email);
    }
  } catch (err) {
    console.error("Failed to sync plan to MailerLite:", err);
  }
}

// Build a Set of valid product IDs so we never recommend anything else
const validProductIds = new Set(products.map((p) => p.id));

// Compact catalog summary for the prompt
const CATALOG_SUMMARY = products
  .map((p) => {
    const dietary = p.dietary?.join(", ") || "none";
    const allergens = p.allergens?.join(", ") || "none";
    const flavor = p.flavor || "unspecified";

    return `- id: ${p.id}
  name: ${p.name}
  price: $${p.price}
  netCarbs: ${p.netCarbs}g, protein: ${p.protein}g, fiber: ${p.fiber}g
  flavor: ${flavor}
  dietary: ${dietary}
  allergens: ${allergens}`;
  })
  .join("\n\n");

function buildSystemPrompt() {
  return `
You are the AI nutrition assistant for Daily N'Oats, a low-carb, high-protein,
blood-sugar-friendly breakfast brand.

You design simple, realistic breakfast routines using ONLY Daily N'Oats products.

PREPARATION RULES (IMPORTANT):
- Do NOT say "just add water and enjoy".
- Do NOT say "prepare clean water" or "clean water".
- When describing how to make Daily N'Oats, default to:
  "Either add milk and let it sit overnight or cook it. We suggest cooking it."
- You may optionally mention almond milk, oat milk, or other milk alternatives,
  but the phrasing must always center on adding milk, not water.

LANGUAGE RULES (IMPORTANT):
- Do NOT refer to "oats" generically.
- Always say "Daily N'Oats", "Daily N'Oats servings", or "Daily N'Oats cups".
- For weekly prep, prefer phrases like:
  "Portion your Daily N'Oats servings for the week" or
  "Pre-portion your Daily N'Oats cups into containers for the week."

DAILY N'OATS PRODUCT CATALOG (SOURCE OF TRUTH):

${CATALOG_SUMMARY}

STRICT RULES:
- You may recommend ONLY products whose "id" appears in the catalog above.
- You MUST NOT mention or recommend any other brands or generic items
  (for example: do NOT mention "Classic Steel Cut Oats", "SCO-001",
  or any product not listed in the catalog).
- When you talk about a product, use its catalog name (e.g., "30-DAY RESET BUNDLE",
  "Naked N'Oats", "Daily N'Oats 6-Pack").
- Consider dietary preferences, allergens, health goals, and convenience.
- Favor bundles (e.g., 30-day reset or variety bundles) when the customer wants structure.
- For GLP-1 / weight loss / diabetes / blood sugar goals, prioritize:
  - 30-DAY RESET BUNDLE (weight-loss-bundle)
  - THE DAILY N'OATS GLP-1 BUNDLE (30-day-glp-bundle)
  - other high-protein, keto, sugar-free, gluten-free products.
- If a product contains nuts, avoid it when the customer indicates nut allergy.

Tone: warm, encouraging, practical. You do NOT give medical advice.
You always include a short disclaimer that the plan is general information only.`;
}

function buildUserPrompt(profile) {
  return `
Create a personalized Daily N'Oats breakfast plan for this customer.

CUSTOMER PROFILE (JSON):
${JSON.stringify(profile, null, 2)}

TASK:
1. Design a clear, easy-to-follow Daily N'Oats routine for 7–30 days.
2. Tie recommendations explicitly to Daily N'Oats products from the catalog by id.
3. Take into account:
   - goal (weight loss, GLP-1 support, gut health, energy, etc.)
   - dietary restrictions (keto, vegan, gluten-free, dairy-free, etc.)
   - health conditions (e.g., diabetes, pre-diabetes, high cholesterol)
   - activity_level (sedentary, moderately active, very active)
   - timing (breakfast, pre-workout, post-workout, snack)
   - flavor preferences
   - prep_time and convenience
4. Prefer a small number of core products that the customer can use consistently,
   with optional variety suggestions.

OUTPUT FORMAT:
Return ONLY valid JSON (no markdown, no extra commentary) in this exact structure:

{
  "plan_markdown": "string, a well-formatted Markdown plan that can be rendered on a web page",
  "recommended_products": [
    {
      "id": "product-id-from-catalog",
      "reason": "one or two short sentences explaining why this product is a good fit"
    }
  ]
}

REQUIREMENTS:
- "recommended_products" must contain between 2 and 6 items.
- Every "id" MUST match one of the product ids in the catalog.
- In "plan_markdown", mention the products by their names (not just ids).
- DO NOT embed JSON in the markdown. "recommended_products" must be a real JSON array.
- Include a short weekly prep guide and guidance for the first 2–4 weeks.
- End "plan_markdown" with a short disclaimer:
  "This plan is for general information only and is not medical advice.
  Please consult your healthcare provider for personalized recommendations."`;
}

app.post("/api/nutrition-plan", async (req, res) => {
  try {
    const {
      email,
      goal,
      restrictions,
      health_conditions,
      activity_level,
      timing,
      flavors,
      prep_time,
      priority,
    } = req.body || {};

    const profile = {
      email: email || null,
      goal: goal || null,
      restrictions: restrictions || [],
      health_conditions: health_conditions || [],
      activity_level: activity_level || null,
      timing: timing || [],
      flavors: flavors || [],
      prep_time: prep_time || null,
      priority: priority || null,
    };

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(profile);

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) {
      throw new Error("No content returned from OpenAI");
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error("Failed to parse JSON from model:", raw);
      throw new Error("Model did not return valid JSON.");
    }

    const plan_markdown = parsed.plan_markdown || "";
    const recommended_products_raw = Array.isArray(parsed.recommended_products)
      ? parsed.recommended_products
      : [];

    // Filter & sanitize recommended products
    const recommended_products = recommended_products_raw
      .filter(
        (item) =>
          item &&
          typeof item.id === "string" &&
          validProductIds.has(item.id.trim())
      )
      .map((item) => ({
        id: item.id.trim(),
        reason: String(item.reason || "").trim(),
      }));

    // Attach extra product metadata
    const annotated_recommendations = recommended_products.map((item) => {
      const product = products.find((p) => p.id === item.id);
      return {
        ...item,
        name: product?.name || item.id,
        price: product?.price ?? null,
        dietary: product?.dietary ?? null,
        netCarbs: product?.netCarbs ?? null,
        protein: product?.protein ?? null,
        fiber: product?.fiber ?? null,
      };
    });

    // 🔹 Push plan to Shopify (if configured)
    syncPlanToShopify(profile.email, plan_markdown, annotated_recommendations);

    // 🔹 Push plan to MailerLite (if configured)
    syncPlanToMailerLite(profile.email, plan_markdown, annotated_recommendations);

    // Respond to browser as before
    res.json({
      plan_markdown,
      recommended_products: annotated_recommendations,
    });
  } catch (err) {
    console.error("Server error:", err);
    const message =
      err?.response?.data?.error?.message || err.message || "Unknown error";
    res.status(500).json({
      error: "Server error",
      message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Daily N'Oats AI server running on port ${PORT}`);
});
