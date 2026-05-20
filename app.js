// SRecette — construit des requêtes ciblées pour les grands sites de recettes français.
// App statique : pas de backend, on délègue la recherche aux sites spécialisés.

const form = document.getElementById("form");
const results = document.getElementById("results");
const linksEl = document.getElementById("links");
const queryPreview = document.getElementById("queryPreview");

// Sites de recettes français (France) — du plus généraliste au plus spécialisé.
const SITES = [
  {
    name: "Marmiton",
    desc: "La référence française, énorme catalogue et avis lecteurs",
    domain: "marmiton.org",
    search: (q) => `https://www.marmiton.org/recettes/recherche.aspx?aqt=${encodeURIComponent(q)}`,
  },
  {
    name: "750g",
    desc: "Recettes détaillées, beaucoup de vidéos",
    domain: "750g.com",
    search: (q) => `https://www.750g.com/recettes_${encodeURIComponent(q.replace(/\s+/g, "_"))}.htm`,
  },
  {
    name: "Cuisine AZ",
    desc: "Très large catalogue, filtres pratiques",
    domain: "cuisineaz.com",
    search: (q) => `https://www.cuisineaz.com/recettes/recherche_v2.aspx?recherche=${encodeURIComponent(q)}`,
  },
  {
    name: "Journal des Femmes Cuisine",
    desc: "Recettes testées, fiches claires",
    domain: "cuisine.journaldesfemmes.fr",
    search: (q) => `https://cuisine.journaldesfemmes.fr/recherche/?q=${encodeURIComponent(q)}`,
  },
  {
    name: "Cuisine Actuelle",
    desc: "Magazine de cuisine, recettes du quotidien",
    domain: "cuisineactuelle.fr",
    search: (q) => `https://www.cuisineactuelle.fr/recherche?text=${encodeURIComponent(q)}`,
  },
  {
    name: "Régal",
    desc: "Cuisine de saison, produits français",
    domain: "regal.fr",
    search: (q) => `https://www.regal.fr/recherche?keys=${encodeURIComponent(q)}`,
  },
];

// Construit une requête textuelle propre à partir du formulaire.
function buildQuery(data) {
  const parts = [];

  // Type de repas en premier (signal fort).
  if (data.repas) parts.push(data.repas);

  // Difficulté → mots-clés naturels.
  if (data.difficulte === "simple") parts.push("facile");
  else if (data.difficulte === "elabore") parts.push("gastronomique");

  // Temps max.
  if (data.temps) parts.push(data.temps);

  // Envies / idées.
  if (data.envies) parts.push(data.envies.trim());

  // Régime.
  if (data.regime) parts.push(data.regime);

  // Ingrédients : les plus discriminants, on en garde max 4.
  if (data.ingredients.length) {
    parts.push(...data.ingredients.slice(0, 4));
  }

  // Ustensiles : on n'ajoute un ustensile au query que s'il est très spécifique
  // (air fryer, cocotte minute) — un four ou une poêle n'apporte rien au moteur.
  const ustensilesUtiles = ["air fryer", "cocotte minute", "wok", "plancha", "gaufrier"];
  const choisis = data.ustensiles.filter((u) => ustensilesUtiles.includes(u));
  // On ajoute un seul ustensile spécifique pour ne pas trop restreindre.
  if (choisis.length === 1) parts.push(choisis[0]);

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

// Construit une requête Google site-restreinte aux sites FR.
function googleQuery(q) {
  const sitesFilter = SITES.map((s) => `site:${s.domain}`).join(" OR ");
  return `https://www.google.com/search?q=${encodeURIComponent(q + " " + "(" + sitesFilter + ")")}`;
}

function parseIngredients(raw) {
  return raw
    .split(/[,;\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function getFormData() {
  const ingredients = parseIngredients(document.getElementById("ingredients").value);
  const envies = document.getElementById("envies").value;
  const difficulte = document.querySelector('input[name="difficulte"]:checked')?.value || "simple";
  const repas = document.getElementById("repas").value;
  const temps = document.getElementById("temps").value;
  const regime = document.getElementById("regime").value;
  const ustensiles = [...document.querySelectorAll("#ustensiles input:checked")].map((el) => el.value);
  return { ingredients, envies, difficulte, repas, temps, regime, ustensiles };
}

function render(query) {
  queryPreview.textContent = query ? `Requête : « ${query} »` : "Requête vide — ajoute au moins un ingrédient ou une envie.";
  linksEl.innerHTML = "";

  if (!query) {
    results.hidden = false;
    return;
  }

  // Sites spécialisés.
  for (const site of SITES) {
    const a = document.createElement("a");
    a.className = "link-row";
    a.href = site.search(query);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.innerHTML = `
      <span>
        <span class="name">${site.name}</span><br />
        <span class="desc">${site.desc}</span>
      </span>
      <span class="go">→</span>
    `;
    linksEl.appendChild(a);
  }

  // Recherche Google ciblée FR (filet de sécurité).
  const g = document.createElement("a");
  g.className = "link-row";
  g.href = googleQuery(query);
  g.target = "_blank";
  g.rel = "noopener noreferrer";
  g.innerHTML = `
    <span>
      <span class="name">Google — sites FR</span><br />
      <span class="desc">Recherche restreinte aux sites ci-dessus</span>
    </span>
    <span class="go">→</span>
  `;
  linksEl.appendChild(g);

  results.hidden = false;
  // Scroll doux vers les résultats.
  results.scrollIntoView({ behavior: "smooth", block: "start" });
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = getFormData();
  const query = buildQuery(data);
  render(query);
});

form.addEventListener("reset", () => {
  results.hidden = true;
  linksEl.innerHTML = "";
  queryPreview.textContent = "";
});
