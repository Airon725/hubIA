# 🤖 Agent Proto

Premier prototype d'agent IA personnel, pensé pour le téléphone. C'est une seule page HTML, sans installation et sans serveur.

## Ce qu'il sait faire

| Outil | Rôle | Coût |
|---|---|---|
| 🌦️ `meteo` | Météo actuelle et prévisions (Open-Meteo) | Gratuit |
| 🔎 `recherche_web` | Recherche web (Tavily), ou Wikipédia s'il n'y a pas de clé | Gratuit avec quota |
| 📄 `lire_page` | Lit le contenu d'un lien (Tavily) | Gratuit avec quota |
| 🧮 `calcul` | Calculs exacts | Gratuit |
| ✅ `ajouter_tache` / `lister_taches` / `terminer_tache` | Liste de tâches | Gratuit |
| 🧠 `memoriser` | Retient des infos sur toi pour les conversations suivantes | Gratuit |

## 🎮 Onglet « Bons plans »

Une chaîne de deux agents :

1. **L'enquêteur (Haiku 5.5)** cherche des promos, nouveautés et précommandes de jeux Switch 2 sur les boutiques de ta liste (modifiable dans les réglages). Il utilise Tavily pour chercher et lire des pages, puis transmet des offres structurées : prix, ancien prix, boutique, lien, date de la source, niveau de fiabilité.
2. **Le rédacteur (Sonnet 5.5, ou Haiku au choix)** écrit le récap à partir de ces offres uniquement, sans rien inventer.

Il faut une clé **Anthropic** et une clé **Tavily**. Le coût réel de chaque passage s'affiche sous le résultat.
Les liens sont filtrés (https uniquement) et les prix sont toujours à vérifier sur la boutique.

## Le « cerveau » (au choix dans ⚙️ Réglages)

- **Groq · Llama** : gratuit, avec un quota par jour. Parfait pour s'entraîner.
- **Claude Haiku 5.5** : quelques centièmes de centime par message. Plus fiable avec les outils.
- **Claude Sonnet 5.5** : plus intelligent, environ 20 fois plus cher que Haiku.

Le coût de chaque réponse s'affiche sous le message, et le total du mois est dans les réglages.

## Comment ça marche

À chaque message, la boucle de l'agent fait ceci :

1. Il envoie ta demande et la liste des outils au modèle.
2. Le modèle répond, ou bien demande à utiliser un ou plusieurs outils.
3. La page exécute les outils et renvoie les résultats au modèle.
4. On recommence, au maximum 8 fois, jusqu'à la réponse finale.

Les étapes s'affichent en bleu dans la conversation. Touche-les pour voir le résultat brut de l'outil.

## Confidentialité

Les clés API, les tâches et la mémoire restent dans le navigateur du téléphone (`localStorage`). Rien n'est envoyé ailleurs qu'aux services utilisés : Groq ou Anthropic, Open-Meteo, Tavily et Wikipédia.
