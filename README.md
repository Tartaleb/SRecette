# SRecette

Petite app web pour trouver des recettes sur le **web français** (pas francophone — français de France) à partir de ce que tu as au frigo, de tes envies, du temps dispo et des ustensiles à dispo.

## Comment ça marche

L'app construit une requête optimisée à partir du formulaire et ouvre les recherches sur les grands sites de recettes français : Marmiton, 750g, Cuisine AZ, Journal des Femmes, Cuisine Actuelle, Régal — plus une recherche Google restreinte à ces mêmes sites.

Pas de serveur, pas d'API : tout se passe dans le navigateur.

## Paramètres

- **Ingrédients dispo** — ce que tu as sous la main
- **Envies / idées** — texte libre (curry, gratin, réconfortant…)
- **Difficulté** — simple (par défaut) / moyen / élaboré
- **Ustensiles** — four, poêle, micro-ondes, air fryer, cocotte minute cochés par défaut
- **Type de repas, temps max, régime** — optionnels

## Lancer en local

Ouvre simplement `index.html` dans un navigateur. Aucune dépendance.
