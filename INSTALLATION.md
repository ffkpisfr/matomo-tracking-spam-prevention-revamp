# Installer le plugin sur votre Matomo 6

Le fichier à installer est `dist/TrackingSpamRules-0.2.0.zip`.

## Option A : copier le dossier sur le serveur

1. Décompressez le fichier zip : vous obtenez un dossier `TrackingSpamRules`.
2. Copiez ce dossier dans le dossier `plugins` de votre Matomo, sur le serveur.
3. Dans Matomo : Administration, puis Système, puis Plugins. Cherchez « TrackingSpamRules » et cliquez sur Activer.

## Option B : déposer le fichier depuis l'interface

1. Une seule fois, sur le serveur, ouvrez le fichier `config/config.ini.php` de Matomo et ajoutez,
   dans la section `[General]`, la ligne : `enable_plugin_upload = 1`
2. Dans Matomo : Administration, puis la page des plugins. Un bouton de dépôt de fichier de plugin y apparaît
   une fois le réglage activé : envoyez le fichier zip. (Cette option n'a pas été essayée sur le Matomo d'essai,
   seule l'option A l'a été.)
3. Activez le plugin.

Ce réglage reste ouvert tant que vous ne remettez pas la ligne à 0. Protégez votre compte par une double authentification.

## Première utilisation

1. Administration, puis Système, puis « Règles anti-spam ».
2. Cliquez sur « Nouvelle règle », renseignez les conditions, enregistrez. La règle démarre en observation : rien n'est bloqué.
3. Revenez quelques jours plus tard : la partie « Sessions filtrées » montre ce que la règle aurait bloqué.
4. Si tout est bien du spam, cliquez sur « Passer en blocage ».

## En cas de problème

- Désactivez le plugin dans Administration, Système, Plugins : le suivi redevient exactement comme avant.
- Avant une mise à jour de Matomo, désactivez le plugin ; réactivez-le ensuite et regardez le témoin « État du plugin ».
