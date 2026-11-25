<?php

/**
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\TrackingSpamRules;

use Piwik\Date;
use Piwik\Piwik;
use Piwik\Plugins\TrackingSpamRules\Dao\JournalDao;
use Piwik\Plugins\TrackingSpamRules\Dao\RulesDao;
use Piwik\Plugins\TrackingSpamRules\Rule\RuleMatcher;
use Piwik\Tracker\Cache;

/**
 * Gestion des règles anti-spam et lecture du journal. Réservé au super-utilisateur.
 *
 * @method static \Piwik\Plugins\TrackingSpamRules\API getInstance()
 */
class API extends \Piwik\Plugin\API
{
    public function getRules(): array
    {
        Piwik::checkUserHasSuperUserAccess();
        return (new RulesDao())->getAll();
    }

    /**
     * Crée une règle. Elle démarre toujours en observation.
     *
     * @param string $name
     * @param string $conditions conditions au format JSON, reliées par ET
     * @param int $idSite 0 pour tous les sites
     */
    public function addRule(string $name, string $conditions, int $idSite = 0): int
    {
        Piwik::checkUserHasSuperUserAccess();
        $id = (new RulesDao())->add($this->checkName($name), max(0, $idSite), $this->checkConditions($conditions));
        Cache::clearCacheGeneral();
        return $id;
    }

    public function updateRule(int $idRule, string $name, string $conditions, int $idSite = 0): void
    {
        Piwik::checkUserHasSuperUserAccess();
        $this->checkRuleExists($idRule);
        (new RulesDao())->update($idRule, [
            'name' => $this->checkName($name),
            'conditions' => $this->checkConditions($conditions),
            'idsite' => max(0, $idSite),
        ]);
        Cache::clearCacheGeneral();
    }

    /**
     * @param string $mode « observe » ou « block »
     */
    public function setRuleMode(int $idRule, string $mode): void
    {
        Piwik::checkUserHasSuperUserAccess();
        $this->checkRuleExists($idRule);
        if (!in_array($mode, ['observe', 'block'], true)) {
            throw new \Exception('Mode inconnu : utiliser « observe » ou « block ».');
        }
        (new RulesDao())->update($idRule, ['mode' => $mode]);
        Cache::clearCacheGeneral();
    }

    public function setRuleEnabled(int $idRule, bool $enabled): void
    {
        Piwik::checkUserHasSuperUserAccess();
        $this->checkRuleExists($idRule);
        (new RulesDao())->update($idRule, ['enabled' => $enabled ? 1 : 0]);
        Cache::clearCacheGeneral();
    }

    public function deleteRule(int $idRule): void
    {
        Piwik::checkUserHasSuperUserAccess();
        (new RulesDao())->delete($idRule);
        Cache::clearCacheGeneral();
    }

    /**
     * Sessions captées, les plus récentes d'abord.
     *
     * @param string $source « rule », « official » ou vide pour tout
     */
    public function getJournal(int $idSite = 0, int $limit = 100, int $offset = 0, string $source = '', int $idRule = 0): array
    {
        Piwik::checkUserHasSuperUserAccess();
        return (new JournalDao())->getSessions($idSite, $limit, $offset, $source, $idRule);
    }

    public function getDailyCounts(int $idSite = 0, int $days = 30): array
    {
        Piwik::checkUserHasSuperUserAccess();
        $days = max(1, min(3660, $days));
        $to = Date::now();
        return (new JournalDao())->getDailyCounts($idSite, $to->subDay($days - 1)->toString(), $to->toString());
    }

    /**
     * Témoin de santé : nombre de requêtes évaluées et erreurs récentes.
     */
    public function getHealth(): array
    {
        Piwik::checkUserHasSuperUserAccess();
        return (new JournalDao())->getHealth(time());
    }

    public function flagLegit(int $idJournal, bool $legit = true): void
    {
        Piwik::checkUserHasSuperUserAccess();
        (new JournalDao())->setFlaggedLegit($idJournal, $legit);
    }

    private function checkRuleExists(int $idRule): void
    {
        if (!(new RulesDao())->get($idRule)) {
            throw new \Exception('Règle introuvable.');
        }
    }

    private function checkName(string $name): string
    {
        $name = trim($name);
        if ($name === '' || mb_strlen($name) > 100) {
            throw new \Exception('Le nom de la règle doit faire entre 1 et 100 caractères.');
        }
        return $name;
    }

    private function checkConditions(string $json): array
    {
        $conditions = json_decode(html_entity_decode($json, ENT_QUOTES), true);
        if (!is_array($conditions) || empty($conditions)) {
            throw new \Exception('Une règle doit contenir au moins une condition.');
        }
        $unknown = array_diff(array_keys($conditions), RuleMatcher::KNOWN_CONDITIONS);
        if ($unknown) {
            throw new \Exception('Condition inconnue : ' . implode(', ', $unknown));
        }
        return $conditions;
    }
}
