<?php

/**
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\TrackingSpamRules\Rule;

/**
 * Évalue des règles sur les « faits » d'une requête de suivi.
 * Classe pure, sans dépendance à Matomo, pour être testable isolément.
 *
 * Une règle = des conditions reliées par ET. Une condition absente n'est pas évaluée.
 * Conditions reconnues (tableau `conditions`) :
 *  - country:      ['cn', 'sg']                       pays parmi (codes ISO en minuscules)
 *  - resolution:   ['in' => ['3840x2160']]            résolution parmi
 *                  ['min_width' => 3000, 'min_height' => 2000, 'max_width' => .., 'max_height' => ..]
 *  - source:       ['type' => 'direct']               accès direct (première page d'une visite)
 *                  ['type' => 'referrer', 'domains' => ['spam.example']]
 *                  ['type' => 'campaign']
 *  - device_type:  ['desktop']                        type d'appareil parmi
 *  - device_generic: true                             appareil sans marque identifiée
 *  - browser:      ['Chrome']                         navigateur parmi
 *  - os:           ['Windows']                        système parmi
 */
class RuleMatcher
{
    public const KNOWN_CONDITIONS = ['country', 'resolution', 'source', 'device_type', 'device_generic', 'browser', 'os'];

    /**
     * @param array<int, array> $rules   règles actives, déjà filtrées par site
     * @param array $facts               faits de la requête
     * @param callable|null $isNewVisit  appelé seulement si une condition « accès direct » doit trancher
     * @return array|null la règle retenue : une règle en blocage est prioritaire sur une règle en observation
     */
    public function findMatch(array $rules, array $facts, ?callable $isNewVisit = null): ?array
    {
        $observed = null;
        foreach ($rules as $rule) {
            if (!$this->matches($rule['conditions'] ?? [], $facts, $isNewVisit)) {
                continue;
            }
            if (($rule['mode'] ?? 'observe') === 'block') {
                return $rule;
            }
            $observed = $observed ?? $rule;
        }
        return $observed;
    }

    public function matches(array $conditions, array $facts, ?callable $isNewVisit = null): bool
    {
        if (empty($conditions)) {
            return false; // une règle vide ne capte jamais rien
        }
        foreach ($conditions as $name => $_) {
            if (!in_array($name, self::KNOWN_CONDITIONS, true)) {
                return false; // condition inconnue : on ne devine pas, la règle ne capte rien
            }
        }

        if (isset($conditions['country']) && !$this->inList($facts['country'] ?? '', $conditions['country'])) {
            return false;
        }
        if (isset($conditions['resolution']) && !$this->matchesResolution($conditions['resolution'], $facts)) {
            return false;
        }
        if (isset($conditions['device_type']) && !$this->inList($facts['device_type'] ?? '', $conditions['device_type'])) {
            return false;
        }
        if (isset($conditions['device_generic']) && (bool) $conditions['device_generic'] !== (bool) ($facts['device_generic'] ?? false)) {
            return false;
        }
        if (isset($conditions['browser']) && !$this->inList($facts['browser'] ?? '', $conditions['browser'])) {
            return false;
        }
        if (isset($conditions['os']) && !$this->inList($facts['os'] ?? '', $conditions['os'])) {
            return false;
        }
        // la source en dernier : c'est la seule condition qui peut coûter une requête en base
        if (isset($conditions['source']) && !$this->matchesSource($conditions['source'], $facts, $isNewVisit)) {
            return false;
        }
        return true;
    }

    private function inList(string $value, $list): bool
    {
        if ($value === '' || !is_array($list)) {
            return false;
        }
        return in_array(mb_strtolower($value), array_map('mb_strtolower', array_map('strval', $list)), true);
    }

    private function matchesResolution($condition, array $facts): bool
    {
        $width = (int) ($facts['res_width'] ?? 0);
        $height = (int) ($facts['res_height'] ?? 0);
        if (!is_array($condition) || $width <= 0 || $height <= 0) {
            return false; // résolution inconnue : la condition n'est pas remplie
        }
        if (isset($condition['in']) && !$this->inList($width . 'x' . $height, $condition['in'])) {
            return false;
        }
        if (isset($condition['min_width']) && $width < (int) $condition['min_width']) {
            return false;
        }
        if (isset($condition['max_width']) && $width > (int) $condition['max_width']) {
            return false;
        }
        if (isset($condition['min_height']) && $height < (int) $condition['min_height']) {
            return false;
        }
        if (isset($condition['max_height']) && $height > (int) $condition['max_height']) {
            return false;
        }
        return (bool) array_intersect(array_keys($condition), ['in', 'min_width', 'max_width', 'min_height', 'max_height']);
    }

    private function matchesSource($condition, array $facts, ?callable $isNewVisit): bool
    {
        $type = is_array($condition) ? ($condition['type'] ?? '') : '';
        $hasCampaign = (bool) ($facts['has_campaign'] ?? false);
        $referrerHost = (string) ($facts['referrer_host'] ?? '');

        switch ($type) {
            case 'campaign':
                return $hasCampaign;
            case 'referrer':
                return $referrerHost !== '' && $this->hostInList($referrerHost, $condition['domains'] ?? []);
            case 'direct':
                if ($hasCampaign || $referrerHost !== '') {
                    return false;
                }
                // Sans site d'origine ni campagne : accès direct seulement si c'est la première page
                // de la visite. Sinon c'est la suite d'une visite déjà commencée ailleurs.
                return $isNewVisit === null ? true : (bool) $isNewVisit();
        }
        return false;
    }

    private function hostInList(string $host, $domains): bool
    {
        if (!is_array($domains)) {
            return false;
        }
        $host = mb_strtolower($host);
        foreach ($domains as $domain) {
            $domain = mb_strtolower(trim((string) $domain));
            if ($domain !== '' && ($host === $domain || str_ends_with($host, '.' . $domain))) {
                return true;
            }
        }
        return false;
    }
}
