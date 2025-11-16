// server.js
// Daily N'Oats AI backend
// - /api/nutrition-plan  (quiz -> plan + product recs + MailerLite/Shopify sync)
// - /api/recipes         (simple Daily N'Oats recipes)
// - /api/recipe-convert  (full recipe converter, with optional image OCR)

import express from "express";
import cors from "cors";
import OpenAI from "openai";
import products from "./products_catalog.js";

const app = express();
const PORT = process.env.PORT || 4000;

// 🔹 Central place for the Transform page URL (used by other endpoints)
const TRANSFORM_URL = "/pages/transform-your-mornings";

app.use(cors());
app.use(express.json({ limit: "10mb" })); // allow base64 images

if (!process.env.OPENAI_API_KEY) {
  console.warn(
    "WARNING: OPENAI_API_KEY is not set. Start the server with:\n" +
      'OPENAI_API_KEY="sk-..." npm start'
  );
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// For multi-modal / OCR you may optionally override via env
const OCR_MODEL = process.env.OCR_MODEL || "gpt-4o-mini"; // must support vision
const TEXT_MODEL = process.env.TEXT_MODEL || "gpt-4.1-mini";

/* -------------------------------------------------------
   HELPER: Sync AI plan to Shopify (optional)
   ------------------------------------------------------- */

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
      `${baseUrl}/customers/search.json?query=email:${encodeURIComponent(
        email
      )}`,
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

    let metaData = null;
    try {
      metaData = await metaRes.json();
    } catch (e) {
      console.warn("Shopify metaobject response was not JSON:", e);
      return;
    }

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

/* -------------------------------------------------------
   HELPER: Sync AI plan to MailerLite (for email automation)
   ------------------------------------------------------- */

async function syncPlanToMailerLite(email, plan_markdown, recommended_products) {
  try {
    if (!email) return;

    const apiKey = process.env.MAILERLITE_API_KEY;
    const groupId = process.env.MAILERLITE_GROUP_ID;
    if (!apiKey || !groupId) {
      console.warn("MailerLite env vars missing, skipping MailerLite sync");
      return;
    }

    const MAX_LEN = 900;

    let planShort = plan_markdown || "";
    if (planShort.length > MAX_LEN) {
      planShort = planShort.slice(0, MAX_LEN - 3) + "...";
    }

    const productsSummary = (recommended_products || [])
      .map(
        (p) =>
          `${p.name || p.id}: ${(p.reason || "").replace(/\s+/g, " ").trim()}`
      )
      .join(" | ");

    let productsShort = productsSummary;
    if (productsShort.length > MAX_LEN) {
      productsShort = productsShort.slice(0, MAX_LEN - 3) + "...";
    }

    const resp = await fetch("https://connect.mailerlite.com/api/subscribers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        email,
        groups: [groupId],
        fields: {
          ai_plan: planShort,
          ai_products: productsShort,
        },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("MailerLite sync failed:", resp.status, text);
      return;
    }

    console.log("Synced AI plan to MailerLite for", email);
  } catch (err) {
    console.error("MailerLite sync error:", err);
  }
}

/* -------------------------------------------------------
   Shared product catalog helpers
   ------------------------------------------------------- */

const validProductIds = new Set(products.map((p) => p.id));

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

const RECIPE_CATALOG_SUMMARY = products
  .map((p) => {
    const dietary = p.dietary?.join(", ") || "none";
    const flavor = p.flavor || "unspecified";

    return `- id: ${p.id}
  name: ${p.name}
  flavor: ${flavor}
  dietary: ${dietary}
  netCarbs: ${p.netCarbs}g, protein: ${p.protein}g, fiber: ${p.fiber}g`;
  })
  .join("\n\n");

/* -------------------------------------------------------
   PROMPTS: Nutrition plan (/api/nutrition-plan)
   ------------------------------------------------------- */

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
- You MUST NOT mention or recommend any other brands or generic items.
- When you talk about a product, use its catalog name.
- Consider dietary preferences, allergens, health goals, and convenience.
- Favor bundles when the customer wants structure.
- For GLP-1 / weight loss / diabetes / blood sugar goals, prioritize:
  - 30-DAY RESET BUNDLE (weight-loss-bundle)
  - THE DAILY N'OATS GLP-1 BUNDLE (30-day-glp-bundle)
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
   - goal
   - dietary restrictions
   - health conditions
   - activity_level
   - timing
   - flavor preferences
   - prep_time and convenience
4. Prefer a small number of core products, with optional variety suggestions.

OUTPUT FORMAT:
Return ONLY valid JSON in this exact structure:

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
- DO NOT embed JSON in the markdown.
- Include a short weekly prep guide and guidance for the first 2–4 weeks.
- End "plan_markdown" with:
  "This plan is for general information only and is not medical advice.
  Please consult your healthcare provider for personalized recommendations."`;
}

/* -------------------------------------------------------
   Route: /api/nutrition-plan
   ------------------------------------------------------- */

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
      model: TEXT_MODEL,
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

    console.log("OpenAI nutrition-plan raw:", raw);

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

    // fire-and-forget syncs
    syncPlanToMailerLite(
      profile.email,
      plan_markdown,
      annotated_recommendations
    ).catch((e) => console.error("MailerLite sync error:", e));

    syncPlanToShopify(
      profile.email,
      plan_markdown,
      annotated_recommendations
    ).catch((e) => console.error("Shopify sync error:", e));

    res.json({
      plan_markdown,
      recommended_products: annotated_recommendations,
      transform_url: TRANSFORM_URL,
    });
  } catch (err) {
    console.error("Server error (/api/nutrition-plan):", err);
    const message =
      err?.response?.data?.error?.message || err.message || "Unknown error";
    res.status(500).json({
      error: "Server error",
      message,
    });
  }
});

/* =======================================================
   Simple recipes route: /api/recipes (unchanged)
   ======================================================= */

function buildRecipeSystemPrompt() {
  return `
You are the AI recipe developer for Daily N'Oats, a low-carb, high-protein,
blood-sugar-friendly breakfast brand.

Your job is to create DELICIOUS, PRACTICAL RECIPES using ONLY Daily N'Oats products.

PREPARATION RULES (IMPORTANT):
- Do NOT say "just add water and enjoy".
- Do NOT say "prepare clean water" or "clean water".
- When describing how to make Daily N'Oats, always default to:
  "Either add milk and let it sit overnight or cook it. We suggest cooking it."

LANGUAGE RULES (IMPORTANT):
- Do NOT refer to "oats" generically.
- Always say "Daily N'Oats", "Daily N'Oats servings", or "Daily N'Oats cups".

PRODUCT RULES:
- You may recommend ONLY products whose "id" appears in the catalog below.
- You MUST NOT mention or recommend any other brands or generic products as the base.
- You can add common toppings or mix-ins (berries, nuts, seeds, yogurt, etc.)
  but the core base must always be a Daily N'Oats product.

DAILY N'OATS PRODUCT CATALOG:

${RECIPE_CATALOG_SUMMARY}

TONE:
- Warm, encouraging, practical.
- You do NOT give medical advice.

You will receive a JSON payload describing the customer's preferences.`;
}

function buildRecipeUserPrompt(payload) {
  return `
Create 1–3 Daily N'Oats recipes tailored for this customer.

INPUT (JSON):
${JSON.stringify(payload, null, 2)}

TASK:
- Design between 1 and 3 recipes.
- Each recipe MUST:
  - Use at least one Daily N'Oats product from "base_product_ids".
  - Respect dietary and flavor preferences.
  - Fit their "goal" and "prep_time".
  - Use the preparation wording:
    "Either add milk and let it sit overnight or cook it. We suggest cooking it."

OUTPUT FORMAT:
Return ONLY valid JSON exactly in this structure:

{
  "recipes": [
    {
      "title": "string",
      "description": "1–2 sentence description",
      "base_products": ["product-id-from-catalog"],
      "ingredients": [
        {
          "item": "ingredient name",
          "amount": "quantity + unit",
          "notes": "optional extra context"
        }
      ],
      "steps": [
        "Step 1...",
        "Step 2..."
      ],
      "macros": {
        "calories": number,
        "netCarbs": number,
        "protein": number,
        "fat": number,
        "fiber": number
      },
      "tags": ["weight loss", "keto", "glp1-friendly"],
      "servings": number
    }
  ]
}

RULES:
- "recipes" MUST be a JSON array.
- Every "base_products" id MUST match one of the product ids in the catalog.
- Include this disclaimer sentence in the description of the LAST recipe:
  "This recipe suggestion is for general information only and is not medical advice."`;
}

app.post("/api/recipes", async (req, res) => {
  try {
    const {
      goal,
      dietary,
      flavors,
      prep_time,
      style,
      base_product_ids,
      servings,
    } = req.body || {};

    const payload = {
      goal: goal || "general wellness",
      dietary: Array.isArray(dietary) ? dietary : dietary ? [dietary] : [],
      flavors: Array.isArray(flavors) ? flavors : flavors ? [flavors] : [],
      prep_time: prep_time || "under 10 minutes",
      style: style || "warm bowl",
      base_product_ids:
        Array.isArray(base_product_ids) && base_product_ids.length
          ? base_product_ids
          : products.map((p) => p.id),
      servings: servings || 1,
    };

    const systemPrompt = buildRecipeSystemPrompt();
    const userPrompt = buildRecipeUserPrompt(payload);

    const completion = await client.chat.completions.create({
      model: TEXT_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) {
      throw new Error("No content returned from OpenAI for recipes");
    }

    console.log("OpenAI recipes raw:", raw);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error("Failed to parse JSON from recipe model:", raw);
      throw new Error("Model did not return valid JSON for recipes.");
    }

    const recipes_raw = Array.isArray(parsed.recipes) ? parsed.recipes : [];
    const validIds = new Set(products.map((p) => p.id));

    const recipes = recipes_raw.map((r) => {
      const base_products = Array.isArray(r.base_products)
        ? r.base_products.filter((id) => validIds.has(id))
        : [];

      return {
        title: r.title || "Daily N'Oats Recipe",
        description: r.description || "",
        base_products,
        ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
        steps: Array.isArray(r.steps) ? r.steps : [],
        macros: r.macros || null,
        tags: Array.isArray(r.tags) ? r.tags : [],
        servings: r.servings || payload.servings || 1,
      };
    });

    res.json({
      recipes,
      transform_url: TRANSFORM_URL,
    });
  } catch (err) {
    console.error("Recipe API error (/api/recipes):", err);
    res.status(500).json({
      error: "Server error",
      message: err.message || "Unknown error generating recipes",
    });
  }
});

/* =======================================================
   NEW: /api/recipe-convert  (text + optional image OCR)
   ======================================================= */

// Very compact system prompt that encapsulates your full spec
function buildRecipeConvertSystemPrompt() {
  return `
You are a recipe conversion specialist for Daily N'Oats, a low-carb oatmeal alternative.

Your job:
- Ingest recipes (text extracted from user input and/or OCR)
- Convert them to low-carb Daily N'Oats versions
- Estimate nutrition
- Return a single JSON payload for the frontend.

IMPORTANT:
- Base product is Daily N'Oats (lupin-based, low net carbs, higher protein and fiber).
- Follow the detailed conversion rules:
  - Replace oats 1:1 with Daily N'Oats when appropriate
  - Replace high-carb sweeteners with low-carb options
  - Swap dried fruit & bananas for lower-carb options
  - Adjust liquids for Daily N'Oats texture
- Respect dietary restrictions and preferences where possible.
- Be realistic: if a recipe is hard to convert, explain why.

OUTPUT FORMAT (MUST use this exact structure):

{
  "status": "success" | "partial" | "error",
  "original_recipe": {
    "title": "string",
    "description": "string",
    "ingredients": [
      { "item": "name", "amount": "quantity + unit", "notes": "optional" }
    ],
    "steps": ["Step 1...", "Step 2..."],
    "prep_time": "string",
    "cook_time": "string",
    "servings": number,
    "nutrition_estimate": {
      "calories": number,
      "total_carbs": number,
      "fiber": number,
      "net_carbs": number,
      "protein": number,
      "fat": number
    },
    "high_carb_ingredients": ["string", "string"],
    "notes": "parser notes or assumptions"
  },
  "converted_recipe": {
    "title": "string",
    "description": "string",
    "ingredients": [
      { "item": "name", "amount": "quantity + unit", "notes": "optional" }
    ],
    "instructions": ["Step 1...", "Step 2..."],
    "quick_stats": {
      "prep_time": "string",
      "cook_time": "string",
      "servings": number,
      "net_carbs_per_serving": number,
      "original_net_carbs_per_serving": number
    },
    "nutrition_per_serving": {
      "calories": number,
      "total_carbs": number,
      "fiber": number,
      "net_carbs": number,
      "protein": number,
      "fat": number
    },
    "chef_notes": {
      "texture_and_flavor": "string",
      "make_ahead_and_storage": "string",
      "variations": ["string"],
      "pro_tips": ["string"],
      "why_this_works": "string"
    }
  },
  "nutritional_comparison": {
    "original": {
      "calories": number,
      "net_carbs": number,
      "protein": number,
      "fat": number
    },
    "converted": {
      "calories": number,
      "net_carbs": number,
      "protein": number,
      "fat": number
    },
    "net_carb_reduction_percent": number,
    "macro_breakdown_converted": {
      "percent_protein": number,
      "percent_fat": number,
      "percent_carbs": number
    }
  },
  "confidence_score": number,
  "warnings": ["string"],
  "suggested_variations": [
    { "title": "string", "description": "string" }
  ]
}

RULES:
- If the recipe cannot be confidently converted (e.g., too little information), set "status" to "partial" or "error" and explain in "warnings".
- Use Daily N'Oats language precisely; do not refer to generic "oats".
- Do NOT embed JSON as a string; return a real JSON object.
- Include the disclaimer sentence in the converted description:
  "This recipe suggestion is for general information only and is not medical advice."`;
}

function buildRecipeConvertUserPrompt(payload) {
  return `
Convert this recipe to a low-carb Daily N'Oats version.

INPUT:
- Extracted recipe text:
${payload.recipe_text ? payload.recipe_text : "[none]"}

- Dietary restrictions: ${JSON.stringify(payload.dietary_restrictions || [])}
- User preferences: ${JSON.stringify(payload.user_preferences || {})}

TASK:
1. Parse the original recipe (title, ingredients, steps, timing, servings).
2. Identify high-carb ingredients and Daily N'Oats substitution opportunities.
3. Create a complete low-carb Daily N'Oats version following the conversion rules.
4. Estimate nutrition for both original and converted versions.
5. Fill in the JSON structure exactly as specified in the system prompt.
6. If information is missing or unclear, make reasonable assumptions and list them in "warnings".`;
}

// OCR helper – images only. PDFs are not fully supported yet.
async function extractTextFromFiles(files = []) {
  const images = files.filter((f) => f.type?.startsWith("image/"));

  if (!images.length) {
    return null;
  }

  // Limit to a few images to keep prompt size under control
  const subset = images.slice(0, 4);

  const contentParts = [
    {
      type: "text",
      text: "You are performing OCR on recipe images. Read all visible text and return ONLY the combined recipe text (title, ingredients, instructions) as plain text.",
    },
  ];

  for (const img of subset) {
    if (!img.data || !img.type) continue;
    const dataUrl = `data:${img.type};base64,${img.data}`;
    contentParts.push({
      type: "image_url",
      image_url: { url: dataUrl },
    });
  }

  const completion = await client.chat.completions.create({
    model: OCR_MODEL,
    messages: [
      {
        role: "user",
        content: contentParts,
      },
    ],
  });

  const text = completion.choices?.[0]?.message?.content || "";
  return text.trim() || null;
}

app.post("/api/recipe-convert", async (req, res) => {
  try {
    const {
      input_type,
      recipe_data,
      dietary_restrictions,
      user_preferences,
      files,
    } = req.body || {};

    // Basic validation
    const hasText = typeof recipe_data === "string" && recipe_data.trim().length;
    const hasFiles = Array.isArray(files) && files.length > 0;

    if (!hasText && !hasFiles) {
      return res.status(400).json({
        error: "no_input",
        message: "Please provide recipe text or at least one file.",
      });
    }

    // PDF guard: we won't crash; we just explain
    const pdfOnly =
      hasFiles &&
      files.every((f) => f.type === "application/pdf" || f.name?.endsWith(".pdf"));
    if (pdfOnly && !hasText) {
      return res.status(400).json({
        error: "pdf_not_supported",
        message:
          "PDF OCR is not fully supported yet. Please paste the text of your recipe or upload images instead.",
      });
    }

    // If we have images, try OCR to supplement recipe text
    let ocrText = null;
    if (hasFiles) {
      try {
        ocrText = await extractTextFromFiles(files);
      } catch (ocrErr) {
        console.warn("Image OCR failed:", ocrErr);
      }
    }

    const combinedRecipeText = [recipe_data || "", ocrText || ""]
      .map((s) => (s || "").trim())
      .filter(Boolean)
      .join("\n\n");

    if (!combinedRecipeText) {
      return res.status(400).json({
        error: "empty_after_ocr",
        message:
          "We couldn’t read any text from your recipe. Please try pasting the recipe manually or upload clearer images.",
      });
    }

    const payload = {
      recipe_text: combinedRecipeText,
      dietary_restrictions:
        Array.isArray(dietary_restrictions) && dietary_restrictions.length
          ? dietary_restrictions
          : [],
      user_preferences: user_preferences || {},
    };

    const systemPrompt = buildRecipeConvertSystemPrompt();
    const userPrompt = buildRecipeConvertUserPrompt(payload);

    const completion = await client.chat.completions.create({
      model: TEXT_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) {
      throw new Error("No content returned from OpenAI for recipe-convert");
    }

    console.log("OpenAI recipe-convert raw:", raw);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error("Failed to parse JSON from recipe-convert model:", raw);
      throw new Error("Model did not return valid JSON for recipe conversion.");
    }

    // Minimal sanity defaults so the frontend renderers don't crash
    const responsePayload = {
      status: parsed.status || "success",
      original_recipe: parsed.original_recipe || {},
      converted_recipe: parsed.converted_recipe || {},
      nutritional_comparison: parsed.nutritional_comparison || {},
      confidence_score:
        typeof parsed.confidence_score === "number"
          ? parsed.confidence_score
          : 0.9,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      suggested_variations: Array.isArray(parsed.suggested_variations)
        ? parsed.suggested_variations
        : [],
    };

    res.json(responsePayload);
  } catch (err) {
    console.error("Recipe-convert API error (/api/recipe-convert):", err);
    res.status(500).json({
      error: "Server error",
      message: err.message || "Unknown error converting recipe",
    });
  }
});

/* -------------------------------------------------------
   Start server
   ------------------------------------------------------- */

app.listen(PORT, () => {
  console.log(`Daily N'Oats AI server running on port ${PORT}`);
});