// SRecette — scrape Marmiton via un proxy CORS public, parse le JSON-LD schema.org/Recipe
// et affiche les recettes directement sur la page. Fallback : liens vers d'autres sites FR.

const form = document.getElementById("form");
const results = document.getElementById("results");
const recipesEl = document.getElementById("recipes");
const linksEl = document.getElementById("links");
const queryPreview = document.getElementById("queryPreview");
const statusEl = document.getElementById("status");

// Sites FR pour les liens de secours.
const FALLBACK_SITES = [
  { name: "Marmiton", desc: "Catalogue géant, avis lecteurs", search: (q) => `https://www.marmiton.org/recettes/recherche.aspx?aqt=${encodeURIComponent(q)}` },
  { name: "750g", desc: "Recettes détaillées, vidéos", search: (q) => `https://www.750g.com/recettes_${encodeURIComponent(q.replace(/\s+/g, "_"))}.htm` },
  { name: "Cuisine AZ", desc: "Large catalogue, filtres", search: (q) => `https://www.cuisineaz.com/recettes/recherche_v2.aspx?recherche=${encodeURIComponent(q)}` },
  { name: "Journal des Femmes", desc: "Fiches claires, testées", search: (q) => `https://cuisine.journaldesfemmes.fr/recherche/?q=${encodeURIComponent(q)}` },
  { name: "Cuisine Actuelle", desc: "Cuisine du quotidien", search: (q) => `https://www.cuisineactuelle.fr/recherche?text=${encodeURIComponent(q)}` },
  { name: "Régal", desc: "Cuisine de saison FR", search: (q) => `https://www.regal.fr/recherche?keys=${encodeURIComponent(q)}` },
];

// Proxies CORS publics (essayés dans l'ordre, premier qui marche).
const PROXIES = [
  (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
];

const MAX_RECIPES = 6;

// -------------------- Construction de la requête --------------------

function parseIngredients(raw) {
  return raw
    .split(/[,;\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function buildQuery(data) {
  const parts = [];
  if (data.repas) parts.push(data.repas);
  if (data.difficulte === "simple") parts.push("facile");
  else if (data.difficulte === "elabore") parts.push("gastronomique");
  if (data.temps) parts.push(data.temps);
  if (data.envies) parts.push(data.envies.trim());
  if (data.regime) parts.push(data.regime);
  if (data.ingredients.length) parts.push(...data.ingredients.slice(0, 4));

  const ustensilesUtiles = ["air fryer", "cocotte minute", "wok", "plancha", "gaufrier"];
  const choisis = data.ustensiles.filter((u) => ustensilesUtiles.includes(u));
  if (choisis.length === 1) parts.push(choisis[0]);

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function getFormData() {
  return {
    ingredients: parseIngredients(document.getElementById("ingredients").value),
    envies: document.getElementById("envies").value,
    difficulte: document.querySelector('input[name="difficulte"]:checked')?.value || "simple",
    repas: document.getElementById("repas").value,
    temps: document.getElementById("temps").value,
    regime: document.getElementById("regime").value,
    ustensiles: [...document.querySelectorAll("#ustensiles input:checked")].map((el) => el.value),
  };
}

// -------------------- Récupération via proxy CORS --------------------

async function fetchProxied(url) {
  let lastErr;
  for (const makeUrl of PROXIES) {
    try {
      const r = await fetch(makeUrl(url), { redirect: "follow" });
      if (r.ok) {
        const text = await r.text();
        if (text && text.length > 200) return text;
      }
      lastErr = new Error(`HTTP ${r.status}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Tous les proxies CORS ont échoué");
}

// -------------------- Scraping Marmiton + JSON-LD --------------------

async function searchMarmiton(query) {
  const searchUrl = `https://www.marmiton.org/recettes/recherche.aspx?aqt=${encodeURIComponent(query)}`;
  const html = await fetchProxied(searchUrl);
  const doc = new DOMParser().parseFromString(html, "text/html");

  // Marmiton expose les recettes via des <a href="/recettes/recette_*.aspx">.
  const hrefs = [...doc.querySelectorAll("a")]
    .map((a) => a.getAttribute("href"))
    .filter((h) => h && /\/recettes\/recette[_-][^"]+\.aspx/i.test(h));

  // Normalise + dédup.
  const seen = new Set();
  const urls = [];
  for (const h of hrefs) {
    const full = h.startsWith("http") ? h : `https://www.marmiton.org${h}`;
    if (!seen.has(full)) {
      seen.add(full);
      urls.push(full);
    }
    if (urls.length >= MAX_RECIPES) break;
  }
  return urls;
}

function findRecipesInLdJson(data) {
  const found = [];
  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (typeof node !== "object") return;
    const t = node["@type"];
    if (t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"))) found.push(node);
    if (node["@graph"]) visit(node["@graph"]);
  };
  visit(data);
  return found;
}

async function fetchRecipe(url) {
  try {
    const html = await fetchProxied(url);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const s of scripts) {
      try {
        const json = JSON.parse(s.textContent);
        const recipes = findRecipesInLdJson(json);
        if (recipes.length) return { ...recipes[0], _sourceUrl: url };
      } catch { /* JSON invalide, on continue */ }
    }
  } catch (e) {
    console.warn("Échec recette", url, e);
  }
  return null;
}

// -------------------- Affichage --------------------

function parseISODuration(iso) {
  // PT1H30M -> "1 h 30 min"
  if (!iso || typeof iso !== "string") return null;
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return null;
  const h = m[1] ? parseInt(m[1], 10) : 0;
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (!h && !min) return null;
  const parts = [];
  if (h) parts.push(`${h} h`);
  if (min) parts.push(`${min} min`);
  return parts.join(" ");
}

function toArray(v) { return Array.isArray(v) ? v : (v ? [v] : []); }

function stripHtml(s) {
  if (typeof s !== "string") return "";
  const div = document.createElement("div");
  div.innerHTML = s;
  return div.textContent || "";
}

function imageUrl(img) {
  if (!img) return null;
  if (typeof img === "string") return img;
  if (Array.isArray(img)) return imageUrl(img[0]);
  if (img.url) return img.url;
  return null;
}

function renderRecipe(r) {
  const card = document.createElement("article");
  card.className = "recipe";

  const img = imageUrl(r.image);
  const thumb = document.createElement("div");
  thumb.className = img ? "thumb" : "thumb placeholder";
  if (img) thumb.style.backgroundImage = `url("${img.replace(/"/g, "%22")}")`;
  card.appendChild(thumb);

  const body = document.createElement("div");
  body.className = "body";

  const h3 = document.createElement("h3");
  const a = document.createElement("a");
  a.href = r._sourceUrl;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = stripHtml(r.name) || "Recette sans titre";
  h3.appendChild(a);
  body.appendChild(h3);

  // Metadata pills.
  const meta = document.createElement("div");
  meta.className = "meta";
  const total = parseISODuration(r.totalTime) || parseISODuration(r.cookTime);
  if (total) {
    const s = document.createElement("span"); s.textContent = `⏱ ${total}`; meta.appendChild(s);
  }
  if (r.recipeYield) {
    const yld = Array.isArray(r.recipeYield) ? r.recipeYield[0] : r.recipeYield;
    const s = document.createElement("span"); s.textContent = `👥 ${yld}`; meta.appendChild(s);
  }
  if (r.aggregateRating?.ratingValue) {
    const s = document.createElement("span");
    s.textContent = `★ ${Number(r.aggregateRating.ratingValue).toFixed(1)}`;
    meta.appendChild(s);
  }
  if (meta.children.length) body.appendChild(meta);

  // Description courte.
  if (r.description) {
    const p = document.createElement("p");
    p.className = "desc";
    const txt = stripHtml(r.description).trim();
    p.textContent = txt.length > 200 ? txt.slice(0, 200) + "…" : txt;
    body.appendChild(p);
  }

  // Ingrédients (ouvert par défaut).
  const ingredients = toArray(r.recipeIngredient).map(stripHtml).filter(Boolean);
  if (ingredients.length) {
    const det = document.createElement("details");
    det.open = true;
    const sum = document.createElement("summary");
    sum.textContent = `Ingrédients (${ingredients.length})`;
    det.appendChild(sum);
    const ul = document.createElement("ul");
    ingredients.forEach((i) => { const li = document.createElement("li"); li.textContent = i; ul.appendChild(li); });
    det.appendChild(ul);
    body.appendChild(det);
  }

  // Étapes.
  const steps = toArray(r.recipeInstructions)
    .map((s) => {
      if (typeof s === "string") return s;
      if (s && s.text) return s.text;
      if (s && s.name) return s.name;
      return "";
    })
    .map(stripHtml)
    .map((s) => s.trim())
    .filter(Boolean);
  if (steps.length) {
    const det = document.createElement("details");
    const sum = document.createElement("summary");
    sum.textContent = `Étapes (${steps.length})`;
    det.appendChild(sum);
    const ol = document.createElement("ol");
    steps.forEach((s) => { const li = document.createElement("li"); li.textContent = s; ol.appendChild(li); });
    det.appendChild(ol);
    body.appendChild(det);
  }

  // Source.
  const src = document.createElement("p");
  src.className = "source";
  const sourceA = document.createElement("a");
  sourceA.href = r._sourceUrl;
  sourceA.target = "_blank";
  sourceA.rel = "noopener noreferrer";
  sourceA.textContent = "Voir sur Marmiton →";
  src.appendChild(sourceA);
  body.appendChild(src);

  card.appendChild(body);
  return card;
}

function renderFallbackLinks(query) {
  linksEl.innerHTML = "";
  for (const site of FALLBACK_SITES) {
    const a = document.createElement("a");
    a.className = "link-row";
    a.href = site.search(query);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.innerHTML = `<span><span class="name">${site.name}</span><br /><span class="desc">${site.desc}</span></span><span class="go">→</span>`;
    linksEl.appendChild(a);
  }
}

function setStatus(msg, { loading = false, error = false } = {}) {
  statusEl.hidden = !msg;
  statusEl.className = "status" + (error ? " error" : "");
  statusEl.innerHTML = "";
  if (loading) {
    const sp = document.createElement("span");
    sp.className = "spinner";
    statusEl.appendChild(sp);
  }
  const t = document.createElement("span");
  t.textContent = msg;
  statusEl.appendChild(t);
}

// -------------------- Orchestration --------------------

async function findAndDisplay(query) {
  recipesEl.innerHTML = "";
  setStatus("Recherche en cours sur Marmiton…", { loading: true });

  let urls;
  try {
    urls = await searchMarmiton(query);
  } catch (e) {
    setStatus("Impossible d'atteindre Marmiton (proxy CORS bloqué ?). Utilise les liens ci-dessous.", { error: true });
    return;
  }

  if (!urls.length) {
    setStatus("Aucune recette trouvée pour cette requête. Essaie avec moins d'ingrédients ou les liens ci-dessous.", { error: true });
    return;
  }

  setStatus(`${urls.length} recettes trouvées, récupération des détails…`, { loading: true });

  // On fetch les recettes en parallèle pour la rapidité.
  const recipes = (await Promise.all(urls.map(fetchRecipe))).filter(Boolean);

  if (!recipes.length) {
    setStatus("Recettes trouvées mais impossible d'extraire les détails. Utilise les liens ci-dessous.", { error: true });
    return;
  }

  setStatus("");
  recipes.forEach((r) => recipesEl.appendChild(renderRecipe(r)));
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = getFormData();
  const query = buildQuery(data);

  results.hidden = false;
  queryPreview.textContent = query ? `Requête : « ${query} »` : "Requête vide — ajoute au moins un ingrédient ou une envie.";
  renderFallbackLinks(query || "recette");
  recipesEl.innerHTML = "";

  if (!query) {
    setStatus("Ajoute au moins un ingrédient ou une envie pour lancer la recherche.", { error: true });
    return;
  }

  results.scrollIntoView({ behavior: "smooth", block: "start" });
  await findAndDisplay(query);
});

form.addEventListener("reset", () => {
  results.hidden = true;
  recipesEl.innerHTML = "";
  linksEl.innerHTML = "";
  queryPreview.textContent = "";
  setStatus("");
});
