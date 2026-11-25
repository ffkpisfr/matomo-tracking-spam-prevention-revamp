<?php

/**
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\TrackingSpamRules;

use Piwik\Common;
use Piwik\Db;
use Piwik\Plugins\TrackingSpamRules\Dao\JournalDao;
use Piwik\Plugins\TrackingSpamRules\Dao\RulesDao;
use Piwik\Plugins\TrackingSpamRules\Dao\Schema;
use Piwik\Plugins\TrackingSpamRules\Rule\RuleMatcher;
use Piwik\Plugins\TrackingSpamRules\Tracker\FactsExtractor;
use Piwik\Tracker\Cache;
use Piwik\Tracker\Request;

class TrackingSpamRules extends \Piwik\Plugin
{
    public const CACHE_KEY = 'TrackingSpamRules.rules';
    public const EXCLUDED_PREFIX = 'excluded: TrackingSpamRules rule ';

    public function registerEvents()
    {
        return [
            // « after » : on passe après Tracking Spam Prevention, pour lire son motif sans le modifier
            'Tracker.isExcludedVisit' => ['function' => 'isExcludedVisit', 'after' => true],
            'Tracker.setTrackerCacheGeneral' => 'setTrackerCacheGeneral',
        ];
    }

    public function install()
    {
        (new Schema())->install();
    }

    public function uninstall()
    {
        (new Schema())->uninstall();
    }

    public function setTrackerCacheGeneral(&$cache)
    {
        try {
            $cache[self::CACHE_KEY] = (new RulesDao())->getEnabledForTracker();
        } catch (\Throwable $e) {
            $cache[self::CACHE_KEY] = []; // tables absentes (installation en cours) : aucune règle
        }
    }

    /**
     * Appelé par Matomo à chaque requête de suivi.
     * Principe : en cas d'erreur, la visite passe. On ne perd jamais de trafic à cause d'un bug du plugin.
     */
    public function isExcludedVisit(&$excluded, Request $request)
    {
        try {
            $this->evaluate($excluded, $request);
        } catch (\Throwable $e) {
            Common::printDebug('TrackingSpamRules: error ignored, visit not excluded: ' . $e->getMessage());
            try {
                (new JournalDao())->logError(get_class($e) . ': ' . $e->getMessage());
            } catch (\Throwable $ignored) {
            }
        }
    }

    private function evaluate(&$excluded, Request $request): void
    {
        if ($excluded === true) {
            return; // écarté par le cœur de Matomo (robot connu, requête invalide) : hors périmètre
        }

        $journal = new JournalDao();

        if (is_string($excluded) && $excluded !== '') {
            // écarté par Tracking Spam Prevention (ou un autre plugin) : on le journalise avec son motif
            $facts = (new FactsExtractor())->extract($request);
            $reason = mb_substr(trim(preg_replace('/^excluded:\s*/', '', $excluded)), 0, 100);
            $open = $journal->findOpenOfficialSession($facts['session_key'], $reason, $facts['timestamp']);
            if ($open) {
                $journal->addHit((int) $open['idjournal'], $facts, JournalDao::SOURCE_OFFICIAL, 0, $reason, 'block');
            } else {
                $journal->openSession($facts, JournalDao::SOURCE_OFFICIAL, 0, $reason, 'block');
            }
            return;
        }

        if ($excluded) {
            return;
        }

        $rules = $this->getRulesForSite((int) $request->getIdSite());
        if (empty($rules)) {
            return; // aucune règle : aucun coût
        }

        $facts = (new FactsExtractor())->extract($request);

        // 1. Le visiteur a-t-il déjà été capté dans les 30 dernières minutes ? Alors toute sa session suit.
        $open = $journal->findOpenRuleSession($facts['session_key'], $facts['timestamp']);
        if ($open) {
            $rule = $this->findRule($rules, (int) $open['idrule']);
            if ($rule) {
                $journal->addHit((int) $open['idjournal'], $facts, JournalDao::SOURCE_RULE, $rule['idrule'], '', $rule['mode']);
                $this->apply($excluded, $rule);
                return;
            }
        }

        // 2. Sinon, cette requête correspond-elle à une règle ?
        $rule = (new RuleMatcher())->findMatch($rules, $facts, function () use ($request, $facts) {
            return !$this->hasOngoingVisit($request, $facts);
        });
        if ($rule) {
            $journal->openSession($facts, JournalDao::SOURCE_RULE, $rule['idrule'], '', $rule['mode']);
            $this->apply($excluded, $rule);
        }
    }

    private function apply(&$excluded, array $rule): void
    {
        if ($rule['mode'] === 'block') {
            Common::printDebug('TrackingSpamRules: visit excluded by rule ' . $rule['idrule']);
            $excluded = self::EXCLUDED_PREFIX . $rule['idrule'];
        } else {
            Common::printDebug('TrackingSpamRules: visit observed (not excluded) by rule ' . $rule['idrule']);
        }
    }

    private function getRulesForSite(int $idSite): array
    {
        $cache = Cache::getCacheGeneral();
        $rules = $cache[self::CACHE_KEY] ?? [];
        return array_values(array_filter($rules, function ($rule) use ($idSite) {
            return (int) $rule['idsite'] === 0 || (int) $rule['idsite'] === $idSite;
        }));
    }

    private function findRule(array $rules, int $idRule): ?array
    {
        foreach ($rules as $rule) {
            if ((int) $rule['idrule'] === $idRule) {
                return $rule;
            }
        }
        return null;
    }

    /**
     * Une visite de ce visiteur est-elle déjà en cours dans Matomo ? Si oui, une page sans site d'origine
     * est la suite de cette visite, pas un accès direct.
     */
    private function hasOngoingVisit(Request $request, array $facts): bool
    {
        $idVisitor = $facts['idvisitor'];
        if (empty($idVisitor)) {
            return false;
        }
        $found = Db::get()->fetchOne(
            'SELECT 1 FROM ' . Common::prefixTable('log_visit') . ' WHERE idsite = ? AND idvisitor = ? AND visit_last_action_time >= ? LIMIT 1',
            [$facts['idsite'], $idVisitor, gmdate('Y-m-d H:i:s', $facts['timestamp'] - JournalDao::SESSION_SECONDS)]
        );
        return !empty($found);
    }
}
