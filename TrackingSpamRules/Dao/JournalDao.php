<?php

/**
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\TrackingSpamRules\Dao;

use Piwik\Db;

/**
 * Journal des sessions captées. Utilisé pendant le suivi : requêtes courtes, sur index.
 */
class JournalDao
{
    public const SESSION_SECONDS = 1800;
    public const SOURCE_RULE = 'rule';
    public const SOURCE_OFFICIAL = 'official';
    public const SOURCE_HEARTBEAT = 'heartbeat';
    /** Au-delà, on compte sans détailler (protection contre un flot de robots). */
    public const MAX_SESSIONS_PER_DAY = 5000;

    private function journal(): string
    {
        return Schema::table(Schema::JOURNAL);
    }

    private function daily(): string
    {
        return Schema::table(Schema::DAILY);
    }

    /** Session captée par une règle et encore ouverte (moins de 30 minutes depuis sa dernière page). */
    public function findOpenRuleSession(string $sessionKey, int $timestamp): ?array
    {
        $row = Db::get()->fetchRow(
            'SELECT idjournal, idrule, mode FROM ' . $this->journal()
            . ' WHERE session_key = ? AND last_seen >= ? AND source = ? ORDER BY last_seen DESC LIMIT 1',
            [$sessionKey, gmdate('Y-m-d H:i:s', $timestamp - self::SESSION_SECONDS), self::SOURCE_RULE]
        );
        return $row ?: null;
    }

    public function findOpenOfficialSession(string $sessionKey, string $reason, int $timestamp): ?array
    {
        $row = Db::get()->fetchRow(
            'SELECT idjournal FROM ' . $this->journal()
            . ' WHERE session_key = ? AND last_seen >= ? AND source = ? AND reason = ? ORDER BY last_seen DESC LIMIT 1',
            [$sessionKey, gmdate('Y-m-d H:i:s', $timestamp - self::SESSION_SECONDS), self::SOURCE_OFFICIAL, $reason]
        );
        return $row ?: null;
    }

    public function addHit(int $idJournal, array $facts, string $source, int $idRule, string $reason, string $mode): void
    {
        Db::get()->query(
            'UPDATE ' . $this->journal() . ' SET hits = hits + 1, last_seen = ? WHERE idjournal = ?',
            [gmdate('Y-m-d H:i:s', $facts['timestamp']), $idJournal]
        );
        $this->count($facts, $source, $idRule, $reason, $mode, 0);
    }

    public function openSession(array $facts, string $source, int $idRule, string $reason, string $mode): void
    {
        $this->count($facts, $source, $idRule, $reason, $mode, 1);

        $day = gmdate('Y-m-d', $facts['timestamp']);
        $sessionsToday = (int) Db::get()->fetchOne(
            'SELECT sessions FROM ' . $this->daily() . ' WHERE day = ? AND idsite = ? AND source = ? AND idrule = ? AND reason = ? AND mode = ?',
            [$day, $facts['idsite'], $source, $idRule, $reason, $mode]
        );
        if ($sessionsToday > self::MAX_SESSIONS_PER_DAY) {
            return; // compté, mais plus détaillé
        }

        $time = gmdate('Y-m-d H:i:s', $facts['timestamp']);
        Db::get()->query(
            'INSERT INTO ' . $this->journal() . ' (idsite, session_key, source, idrule, reason, mode, first_seen, last_seen, hits,
                url, referrer_host, has_campaign, resolution, country, device_type, device_model, browser, os, ip_anon)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $facts['idsite'], $facts['session_key'], $source, $idRule, $reason, $mode, $time, $time,
                $facts['url'], mb_substr($facts['referrer_host'], 0, 190), $facts['has_campaign'] ? 1 : 0, $facts['resolution'],
                $facts['country'], $facts['device_type'], $facts['device_model'], $facts['browser'], $facts['os'], $facts['ip_anon'],
            ]
        );
    }

    private function count(array $facts, string $source, int $idRule, string $reason, string $mode, int $newSessions): void
    {
        Db::get()->query(
            'INSERT INTO ' . $this->daily() . ' (day, idsite, source, idrule, reason, mode, sessions, hits) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE sessions = sessions + ?, hits = hits + 1',
            [gmdate('Y-m-d', $facts['timestamp']), $facts['idsite'], $source, $idRule, $reason, $mode, $newSessions, $newSessions]
        );
    }

    /** Compte une requête évaluée : sert au témoin de santé (le plugin tourne-t-il encore ?). */
    public function heartbeat(int $idSite, int $timestamp): void
    {
        Db::get()->query(
            'INSERT INTO ' . $this->daily() . " (day, idsite, source, idrule, reason, mode, sessions, hits) VALUES (?, ?, ?, 0, '', '', 0, 1)
             ON DUPLICATE KEY UPDATE hits = hits + 1",
            [gmdate('Y-m-d', $timestamp), $idSite, self::SOURCE_HEARTBEAT]
        );
    }

    public function getHealth(int $now): array
    {
        $evaluated = function (string $day) {
            return (int) Db::get()->fetchOne(
                'SELECT COALESCE(SUM(hits), 0) FROM ' . $this->daily() . ' WHERE day = ? AND source = ?',
                [$day, self::SOURCE_HEARTBEAT]
            );
        };
        $errors = Schema::table(Schema::ERROR);
        return [
            'evaluated_today' => $evaluated(gmdate('Y-m-d', $now)),
            'evaluated_yesterday' => $evaluated(gmdate('Y-m-d', $now - 86400)),
            'errors_7_days' => (int) Db::get()->fetchOne('SELECT COUNT(*) FROM ' . $errors . ' WHERE ts >= ?', [gmdate('Y-m-d H:i:s', $now - 7 * 86400)]),
            'last_errors' => Db::get()->fetchAll('SELECT ts, message FROM ' . $errors . ' ORDER BY iderror DESC LIMIT 5'),
        ];
    }

    public function getSessions(int $idSite, int $limit, int $offset, ?string $source = null, ?int $idRule = null): array
    {
        $where = [];
        $bind = [];
        if ($idSite > 0) {
            $where[] = 'idsite = ?';
            $bind[] = $idSite;
        }
        if ($source !== null && $source !== '') {
            $where[] = 'source = ?';
            $bind[] = $source;
        }
        if ($idRule !== null && $idRule > 0) {
            $where[] = 'idrule = ?';
            $bind[] = $idRule;
        }
        $sql = 'SELECT idjournal, idsite, source, idrule, reason, mode, first_seen, last_seen, hits, url, referrer_host, has_campaign,
                       resolution, country, device_type, device_model, browser, os, ip_anon, flagged_legit
                FROM ' . $this->journal() . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
            . ' ORDER BY last_seen DESC LIMIT ' . max(1, min(500, $limit)) . ' OFFSET ' . max(0, $offset);
        return Db::get()->fetchAll($sql, $bind);
    }

    public function getDailyCounts(int $idSite, string $fromDay, string $toDay): array
    {
        $bind = [$fromDay, $toDay];
        $sql = 'SELECT day, idsite, source, idrule, reason, mode, sessions, hits FROM ' . $this->daily() . ' WHERE day >= ? AND day <= ? AND source <> ?';
        $bind[] = self::SOURCE_HEARTBEAT;
        if ($idSite > 0) {
            $sql .= ' AND idsite = ?';
            $bind[] = $idSite;
        }
        return Db::get()->fetchAll($sql . ' ORDER BY day DESC, sessions DESC', $bind);
    }

    public function setFlaggedLegit(int $idJournal, bool $flagged): void
    {
        Db::get()->query('UPDATE ' . $this->journal() . ' SET flagged_legit = ? WHERE idjournal = ?', [$flagged ? 1 : 0, $idJournal]);
    }

    /** Purge : 30 jours, 90 jours pour les sessions marquées « légitime ». */
    public function purge(int $now): int
    {
        $result = Db::get()->query(
            'DELETE FROM ' . $this->journal() . ' WHERE (flagged_legit = 0 AND last_seen < ?) OR last_seen < ?',
            [gmdate('Y-m-d H:i:s', $now - 30 * 86400), gmdate('Y-m-d H:i:s', $now - 90 * 86400)]
        );
        Db::get()->query('DELETE FROM ' . Schema::table(Schema::ERROR) . ' WHERE ts < ?', [gmdate('Y-m-d H:i:s', $now - 30 * 86400)]);
        return (int) Db::get()->rowCount($result);
    }

    public function logError(string $message): void
    {
        Db::get()->query(
            'INSERT INTO ' . Schema::table(Schema::ERROR) . ' (ts, message) VALUES (?, ?)',
            [gmdate('Y-m-d H:i:s'), mb_substr($message, 0, 500)]
        );
    }
}
