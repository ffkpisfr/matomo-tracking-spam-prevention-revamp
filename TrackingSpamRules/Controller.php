<?php

/**
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\TrackingSpamRules;

use Piwik\Container\StaticContainer;
use Piwik\Intl\Data\Provider\RegionDataProvider;
use Piwik\Piwik;
use Piwik\Plugins\SitesManager\API as SitesManagerAPI;

class Controller extends \Piwik\Plugin\ControllerAdmin
{
    private const TEXT_KEYS = [
        'Observe', 'Block', 'ModeObserve', 'ModeBlock', 'AllSites', 'Official', 'Direct', 'Campaign', 'Any',
        'NoData', 'NoRules', 'Edit', 'Delete', 'ConfirmDelete', 'ConfirmBlock', 'Legit', 'Unflag', 'FlaggedLegit',
        'LegitHintRule', 'LegitHintOfficial', 'Enabled', 'Disabled', 'Enable', 'Disable', 'SwitchToBlock', 'SwitchToObserve',
        'CondCountry', 'CondResolutionIn', 'CondResolutionMin', 'CondSourceDirect', 'CondSourceReferrer', 'CondSourceCampaign',
        'CondDevice', 'CondGeneric', 'CondBrowser', 'CondOs', 'NeedCondition', 'NeedName', 'Saved', 'Pages',
        'HealthOk', 'HealthIdle', 'HealthErrors', 'EvaluatedToday', 'EvaluatedYesterday', 'Errors7Days',
        'NewRule', 'EditRule', 'RuleSource', 'OfficialSource', 'GenericDevice',
    ];

    public function index(): string
    {
        Piwik::checkUserHasSuperUserAccess();

        $countries = [];
        foreach (array_keys(StaticContainer::get(RegionDataProvider::class)->getCountryList()) as $code) {
            $countries[$code] = Piwik::translate('Intl_Country_' . strtoupper($code));
        }
        asort($countries);

        $sites = [];
        foreach (SitesManagerAPI::getInstance()->getAllSites() as $site) {
            $sites[(int) $site['idsite']] = $site['name'];
        }

        $texts = [];
        foreach (self::TEXT_KEYS as $key) {
            $texts[$key] = Piwik::translate('TrackingSpamRules_' . $key);
        }

        return $this->renderTemplate('index', [
            'tsrData' => json_encode(
                ['countries' => $countries, 'sites' => $sites, 'texts' => $texts],
                JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
            ),
        ]);
    }
}
