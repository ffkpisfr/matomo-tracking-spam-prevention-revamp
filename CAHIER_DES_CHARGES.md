# Cahier des charges – Plugin Matomo anti-spam à règles combinées

> Copie de référence du document vivant : https://claude.ai/artifact/VgVJGGpohKo9VWLRUtMzV1 (exportée le 25/11/2026, après le prototype).

Nov 25, 2026 · @Fred

Version 2, corrigée après la relecture critique (Red Team) du 25/11/2026.

## État d'avancement au 25/11/2026

- **Changement de périmètre** : le spam touche les Matomo des clients, pas celui de l'agence. Le plugin est donc destiné à plusieurs instances.
- **Motif de référence fourni** : visite de Chine, accès direct, ordinateur générique (type ordinateur, sans marque), résolution très élevée.
- **Prototype réalisé** (nom de travail `TrackingSpamRules`, dossier du même nom dans le dépôt), testé sur un Matomo 6.0.0 monté pour l'occasion :
  - une règle reproduisant le motif capte deux sessions de spam de 3 pages en entier, et ne capte aucune des cinq visites légitimes d'essai (autre pays, résolution normale, venue de Google, campagne, téléphone) ;
  - en blocage, ces sessions disparaissent des visites de Matomo, sans visite tronquée ;
  - un blocage du filtrage officiel (navigateur sans écran) apparaît au journal avec son motif.
- **Hypothèses H1, H9 et H10 confirmées** sur ce Matomo d'essai. H2, H3 et H11 restent à vérifier sur une vraie instance.
- **Pas encore fait** : écran de contrôle, courriel du lundi, installation sur une vraie instance. Les règles se créent pour l'instant par l'API, pas dans l'interface.

## Ce que la V1 ne fait pas

- [ ] **Une session bloquée à tort est perdue pour les rapports.** Le bouton « légitime » corrige la règle pour l'avenir ; il ne remet pas la session dans les statistiques.
- [ ] **Les blocages faits par Matomo en dehors du filtrage anti-spam** (adresses IP exclues, robots connus, liste de sites spammeurs) ne sont pas visibles.
- [ ] **Aucun critère de comportement** (rebond, durée de visite) : ces informations n'existent pas encore au moment du filtrage.

## 1. Objectif et trajectoire

Construire un plugin Matomo complémentaire qui permet de filtrer le spam par règles combinées (pays + résolution d'écran + source) et de voir ce qui est filtré, sur le Matomo de l'agence.

- **Point de départ** : le filtrage officiel (Tracking Spam Prevention) ne combine pas les critères et ne laisse aucune trace de ce qu'il bloque. Volume de spam inconnu, y compris celui que l'officiel bloque déjà.
- **Décision du benchmark** : construire, sous réserve de la décision de l'étape 0 (section 9). Dans Matomo 6, le filtrage officiel est intégré à Matomo et ne se désinstalle plus : on le complète, on ne le remplace pas. Aucun outil existant ne couvre le besoin ([demande 162](https://github.com/matomo-org/plugin-TrackingSpamPrevention/issues/162) et [demande 168](https://github.com/matomo-org/plugin-TrackingSpamPrevention/issues/168) ouvertes chez Matomo, sans calendrier).
- **Alternative sans plugin, à comparer à l'étape 0** : un segment Matomo donne déjà le volume et la liste des visites d'un motif ; le segment inversé nettoie les rapports ; la suppression de visites par segment (outils RGPD) nettoie l'historique. Elle ne dit rien de ce que bloque l'officiel.
- **Trajectoire** : les dates sont relatives au jour J, celui où les points bloquants de la section 11 sont levés. Prototype à J+1 semaine, V1 sur le test à J+3 semaines, production en observation pas avant le 05/01/2027, rétrospective après quatre contrôles hebdomadaires.

## 2. Critères de réussite

**Pour l'objectif**

- Le volume bloqué par le filtrage officiel est lisible par motif et par semaine.
- Le volume capté par chaque règle est lisible en sessions par semaine.
- Après passage en blocage, le motif de référence disparaît des rapports : 0 visite dans le segment de contrôle sur une semaine, visites tronquées comprises.

**Pour l'outil (V1)**

- Une session de test de 3 pages correspondant à la règle est captée en entier, pas seulement sa première page.
- Sur 50 sessions captées lues, aucune n'est jugée réelle selon la grille : plusieurs pages vues, durée non nulle, langue cohérente avec le pays, conversion.
- Le contrôle hebdomadaire prend moins de 10 minutes.
- Le témoin de santé de l'écran indique une requête évaluée dans les dernières 24 heures et aucune erreur sur 7 jours.

## 3. Critère d'arrêt

Après quatre contrôles hebdomadaires en production (fin de semaine 8), on se demande si le plugin reste utile. Signaux d'arrêt :

- les règles en blocage écartent moins de 1 % des sessions, et le filtrage officiel ne montre rien d'anormal ;
- ou moins de 2 contrôles ont été faits sur 4 semaines ouvrées (les semaines du 21/12 et du 28/12 ne comptent pas) ;
- ou Matomo livre nativement les règles combinées et le journal.

Si l'un de ces signaux est vrai, on désactive le plugin et on n'engage pas la V2.

## 4. Profil et contraintes

| Constat | Conséquence pour l'outil |
| --- | --- |
| Plusieurs instances Matomo, celles des clients de l'agence | Le plugin doit s'installer et se mettre à jour sans retouche d'une instance à l'autre ; l'agence traite des données de clients, qui doivent être informés ; pas de publication publique |
| Utilisateur unique, sans compétence technique | Tout se règle dans l'interface, en français, sans fichier à modifier au quotidien |
| Contrôle une fois par semaine | Écran dense et rapide à lire ; conservation des sessions captées 30 jours |
| Moins de 100 000 visites par mois | Toutes les sessions captées sont conservées, jusqu'à 5 000 requêtes par règle et par jour ; au-delà, on compte sans détailler et l'écran l'indique |
| Matomo 6 sur test et production | Plugin conçu pour Matomo 6 uniquement ; version très récente, donc prototype avant développement complet |
| Un Matomo de test existe | Rien n'est installé en production sans une semaine d'observation sur le test |
| Le filtrage officiel doit continuer à fonctionner | Plugin à côté, sous un autre nom, qui ne modifie pas l'officiel |
| Les règles diffèrent selon les sites | Chaque règle vise un site ou tous les sites |
| Les sessions captées contiennent des données de visite | Purge automatique à 30 jours, respect de l'anonymisation des adresses IP déjà réglée dans Matomo |

## 5. Principes de conception

1. **Observer avant de bloquer.** Toute nouvelle règle compte sans bloquer. Le blocage est une décision explicite, prise après lecture des sessions captées.
2. **Rien n'est filtré sans trace.** Chaque requête captée par une règle est comptée et consultable pendant 30 jours.
3. **En cas de panne, le trafic passe.** Si le plugin rencontre une erreur, la visite est enregistrée normalement : on préfère du spam dans les rapports à une perte de visites réelles.
4. **Ne pas toucher au filtrage officiel.** Il garde ses réglages et son comportement.
5. **Une règle = des conditions reliées par « ET ».** Pas de « OU » ni de règles imbriquées en V1 : pour un « OU », on crée une deuxième règle.
6. **Le minimum de données personnelles.** L'adresse IP est stockée sous la forme anonymisée déjà réglée dans Matomo, et tout est purgé à 30 jours.

## 6. Déroulé type

**Contrôle hebdomadaire (10 minutes, déclenché par le courriel du lundi)**

1. Ouvrir l'écran de contrôle : volume capté par règle sur les 7 derniers jours, comparé à la semaine précédente.
2. Pour chaque règle en observation : parcourir les sessions captées. Si tout est du spam, passer la règle en blocage.
3. Pour chaque règle en blocage : survoler la liste. Une session paraît réelle : bouton « légitime », puis resserrer la règle.
4. Un nouveau motif de spam repéré dans les rapports Matomo : créer une règle, qui démarre en observation.

**Déclencheurs hors contrôle hebdomadaire**

- Un pic de trafic inexpliqué dans un rapport.
- Une règle qui capte beaucoup plus que d'habitude (affiché en tête de l'écran de contrôle).

## 7. Fonctionnalités

| Module | Détail | Version |
| --- | --- | --- |
| 1. Règles combinées | Conditions reliées par « ET », chacune acceptant plusieurs valeurs (« pays parmi… ») : pays, résolution d'écran, source, navigateur ou système. Par site ou pour tous les sites. Interrupteur « observer / bloquer », sur « observer » à la création. La décision vaut pour toute la session, pas seulement la première page. | V1 |
| 2. Journal | Sessions captées par les règles, et requêtes écartées par le filtrage officiel avec leur motif. Consultable 30 jours. Compteurs par jour gardés sans limite. | V1 |
| 3. Écran de contrôle | Témoin de santé en tête (dernière requête évaluée, erreurs sur 7 jours). Volumétrie par règle et par motif officiel. Liste des sessions. Bouton « légitime ». | V1 |
| 4. Courriel du lundi | Volume par règle, écart avec la semaine précédente, lien vers l'écran. Une règle en blocage qui capte plus du double de sa moyenne repasse seule en observation, et le courriel le signale. Une annotation Matomo est créée à chaque passage en blocage. | V1 |
| Réinjection | Remettre dans les rapports une session bloquée à tort. Faisabilité à étudier : le journal ne garde pas la requête complète. | V2 |
| Type de canal | Condition sur le canal calculé par Matomo (moteur de recherche, réseau social). | V2 |

**Limite de la V1 sur la source de trafic.** Au moment où le filtrage s'exécute, Matomo n'a pas encore calculé le canal. La V1 propose donc trois conditions : accès direct (aucun site d'origine), domaine du site d'origine, et paramètres de campagne présents dans l'adresse.

**Ce que fait le bouton « légitime » en V1.** Sur une session captée par une règle : il la marque, la sort du décompte de spam et ouvre la règle pour la resserrer. Sur une requête écartée par le filtrage officiel : il la marque seulement, le réglage de l'officiel se corrige à la main dans son propre écran. Dans les deux cas la session reste absente des rapports. Les sessions marquées sont gardées 90 jours au lieu de 30.

## 8. Architecture technique et installation

**Parcours d'une visite**

1. Le site envoie la visite à Matomo.
2. Le filtrage officiel s'exécute, inchangé.
3. Le nouveau plugin compare la visite aux règles actives du site : pays, résolution, source, navigateur.
4. Aucune règle ne correspond : la visite est enregistrée normalement.
5. Une règle en observation correspond : la visite est enregistrée normalement, et notée dans le journal.
6. Une règle en blocage correspond : la visite est écartée des rapports, et notée dans le journal.
7. Chaque nuit, une tâche supprime du journal ce qui a plus de 30 jours.

**Décision par session.** Matomo interroge le plugin à chaque page vue, et la source n'est visible que sur la première page. Quand une page correspond à une règle, le plugin mémorise le visiteur pendant 30 minutes : ses pages suivantes subissent le même sort et sont rattachées à la même session du journal. Tous les compteurs sont en sessions.

**Composants (pour la session de développement)**

- Plugin PHP : `plugin.json` avec `"matomo": ">=6.0.0-b1,<7.0.0-b1"`, PHP 8.1 minimum, licence GPL v3. Si la vérification de version (section 11) révèle un Matomo 5, la cible devient la 5.x.
- Point d'entrée : événement `Tracker.isExcludedVisit`, exécuté après le plugin officiel pour lire son motif dans `$excluded`.
- Pays : même fournisseur de géolocalisation et même réglage d'adresse IP que Matomo, pour que la règle et les rapports donnent le même pays. Résolution : paramètre `res`. Source : `urlref` et paramètres de campagne.
- Mémorisation du visiteur 30 minutes : identifiant visiteur, ou à défaut empreinte de configuration et IP anonymisée.
- Règles chargées par le cache du tracker ; chaque enregistrement de règle vide ce cache, pour un effet immédiat.
- Quatre tables : règles, journal, compteurs par jour, erreurs interceptées.
- Le journal stocke une liste fermée de champs : site, horodatage, page, origine, résolution, pays, navigateur, système, IP anonymisée, identifiant de session haché, règle ou motif. Les paramètres `token_auth`, `uid` et `cip` ne sont jamais stockés.
- Tâches planifiées : purge quotidienne, courriel hebdomadaire.
- Écran d'administration réservé au super-utilisateur, avec les composants standard de Matomo.
- Toute erreur du plugin est interceptée et comptée : la visite passe, et le témoin de santé l'affiche.

**Fiche « si, alors »**

- Avant une mise à jour de Matomo : désactiver le plugin. Après : le réactiver et vérifier le témoin de santé.
- Si le témoin affiche des erreurs ou aucune requête depuis 24 heures : désactiver le plugin et ouvrir une session de correction.
- Si le nombre de visites chute brutalement sur tous les sites : désactiver le plugin dans Administration, Plugins. Si l'administration est inaccessible, la personne qui gère le serveur le désactive.
- Pas de montée de version de Matomo pendant une semaine d'observation.

**Installation**

1. Mode d'installation à choisir (section 11). Option A : la personne qui gère le serveur copie le dossier du plugin à chaque version. Option B : elle passe une fois `enable_plugin_upload = 1` dans `config/config.ini.php`, ce qui permet le dépôt de fichier depuis l'interface ; ce réglage reste alors ouvert, et le compte super-utilisateur doit être protégé par double authentification.
2. Dans Matomo : Administration, Plugins, activer le plugin.
3. Créer la règle de référence, qui démarre en observation.

## 9. Plan de réalisation

| Étape | Contenu | Échéance | Condition pour passer à la suite |
| --- | --- | --- | --- |
| 0. Vérifications sans code | Version exacte de Matomo et réglages du filtrage officiel ; segment reproduisant le motif ; volume sur 4 semaines | Jour J | **Décision construire ou non** (voir sous le tableau) |
| 1. Prototype | Lit le motif du filtrage officiel, capte une règle codée en dur sur une session de 3 pages, écrit dans le journal ; tranche H1, H2, H9, H10 | J + 1 semaine | Les quatre hypothèses sont tranchées |
| 2. V1 | Les 4 modules, tests automatisés | J + 3 semaines | Tests au vert |
| 3. Recette sur le test | 2 jours de fausses visites : installation, capture, purge, écran, courriel | J + 3 semaines + 2 jours | Critères « outil » de la section 2 |
| 4. Production | Toutes les règles en observation, puis blocage règle par règle | Pas avant le 05/01/2027 | Quatre contrôles hebdomadaires |
| 5. Rétrospective | Critère d'arrêt, décision sur la V2 | Après le 4e contrôle | — |

**Décision de l'étape 0.** Si le motif pèse moins de 1 % des visites, ou si le segment et une suppression mensuelle suffisent (moins de 15 minutes par mois), on ne construit que le journal du filtrage officiel (modules 2 et 3 réduits). Sinon, on construit la V1 complète.

L'observation réelle se fait en production : le mode observation n'y bloque rien, et le Matomo de test ne reçoit pas le spam.

Le développement se fait en deux sessions par semaine au maximum. Aucune fonctionnalité n'est ajoutée pendant une semaine d'observation. Une fonctionnalité de V2 est débloquée par cycle réussi.

## 10. Hypothèses non vérifiées

| N° | Hypothèse | Comment la tester |
| --- | --- | --- |
| H1 | Le plugin s'exécute après le filtrage officiel et peut coexister avec lui | Prototype : envoyer une visite bloquée par l'officiel et une visite captée par notre règle |
| H2 | Le pays est disponible au moment du filtrage sur ce serveur (géolocalisation configurée) | Prototype : afficher le pays calculé pour une visite de test |
| H3 | La résolution d'écran est bien transmise par les sites | Vérifier dans les rapports Matomo que la résolution n'est pas « inconnue » pour le trafic normal |
| H4 | Le spam envoie une résolution et une source stables d'une semaine à l'autre | Étape 0 : comparer le motif sur les 4 dernières semaines |
| H5 | Le dépôt de fichier de plugin peut être activé sur le serveur de test et de production | Demander à la personne qui a accès au serveur |
| H6 | Matomo 6.0.0 est assez stable pour un plugin tiers | Suivre les versions correctives ; refaire les tests à chaque mise à jour |
| H7 | L'extension de mise en file d'attente des visites (QueuedTracking) n'est pas installée | Regarder la liste des plugins actifs |
| H8 | Le numéro de version est bien 6.x sur le test et la production | Administration, Vérification du système |

| N° | Hypothèse ajoutée après le Red Team | Comment la tester |
| --- | --- | --- |
| H9 | Le motif du filtrage officiel est lisible par le plugin (variable `$excluded`) | Prototype : une visite bloquée par l'officiel doit apparaître au journal avec son motif. Si c'est faux, le dire à Fred avant de coder la V1 |
| H10 | Mémoriser le visiteur 30 minutes suffit à capter toute la session | Prototype : session de 3 pages, les 3 doivent être captées |
| H11 | Le pays calculé par le plugin est identique à celui des rapports | Comparer sur 20 visites du journal des visites |
| H12 | Le quatrième signe distinctif du motif n'est pas un comportement (rebond, durée) | Étape 0 : lecture des valeurs du motif |
| H13 | La date de sortie de Matomo 6 (23/11/2026) lue sur GitHub est exacte ; le Red Team n'a pas pu la recouper | Sans effet si H8 est vérifiée sur l'instance |

## 11. Points à valider

- [x] Version de Matomo : 6, confirmée par Fred.
- [x] Gestion du serveur : Fred, seul.
- [x] « Critères trop restrictifs » : l'officiel manque d'options et ne montre pas ce qu'il bloque.
- [x] Motif de référence : Chine, accès direct, ordinateur générique, résolution très élevée.
- [ ] **Bloquant pour l'installation.** Quels clients, sur quelles instances ? Sont-elles toutes en Matomo 6, et Fred en gère-t-il tous les serveurs ?
- [ ] **Bloquant pour l'installation.** Mode d'installation choisi (option A ou B, section 8).
- [ ] **Bloquant pour le passage en blocage.** Les clients concernés sont prévenus que des visites seront écartées et qu'un journal est conservé 30 jours.
- [ ] Seuil de « résolution très élevée » : à partir de quelle largeur en pixels ? Le prototype utilise 3 000.
- [ ] Volume du motif sur 4 semaines chez un client, pour la décision de l'étape 0.
- [ ] Les trois cases de « Ce que la V1 ne fait pas » sont cochées.
- [ ] Réglages actuels du filtrage officiel chez le client pilote (capture d'écran).
- [ ] Adresse qui reçoit le courriel du lundi.
- [ ] Nom définitif du plugin.

## Sources

- [Versions de Matomo](https://github.com/matomo-org/matomo/releases) et [journal des changements pour développeurs](https://github.com/matomo-org/matomo/blob/6.x-dev/CHANGELOG.md)
- [Code de Matomo 6.0.0](https://github.com/matomo-org/matomo/tree/6.0.0)
- [Plugin officiel Tracking Spam Prevention](https://github.com/matomo-org/plugin-TrackingSpamPrevention) et ses demandes [162](https://github.com/matomo-org/plugin-TrackingSpamPrevention/issues/162), [168](https://github.com/matomo-org/plugin-TrackingSpamPrevention/issues/168), [114](https://github.com/matomo-org/plugin-TrackingSpamPrevention/issues/114)
- [BotTracker](https://github.com/digitalist-se/BotTracker), non compatible Matomo 6

* Rapport complet du Red Team : fichier `docs/red-team-2026-11-25.md` du dépôt.

Les sites matomo.org et plugins.matomo.org n'ont pas pu être consultés directement pendant la recherche.
