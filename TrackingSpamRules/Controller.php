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
        $english = json_decode((string) file_get_contents(__DIR__ . '/lang/en.json'), true);
        foreach (array_keys($english['TrackingSpamRules'] ?? []) as $key) {
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
