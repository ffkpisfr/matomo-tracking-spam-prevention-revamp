#!/bin/bash
# Scénario de recette manuelle contre un Matomo local (voir README). Usage : scenario.sh <dossier matomo> <url matomo>
set -u
M=${1:-/opt/matomo-dev/matomo}; BASE=${2:-http://127.0.0.1:8080}
SQL="mysql -uroot matomo -N -e"
hit() { # ua lang res url urlref id
  curl -s -o /dev/null -A "$1" -H "Accept-Language: $2" -G "$BASE/matomo.php" \
    --data-urlencode "idsite=1" --data-urlencode "rec=1" --data-urlencode "res=$3" \
    --data-urlencode "url=$4" --data-urlencode "urlref=$5" ${6:+--data-urlencode "_id=$6"}
}
UA() { echo "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/$1.0.0.0 Safari/537.36"; }
S=https://site-test.example
if [ -z "${KEEP_RULES:-}" ]; then
$SQL "TRUNCATE matomo_tsr_journal; TRUNCATE matomo_tsr_daily; TRUNCATE matomo_tsr_error; TRUNCATE matomo_tsr_rule; TRUNCATE matomo_log_visit; TRUNCATE matomo_log_link_visit_action;
INSERT INTO matomo_tsr_rule (name,idsite,mode,conditions,enabled,ts_created,ts_updated) VALUES ('Chine direct generique haute resolution',0,'${MODE:-observe}','{\"country\":[\"cn\"],\"resolution\":{\"min_width\":3000},\"source\":{\"type\":\"direct\"},\"device_type\":[\"desktop\"],\"device_generic\":true}',1,NOW(),NOW());"
else
$SQL "TRUNCATE matomo_log_visit; TRUNCATE matomo_log_link_visit_action;"
fi
(cd $M && php console core:clear-caches >/dev/null 2>&1)
echo "A. spam sans cookie, 3 pages";      hit "$(UA 101)" zh-CN 3840x2160 $S/ "" ; hit "$(UA 101)" zh-CN 3840x2160 $S/p2 $S/ ; hit "$(UA 101)" zh-CN 3840x2160 $S/p3 $S/p2
echo "A2. spam avec cookie, 3 pages";     hit "$(UA 102)" zh-CN 5120x2880 $S/ "" aaaaaaaaaaaaaaa1; hit "$(UA 102)" zh-CN 5120x2880 $S/p2 $S/ aaaaaaaaaaaaaaa1; hit "$(UA 102)" zh-CN 5120x2880 $S/p3 "" aaaaaaaaaaaaaaa1
echo "B. visite francaise normale";       hit "$(UA 103)" fr-FR 1920x1080 $S/ "" bbbbbbbbbbbbbbb1
echo "C. chinois haute resolution venu de Google, 2 pages"; hit "$(UA 104)" zh-CN 3840x2160 $S/ https://www.google.com/ ccccccccccccccc1; hit "$(UA 104)" zh-CN 3840x2160 $S/p2 "" ccccccccccccccc1
echo "D. chinois resolution normale";     hit "$(UA 105)" zh-CN 1920x1080 $S/ "" ddddddddddddddd1
echo "E. chinois haute resolution avec campagne"; hit "$(UA 106)" zh-CN 3840x2160 "$S/?utm_campaign=promo" "" eeeeeeeeeeeeeee1
echo "F. iPhone chinois";                 hit "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" zh-CN 3840x2160 $S/ "" fffffffffffffff1
echo "G. navigateur sans ecran (filtrage officiel), 2 pages"; hit "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36" en-US 800x600 $S/ ""; hit "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36" en-US 800x600 $S/p2 $S/
sleep 1
echo "--- journal"; mysql -uroot matomo -e "SELECT source, idrule, reason, mode, hits, country, resolution, device_type, device_model, browser, referrer_host, ip_anon, url FROM matomo_tsr_journal ORDER BY idjournal"
echo "--- compteurs"; mysql -uroot matomo -e "SELECT day, source, idrule, reason, mode, sessions, hits FROM matomo_tsr_daily"
echo "--- visites enregistrees par Matomo"; mysql -uroot matomo -e "SELECT idvisit, location_country, config_resolution, referer_type, visit_total_actions FROM matomo_log_visit ORDER BY idvisit"
echo "--- erreurs"; mysql -uroot matomo -e "SELECT * FROM matomo_tsr_error"
