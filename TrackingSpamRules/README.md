# TrackingSpamRules (prototype)

Plugin Matomo 6 qui complète le filtrage officiel « Tracking Spam Prevention » sans le modifier.
Nom de travail. Le cahier des charges est dans `../CAHIER_DES_CHARGES.md`.

## Ce que fait le prototype (version 0.1.0)

- **Règles combinées.** Une règle est une liste de conditions reliées par « ET » : pays, résolution d'écran,
  source de trafic, type d'appareil, appareil générique, navigateur, système. Par site ou pour tous les sites.
- **Mode observation.** Toute nouvelle règle observe sans bloquer. Le passage en blocage est explicite.
- **Décision par session.** Un visiteur capté le reste pendant 30 minutes : toutes ses pages suivent le même sort.
- **Journal.** Une ligne par session captée, avec une liste fermée d'informations (adresse IP masquée),
  et des compteurs par jour. Les blocages du filtrage officiel y figurent avec leur motif.
- **En cas d'erreur, la visite passe.** L'erreur est comptée dans une table dédiée.
- **Purge quotidienne** à 30 jours (90 jours pour les sessions marquées « légitime »).

## Ce qui n'existe pas encore

- L'écran de contrôle et l'écran de gestion des règles : les règles se créent par l'API.
- Le courriel du lundi, le retour automatique en observation, l'annotation au passage en blocage.
- L'API (`API.php`) est écrite mais n'a pas encore été exercée par un test.
- Aucune installation sur une vraie instance : seul un Matomo 6.0.0 local a servi aux essais.

## Exemple de règle

Motif de référence (visite de Chine, accès direct, ordinateur générique, très haute résolution) :

```json
{
  "country": ["cn"],
  "resolution": {"min_width": 3000},
  "source": {"type": "direct"},
  "device_type": ["desktop"],
  "device_generic": true
}
```

## Tests

- Tests unitaires du moteur de règles : `tests/Unit/RuleMatcherTest.php` (17 tests).
- Recette manuelle contre un Matomo local : `tests/manual/scenario.sh` envoie de fausses visites
  (spam et visites légitimes) puis affiche le journal, les compteurs et les visites enregistrées.
  `MODE=block tests/manual/scenario.sh` rejoue le scénario en blocage. Attention : le script vide
  les tables de visites, il ne doit jamais viser une instance réelle.

## Limites connues

- Sans base de géolocalisation, Matomo devine le pays par la langue du navigateur. Le plugin utilise
  le même calcul que Matomo, donc donne le même pays que les rapports.
- La « source » se limite à : accès direct, domaine du site d'origine, présence d'une campagne.
- Un visiteur est reconnu par son adresse IP et son navigateur. Deux visiteurs identiques derrière
  la même adresse dans la même demi-heure sont traités comme un seul.
