<div class="page-width dn-recipe-converter" style="max-width:900px; margin:0 auto;">
  <h1>Daily N'Oats AI Recipe Converter</h1>
  <p>
    Paste any oatmeal recipe, drop in a photo or PDF, and our AI will transform it
    into a <strong>low-carb Daily N'Oats version</strong> with macros, chef notes,
    and carb savings.
  </p>

  <!-- INPUT MODE SELECTOR -->
  <div style="margin:1.5rem 0; display:flex; gap:8px; flex-wrap:wrap;">
    <button type="button" data-mode="text" class="dn-mode-btn dn-mode-btn--active">
      Paste Recipe Text
    </button>
    <button type="button" data-mode="url" class="dn-mode-btn">
      Import from URL
    </button>
    <button type="button" data-mode="upload" class="dn-mode-btn">
      Upload Image / PDF
    </button>
  </div>

  <!-- TEXT INPUT -->
  <div id="dn-input-text" class="dn-input-panel">
    <label><strong>Paste your recipe:</strong></label>
    <textarea id="dn-recipe-text" rows="8" style="width:100%; border-radius:8px; padding:10px; border:1px solid #d3ddc9;"
      placeholder="Paste the full recipe here: title, ingredients, instructions, servings, etc."></textarea>
  </div>

  <!-- URL INPUT -->
  <div id="dn-input-url" class="dn-input-panel" style="display:none;">
    <label><strong>Recipe URL:</strong></label>
    <input id="dn-recipe-url" type="url" style="width:100%; border-radius:8px; padding:10px; border:1px solid #d3ddc9;"
      placeholder="https://example.com/your-favorite-oatmeal-recipe">
    <p style="font-size:0.9rem; color:#66705e;">
      We'll attempt to extract just the recipe (title, ingredients, instructions).
    </p>
  </div>

  <!-- UPLOAD (IMAGE/PDF) -->
  <div id="dn-input-upload" class="dn-input-panel" style="display:none;">
    <label><strong>Upload recipe image(s) or PDF:</strong></label>
    <div id="dn-dropzone"
      style="
        margin-top:8px;
        border:2px dashed #c1cfb4;
        border-radius:12px;
        padding:20px;
        text-align:center;
        cursor:pointer;
        background:#f8faf5;
      ">
      <p style="margin:0 0 4px;">📎 Drag & drop recipe image(s) or a PDF here</p>
      <p style="margin:0; font-size:0.9rem; color:#66705e;">
        Accepts JPG, PNG, PDF. You can upload <strong>multiple images</strong> for multi-page recipes.
      </p>
    </div>
    <input id="dn-file-input" type="file" accept="image/*,application/pdf" multiple style="display:none;">
    <div id="dn-upload-preview" style="margin-top:1rem;"></div>
  </div>

  <!-- DIETARY + PREFS -->
  <div style="margin-top:1.5rem;">
    <h3>Optional: Tailor the conversion</h3>
    <div style="display:flex; flex-wrap:wrap; gap:24px;">
      <div>
        <p style="margin-bottom:4px;"><strong>Dietary restrictions:</strong></p>
        <label><input type="checkbox" name="dn-diet" value="vegan"> Vegan</label><br>
        <label><input type="checkbox" name="dn-diet" value="dairy-free"> Dairy-free</label><br>
        <label><input type="checkbox" name="dn-diet" value="nut-free"> Nut-free</label><br>
        <label><input type="checkbox" name="dn-diet" value="keto"> Strict keto</label><br>
      </div>
      <div>
        <p style="margin-bottom:4px;"><strong>Preferred sweetener:</strong></p>
        <select id="dn-pref-sweetener" style="min-width:200px;">
          <option value="">No strong preference</option>
          <option value="erythritol">Erythritol</option>
          <option value="monk-fruit">Monk fruit</option>
          <option value="stevia">Stevia</option>
        </select>
        <p style="margin:0.5rem 0 4px;"><strong>Preferred milk type:</strong></p>
        <select id="dn-pref-milk" style="min-width:200px;">
          <option value="">No strong preference</option>
          <option value="almond">Unsweetened almond milk</option>
          <option value="coconut">Unsweetened coconut milk</option>
          <option value="cashew">Unsweetened cashew milk</option>
        </select>
      </div>
    </div>
  </div>

  <!-- PROGRESS STEPS -->
  <div style="margin-top:1.5rem; padding:12px 16px; border-radius:12px; background:#f5f8f2;">
    <div style="font-weight:600; margin-bottom:8px;">Conversion progress</div>
    <ol id="dn-progress-list" style="padding-left:1.2rem; margin:0; font-size:0.95rem;">
      <li data-step="intake">1. Intake & recipe understanding</li>
      <li data-step="analysis">2. Analyze carbs & swap opportunities</li>
      <li data-step="conversion">3. Convert to Daily N'Oats low-carb version</li>
      <li data-step="nutrition">4. Estimate nutrition & carb savings</li>
      <li data-step="format">5. Format for easy cooking</li>
    </ol>
  </div>

  <!-- SUBMIT BUTTON + STATUS -->
  <div style="margin-top:1.5rem;">
    <button id="dn-convert-btn"
      style="
        background:#2c5f2d;
        color:#fff;
        border:none;
        border-radius:999px;
        padding:10px 24px;
        font-weight:600;
        cursor:pointer;
      ">
      Convert My Recipe to Daily N'Oats
    </button>
    <span id="dn-status-text" style="margin-left:10px; font-size:0.9rem; color:#66705e;"></span>
  </div>

  <!-- RESULTS -->
  <div id="dn-results" style="margin-top:2rem; display:none;">
    <h2>Converted Recipe</h2>
    <div id="dn-converted"></div>

    <h2 style="margin-top:2rem;">Original Recipe (Structured)</h2>
    <div id="dn-original"></div>

    <h2 style="margin-top:2rem;">Why This Swap Works</h2>
    <div id="dn-meta"></div>

    <div style="margin-top:2rem; padding:16px 18px; border-radius:12px; background:#f8faf5; border:1px solid #d3ddc9;">
      <h3 style="margin-top:0;">Stock Up on Daily N'Oats</h3>
      <p style="margin-bottom:0.5rem;">
        Love this conversion? Keep your pantry ready so you can make it anytime.
      </p>
      <a href="/products/fab-four-bundle-30-pack"
        style="
          display:inline-block;
          background:#2c5f2d;
          color:#fff;
          padding:8px 18px;
          border-radius:999px;
          text-decoration:none;
          font-weight:600;
        ">
        Shop Fab Four Bundle (30 pack)
      </a>
    </div>
  </div>
</div>

<script>
(function() {
  // --- DOM refs ---
  const modeButtons = document.querySelectorAll(".dn-mode-btn");
  const inputTextPanel = document.getElementById("dn-input-text");
  const inputUrlPanel = document.getElementById("dn-input-url");
  const inputUploadPanel = document.getElementById("dn-input-upload");

  const textarea = document.getElementById("dn-recipe-text");
  const urlInput = document.getElementById("dn-recipe-url");
  const dropzone = document.getElementById("dn-dropzone");
  const fileInput = document.getElementById("dn-file-input");
  const uploadPreview = document.getElementById("dn-upload-preview");

  const convertBtn = document.getElementById("dn-convert-btn");
  const statusText = document.getElementById("dn-status-text");
  const progressList = document.getElementById("dn-progress-list");

  const resultsSection = document.getElementById("dn-results");
  const convertedEl = document.getElementById("dn-converted");
  const originalEl = document.getElementById("dn-original");
  const metaEl = document.getElementById("dn-meta");

  const prefSweetener = document.getElementById("dn-pref-sweetener");
  const prefMilk = document.getElementById("dn-pref-milk");

  let currentMode = "text";
  let selectedFiles = []; // File objects

  function setMode(mode) {
    currentMode = mode;
    inputTextPanel.style.display = mode === "text" ? "block" : "none";
    inputUrlPanel.style.display = mode === "url" ? "block" : "none";
    inputUploadPanel.style.display = mode === "upload" ? "block" : "none";

    modeButtons.forEach(btn => {
      const isActive = btn.getAttribute("data-mode") === mode;
      if (isActive) {
        btn.classList.add("dn-mode-btn--active");
      } else {
        btn.classList.remove("dn-mode-btn--active");
      }
    });
  }

  modeButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.getAttribute("data-mode");
      setMode(mode);
    });
  });

  // Simple styling for active mode button
  const styleEl = document.createElement("style");
  styleEl.textContent = `
    .dn-mode-btn {
      background:#f2f6ec;
      border-radius:999px;
      border:1px solid #c1cfb4;
      padding:6px 14px;
      cursor:pointer;
      font-size:0.9rem;
    }
    .dn-mode-btn--active {
      background:#2c5f2d;
      color:#fff;
      border-color:#2c5f2d;
    }
    .dn-progress-done { color:#2c5f2d; font-weight:600; }
    .dn-progress-active { color:#2c5f2d; font-weight:600; text-decoration:underline; }
  `;
  document.head.appendChild(styleEl);

  function resetProgress() {
    progressList.querySelectorAll("li").forEach(li => {
      li.classList.remove("dn-progress-done", "dn-progress-active");
      li.style.opacity = "1";
    });
  }

  function setProgress(stepKey) {
    const steps = ["intake", "analysis", "conversion", "nutrition", "format"];
    progressList.querySelectorAll("li").forEach(li => {
      const key = li.getAttribute("data-step");
      if (steps.indexOf(key) < steps.indexOf(stepKey)) {
        li.classList.add("dn-progress-done");
        li.classList.remove("dn-progress-active");
      } else if (key === stepKey) {
        li.classList.add("dn-progress-active");
      } else {
        li.classList.remove("dn-progress-done", "dn-progress-active");
      }
    });
  }

  function setStatus(msg) {
    statusText.textContent = msg || "";
  }

  // ---- Upload handling ----
  function renderFilePreview() {
    uploadPreview.innerHTML = "";
    if (!selectedFiles.length) return;

    selectedFiles.forEach(file => {
      const wrapper = document.createElement("div");
      wrapper.style.marginBottom = "8px";
      wrapper.style.display = "flex";
      wrapper.style.alignItems = "center";
      wrapper.style.gap = "8px";

      if (file.type.startsWith("image/")) {
        const img = document.createElement("img");
        img.style.width = "60px";
        img.style.height = "60px";
        img.style.objectFit = "cover";
        img.style.borderRadius = "8px";
        const reader = new FileReader();
        reader.onload = e => { img.src = e.target.result; };
        reader.readAsDataURL(file);
        wrapper.appendChild(img);
      } else {
        const icon = document.createElement("div");
        icon.textContent = "📄";
        icon.style.fontSize = "2rem";
        wrapper.appendChild(icon);
      }

      const label = document.createElement("span");
      label.textContent = file.name;
      label.style.fontSize = "0.9rem";

      wrapper.appendChild(label);
      uploadPreview.appendChild(wrapper);
    });
  }

  function handleFiles(files) {
    selectedFiles = Array.from(files || []);
    renderFilePreview();
  }

  dropzone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", e => handleFiles(e.target.files));

  ["dragenter", "dragover"].forEach(ev => {
    dropzone.addEventListener(ev, e => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.style.background = "#eef4e6";
      dropzone.style.borderColor = "#2c5f2d";
    });
  });

  ["dragleave", "drop"].forEach(ev => {
    dropzone.addEventListener(ev, e => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.style.background = "#f8faf5";
      dropzone.style.borderColor = "#c1cfb4";
    });
  });

  dropzone.addEventListener("drop", e => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length) {
      handleFiles(dt.files);
    }
  });

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result || "";
        const parts = result.split(",");
        resolve(parts.length > 1 ? parts[1] : "");
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function collectDietaryRestrictions() {
    return Array.from(document.querySelectorAll("input[name='dn-diet']:checked")).map(
      i => i.value
    );
  }

  function renderOriginalRecipe(data) {
    if (!data) {
      originalEl.innerHTML = "<p>No structured recipe extracted.</p>";
      return;
    }

    const ingHtml = (data.ingredients || [])
      .map(i => `<li>${i.amount ? `<strong>${i.amount}</strong> ` : ""}${i.item || ""}${i.notes ? ` <em>(${i.notes})</em>` : ""}</li>`)
      .join("");

    const stepsHtml = (data.steps || [])
      .map((s, idx) => `<li><strong>Step ${idx + 1}:</strong> ${s}</li>`)
      .join("");

    const nut = data.nutrition_original || {};

    originalEl.innerHTML = `
      <div style="border:1px solid #e0e7db; border-radius:12px; padding:14px 16px;">
        <h3 style="margin-top:0;">${data.title || "Original Recipe"}</h3>
        ${data.description ? `<p>${data.description}</p>` : ""}
        <p style="font-size:0.9rem; color:#66705e;">
          ⏱️ Prep: ${data.prep_time || "n/a"} &nbsp; | &nbsp;
          🍳 Cook: ${data.cook_time || "n/a"} &nbsp; | &nbsp;
          🍽️ Servings: ${data.servings || "n/a"}
        </p>
        <h4>Ingredients</h4>
        <ul>${ingHtml || "<li>(not detected)</li>"}</ul>
        <h4>Instructions</h4>
        <ol>${stepsHtml || "<li>(not detected)</li>"}</ol>
        ${
          nut && (nut.calories || nut.net_carbs)
            ? `
        <h4>Original Nutrition (approx.)</h4>
        <p style="font-size:0.9rem;">
          Calories: ${nut.calories ?? "n/a"} &nbsp; | &nbsp;
          Net carbs: ${nut.net_carbs ?? "n/a"}g
        </p>
        `
            : ""
        }
      </div>
    `;
  }

  function renderConvertedRecipe(converted, comparison, warnings, suggested) {
    if (!converted) {
      convertedEl.innerHTML = "<p>Conversion failed or missing.</p>";
      return;
    }

    const qs = converted.quick_stats || {};
    const nutr = converted.nutrition || {};
    const per = nutr.per_serving || {};
    const orig = nutr.original || {};
    const macro = nutr.macro_split || {};

    const ingHtml = (converted.ingredients || [])
      .map(i => `<li>${i.amount ? `<strong>${i.amount}</strong> ` : ""}${i.item || ""}${i.notes ? ` <em>(${i.notes})</em>` : ""}</li>`)
      .join("");

    const stepsHtml = (converted.instructions || [])
      .map((s, idx) => `<li><strong>Step ${idx + 1}:</strong> ${s}</li>`)
      .join("");

    const notesHtml = (converted.chefs_notes || [])
      .map(n => `<li>${n}</li>`)
      .join("");

    const warningsHtml = (warnings || [])
      .map(w => `<li>${w}</li>`)
      .join("");

    const suggestionsHtml = (suggested || [])
      .map(s => `<li>${s}</li>`)
      .join("");

    const compHtml = comparison
      ? `
        <p>${comparison.summary || ""}</p>
        <ul>${(comparison.details || []).map(d => `<li>${d}</li>`).join("")}</ul>
      `
      : "";

    const carbDrop =
      typeof nutr.carb_reduction_percent === "number"
        ? nutr.carb_reduction_percent.toFixed(0)
        : null;

    convertedEl.innerHTML = `
      <div style="border:1px solid #e0e7db; border-radius:12px; padding:14px 16px;">
        <h2 style="margin-top:0;">${converted.title || "Low-Carb Daily N'Oats Version"}</h2>
        <div style="
          display:flex;
          flex-wrap:wrap;
          gap:8px;
          font-size:0.9rem;
          margin-bottom:0.75rem;
        ">
          <span>⏱️ Prep: ${qs.prep_time || "n/a"}</span>
          <span>🍳 Cook: ${qs.cook_time || "n/a"}</span>
          <span>🍽️ Servings: ${qs.servings || "n/a"}</span>
          ${
            typeof qs.net_carbs_per_serving === "number" &&
            typeof qs.original_net_carbs_per_serving === "number"
              ? `<span>🔥 Net Carbs: ${qs.net_carbs_per_serving}g (down from ${qs.original_net_carbs_per_serving}g)</span>`
              : ""
          }
        </div>

        ${
          carbDrop !== null
            ? `<p style="font-weight:600; color:#2c5f2d;">💪 Approx. ${carbDrop}% reduction in net carbs per serving</p>`
            : ""
        }

        <h3>Ingredients</h3>
        <ul>${ingHtml}</ul>

        <h3>Instructions</h3>
        <ol>${stepsHtml}</ol>

        <h3>Nutritional Information (per serving)</h3>
        <p style="font-size:0.9rem;">
          Calories: ${per.calories ?? "n/a"} &nbsp; | &nbsp;
          Net carbs: ${per.net_carbs ?? "n/a"}g &nbsp; | &nbsp;
          Protein: ${per.protein ?? "n/a"}g &nbsp; | &nbsp;
          Fat: ${per.fat ?? "n/a"}g &nbsp; | &nbsp;
          Fiber: ${per.fiber ?? "n/a"}g
        </p>
        ${
          macro && (macro.protein_percent || macro.carb_percent || macro.fat_percent)
            ? `<p style="font-size:0.9rem;">
          Macro split: Protein ${macro.protein_percent ?? "?"}% •
          Fat ${macro.fat_percent ?? "?"}% •
          Carbs ${macro.carb_percent ?? "?"}%
        </p>`
            : ""
        }

        ${
          compHtml
            ? `<h3>Original vs. Low-Carb Comparison</h3>${compHtml}`
            : ""
        }

        ${
          notesHtml
            ? `<h3>Chef's Notes</h3><ul>${notesHtml}</ul>`
            : ""
        }
      </div>
    `;

    metaEl.innerHTML = `
      ${
        converted.why_this_works
          ? `<p>${converted.why_this_works}</p>`
          : ""
      }
      ${
        warningsHtml
          ? `<h4>Warnings / Caveats</h4><ul>${warningsHtml}</ul>`
          : ""
      }
      ${
        suggestionsHtml
          ? `<h4>Suggested Variations</h4><ul>${suggestionsHtml}</ul>`
          : ""
      }
    `;
  }

  async function handleConvertClick() {
    try {
      resetProgress();
      setProgress("intake");
      setStatus("Understanding your recipe...");

      resultsSection.style.display = "none";
      convertedEl.innerHTML = "";
      originalEl.innerHTML = "";
      metaEl.innerHTML = "";

      convertBtn.disabled = true;

      let input_type = "text";
      let recipe_data = "";
      let images_base64 = [];
      let pdf_base64 = null;

      if (currentMode === "url") {
        input_type = "url";
        recipe_data = (urlInput.value || "").trim();
      } else if (currentMode === "upload") {
        if (!selectedFiles.length) {
          alert("Please upload at least one image or PDF.");
          convertBtn.disabled = false;
          setStatus("");
          return;
        }
        const pdfFiles = selectedFiles.filter(f => f.type === "application/pdf");
        const imageFiles = selectedFiles.filter(f => f.type.startsWith("image/"));

        if (pdfFiles.length) {
          input_type = "pdf";
          setStatus("Reading PDF...");
          pdf_base64 = await readFileAsBase64(pdfFiles[0]);
        } else if (imageFiles.length) {
          input_type = "image";
          setStatus("Reading image(s)...");
          images_base64 = await Promise.all(imageFiles.map(readFileAsBase64));
        } else {
          alert("Only image and PDF files are supported.");
          convertBtn.disabled = false;
          setStatus("");
          return;
        }
      } else {
        input_type = "text";
        recipe_data = (textarea.value || "").trim();
      }

      if ((input_type === "text" || input_type === "url") && !recipe_data) {
        alert("Please provide recipe text or a URL.");
        convertBtn.disabled = false;
        setStatus("");
        return;
      }

      setProgress("analysis");
      setStatus("Analyzing carbs and swap opportunities...");

      const dietary_restrictions = collectDietaryRestrictions();
      const user_preferences = {
        sweetener: prefSweetener.value || null,
        milk_type: prefMilk.value || null
      };

      setProgress("conversion");
      setStatus("Converting to a Daily N'Oats low-carb version...");

      const payload = {
        input_type,
        recipe_data,
        images_base64,
        pdf_base64,
        dietary_restrictions,
        user_preferences
      };

      const resp = await fetch("https://dailynoats-ai.onrender.com/api/recipe-convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const json = await resp.json();

      if (!resp.ok || json.status === "error") {
        console.error("Recipe-convert API error:", json);
        setStatus("Something went wrong.");
        alert(json.message || "Sorry, we couldn’t convert this recipe. Please try again.");
        convertBtn.disabled = false;
        return;
      }

      setProgress("nutrition");
      setStatus("Estimating nutrition & formatting...");

      const { original_recipe, converted_recipe, nutritional_comparison, warnings, suggested_variations } = json;

      renderConvertedRecipe(converted_recipe, nutritional_comparison, warnings, suggested_variations);
      renderOriginalRecipe(original_recipe);

      setProgress("format");
      setStatus("Done! Scroll down to see your converted recipe.");
      resultsSection.style.display = "block";
    } catch (err) {
      console.error(err);
      setStatus("");
      alert("Sorry, we couldn’t reach the Daily N'Oats AI server. Please try again later.");
    } finally {
      convertBtn.disabled = false;
    }
  }

  convertBtn.addEventListener("click", handleConvertClick);
})();
</script>