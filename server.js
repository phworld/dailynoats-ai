// server.js
// Daily N'Oats AI backend (stabilized version)
// - /api/nutrition-plan
// - /api/recipes
// - /api/recipe-convert (TEXT ONLY for now)
// - /health

import express from "express";
import cors from "cors";
import OpenAI from "openai";
import products from "./products_catalog.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "5mb" })); // JSON only for now

if (!process.env.OPENAI_API_KEY) {
  console.warn(
    "WARNING: OPENAI_API_KEY is not set. Start the server with:\n" +
      'OPENAI_API_KEY="sk-..." npm start'
  );
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Models
const TEXT_MODEL = process.env.TEXT_MODEL || "gpt-4.1-mini";

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Transform page URL
const TRANSFORM_URL = "/pages/transform-your-mornings";

/* -------------------------------------------------------
   Shopify + MailerLite helpers (same as before)
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

    // 1) Find/create customer
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

    // 3) Attach metaobject to customer via metafield
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
   Shared catalog helpers
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
   /api/nutrition-plan (same behavior as before)
   ------------------------------------------------------- */

function buildSystemPrompt() {
  return `
You are the AI nutrition assistant for Daily N'Oats, a low-carb, high-protein,
blood-sugar-friendly breakfast brand.

You design simple, realistic breakfast routines using ONLY Daily N'Oats products.

PREPARATION RULES:
- Do NOT say "just add water and enjoy".
- Do NOT say "prepare clean water" or "clean water".
- When describing how to make Daily N'Oats, default to:
  "Either add milk and let it sit overnight or cook it. We suggest cooking it."

LANGUAGE RULES:
- Do NOT refer to "oats" generically.
- Always say "Daily N'Oats", "Daily N'Oats servings", or "Daily N'Oats cups".

DAILY N'OATS PRODUCT CATALOG:

${CATALOG_SUMMARY}

STRICT RULES:
- Recommend ONLY products whose "id" appears in the catalog.
- Do NOT mention other brands or generic items.
- Favor bundles for structured plans.
- Adjust for dietary restrictions and allergies.

Tone: warm, encouraging, practical. Not medical advice.`;
}

function buildUserPrompt(profile) {
  return `
Create a personalized Daily N'Oats breakfast plan.

CUSTOMER PROFILE:
${JSON.stringify(profile, null, 2)}

TASK:
1. Design a 7–30 day Daily N'Oats routine.
2. Tie recommendations explicitly to product ids from the catalog.
3. Consider goal, restrictions, health conditions, activity, timing, flavors, prep time, and priority.
4. Prefer a small set of core products with optional variety.

OUTPUT FORMAT (JSON):

{
  "plan_markdown": "string, markdown-formatted plan",
  "recommended_products": [
    {
      "id": "product-id-from-catalog",
      "reason": "one or two short sentences"
    }
  ]
}

REQUIREMENTS:
- 2–6 recommended products.
- All ids MUST be valid catalog ids.
- Mention products by *name* in markdown, not just id.
- End plan_markdown with:
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
      model: TEXT_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) throw new Error("No content returned from OpenAI");

    console.log("OpenAI nutrition-plan raw:", raw);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error("Failed to parse JSON from nutrition model:", raw);
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

    // Fire-and-forget syncs
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
    res.status(500).json({
      error: "Server error",
      message: err.message || "Unknown error",
    });
  }
});

/* -------------------------------------------------------
   /api/recipes  (simple recipes, same as before)
   ------------------------------------------------------- */

function buildRecipeSystemPrompt() {
  return `
You are the AI recipe developer for Daily N'Oats.

Create delicious, practical recipes using ONLY Daily N'Oats products as the base.
You may add common toppings/mix-ins (berries, nuts, seeds, etc.) but the base
must always be a Daily N'Oats product.

Use the catalog below for reference:

${RECIPE_CATALOG_SUMMARY}

IMPORTANT JSON INSTRUCTIONS:
- You will ultimately return your answer as a single JSON object.
- Do NOT include any markdown, prose, or explanations outside of JSON.
- All fields you return must be valid JSON keys/values, not comments.`;
}

function buildRecipeUserPrompt(payload) {
  return `
Create 1–3 Daily N'Oats recipes.

INPUT DATA (JSON-like):
${JSON.stringify(payload, null, 2)}

You MUST respond with ONLY valid JSON (no markdown, no commentary), in exactly
this structure:

{
  "recipes": [
    {
      "title": "string",
      "description": "string",
      "base_products": ["product-id-from-catalog"],
      "ingredients": [
        { "item": "string", "amount": "string", "notes": "optional" }
      ],
      "steps": ["Step 1...", "Step 2..."],
      "macros": {
        "calories": number,
        "netCarbs": number,
        "protein": number,
        "fat": number,
        "fiber": number
      },
      "tags": ["keto", "weight loss"],
      "servings": number
    }
  ]
}

REQUIREMENTS:
- "recipes" MUST be a JSON array (1–3 items).
- Every "base_products" id MUST match one of the product ids in the catalog.
- Steps MUST describe how to prepare Daily N'Oats (you may say:
  "Either add milk and let it sit overnight or cook it. We suggest cooking it.")
- The LAST recipe's "description" MUST include this sentence:
  "This recipe suggestion is for general information only and is not medical advice."

Again: reply with a single JSON object only.`;
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
    if (!raw) throw new Error("No content returned from OpenAI for recipes");

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

/* -------------------------------------------------------
   /api/recipe-convert  (TEXT ONLY, no OCR yet)
   ------------------------------------------------------- */

function buildRecipeConvertSystemPrompt() {
  return `
You are a recipe conversion specialist for Daily N'Oats, a low-carb oatmeal alternative.

Convert high-carb recipes (oatmeal, baked oats, overnight oats, cookies, granola, etc.)
into low-carb Daily N'Oats versions.

RETURN JSON WITH THIS SHAPE:

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
    "high_carb_ingredients": ["string"],
    "notes": "parser notes or assumptions"
  },
  "converted_recipe": {
    "title": "string",
    "description": "string (include disclaimer)",
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

IMPORTANT:
- Always mention "Daily N'Oats", not generic oats.
- If you are not confident, set status to "partial" or "error" and explain in warnings.
- Include this sentence in converted_recipe.description:
  "This recipe suggestion is for general information only and is not medical advice."`;
}

function buildRecipeConvertUserPrompt(payload) {
  return `
Convert this recipe text to a low-carb Daily N'Oats version.

RECIPE TEXT:
${payload.recipe_text}

DIETARY RESTRICTIONS:
${JSON.stringify(payload.dietary_restrictions || [])}

USER PREFERENCES:
${JSON.stringify(payload.user_preferences || {})}

Follow the JSON schema provided in the system prompt exactly.`;
}

app.post("/api/recipe-convert", async (req, res) => {
  try {
    const {
      input_type,
      recipe_data,
      dietary_restrictions,
      user_preferences,
    } = req.body || {};

    const text = typeof recipe_data === "string" ? recipe_data.trim() : "";
    if (!text) {
      return res.status(400).json({
        error: "no_input",
        message: "Please provide recipe text to convert.",
      });
    }

    const payload = {
      recipe_text: text,
      dietary_restrictions:
        Array.isArray(dietary_restrictions) && dietary_restrictions.length
          ? dietary_restrictions
          : [],
      user_preferences: user_preferences || {},
      input_type: input_type || "text",
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
    if (!raw) throw new Error("No content returned from OpenAI for recipe-convert");

    console.log("OpenAI recipe-convert raw:", raw);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error("Failed to parse JSON from recipe-convert model:", raw);
      throw new Error("Model did not return valid JSON for recipe conversion.");
    }

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