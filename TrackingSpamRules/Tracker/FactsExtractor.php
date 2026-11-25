<?php

/**
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\TrackingSpamRules\Tracker;

use Matomo\Network\IP;
use Piwik\Config;
use Piwik\DeviceDetector\DeviceDetectorFactory;
use Piwik\Plugins\PrivacyManager\Config as PrivacyManagerConfig;
use Piwik\Plugins\PrivacyManager\IPAnonymizer;
use Piwik\Plugins\UserCountry\LocationProvider;
use Piwik\Plugins\UserCountry\VisitorGeolocator;
use Piwik\SettingsPiwik;
use Piwik\Tracker\Request;

/**
 * Tire d'une requête de suivi les seules informations utiles aux règles et au journal.
 * Liste fermée : ni token_auth, ni identifiant utilisateur, ni adresse IP complète.
 */
class FactsExtractor
{
    public function extract(Request $request): array
    {
        $ip = $request->getIpString();
        $userAgent = (string) $request->getUserAgent();
        $url = (string) $request->getParam('url');
        $referrer = (string) $request->getParam('urlref');

        [$width, $height] = $this->parseResolution((string) $request->getParam('res'));

        $pageHost = $this->host($url);
        $referrerHost = $this->host($referrer);
        if ($referrerHost !== '' && $referrerHost === $pageHost) {
            $referrerHost = ''; // navigation interne au site : pas une origine externe
            $internal = true;
        }

        $device = $this->detectDevice($userAgent, $request->getClientHints());

        return [
            'idsite'         => (int) $request->getIdSite(),
            'timestamp'      => (int) $request->getCurrentTimestamp(),
            'session_key'    => sha1(SettingsPiwik::getSalt() . '|' . $request->getIdSite() . '|' . $ip . '|' . $userAgent),
            'idvisitor'      => $request->getVisitorId(),
            'country'        => $this->detectCountry($ip, $request->getBrowserLanguage()),
            'res_width'      => $width,
            'res_height'     => $height,
            'resolution'     => $width && $height ? $width . 'x' . $height : '',
            'url'            => mb_substr($this->stripQuery($url), 0, 500),
            'referrer_host'  => $referrerHost,
            'is_internal'    => !empty($internal),
            'has_campaign'   => $this->hasCampaign($url),
            'device_type'    => $device['type'],
            'device_generic' => $device['generic'],
            'device_model'   => $device['model'],
            'browser'        => $device['browser'],
            'os'             => $device['os'],
            'ip_anon'        => $this->anonymizeIp($ip),
        ];
    }

    private function parseResolution(string $res): array
    {
        if (preg_match('/^(\d{2,5})x(\d{2,5})$/', $res, $m)) {
            return [(int) $m[1], (int) $m[2]];
        }
        return [0, 0];
    }

    private function host(string $url): string
    {
        $host = $url === '' ? '' : parse_url($url, PHP_URL_HOST);
        $host = is_string($host) ? mb_strtolower($host) : '';
        return str_starts_with($host, 'www.') ? substr($host, 4) : $host;
    }

    private function stripQuery(string $url): string
    {
        $pos = strcspn($url, '?#');
        return substr($url, 0, $pos);
    }

    private function hasCampaign(string $url): bool
    {
        $query = parse_url($url, PHP_URL_QUERY);
        $fragment = parse_url($url, PHP_URL_FRAGMENT);
        $params = [];
        parse_str((string) $query, $params);
        $fragmentParams = [];
        parse_str((string) $fragment, $fragmentParams);
        $params += $fragmentParams;
        if (empty($params)) {
            return false;
        }
        $names = Config::getInstance()->Tracker['campaign_var_name'] ?? '';
        $names = array_filter(array_map('trim', explode(',', is_array($names) ? implode(',', $names) : (string) $names)));
        $names = array_merge($names, ['gclid', 'fbclid', 'msclkid']);
        foreach ($names as $name) {
            if (!empty($params[$name])) {
                return true;
            }
        }
        return false;
    }

    private function detectCountry(string $ip, $language): string
    {
        // même appel que Matomo et que Tracking Spam Prevention, pour partager le cache et le résultat
        $location = (new VisitorGeolocator())->getLocation(['ip' => $ip, 'lang' => $language], true);
        return mb_strtolower((string) ($location[LocationProvider::COUNTRY_CODE_KEY] ?? ''));
    }

    private function detectDevice(string $userAgent, array $clientHints): array
    {
        $detector = (new DeviceDetectorFactory())->makeInstance($userAgent, $clientHints);
        $brand = (string) $detector->getBrandName();
        $client = $detector->getClient();
        $os = $detector->getOs();
        return [
            'type'    => (string) $detector->getDeviceName(),
            'generic' => $brand === '',
            'model'   => mb_substr(trim($brand . ' ' . (string) $detector->getModel()), 0, 100),
            'browser' => is_array($client) ? (string) ($client['name'] ?? '') : '',
            'os'      => is_array($os) ? (string) ($os['name'] ?? '') : '',
        ];
    }

    private function anonymizeIp(string $ip): string
    {
        // au moins 2 octets masqués, davantage si Matomo est réglé plus strictement
        $mask = 2;
        try {
            $mask = max($mask, (int) (new PrivacyManagerConfig())->ipAddressMaskLength);
        } catch (\Throwable $e) {
        }
        return IPAnonymizer::applyIPMask(IP::fromStringIP($ip), $mask)->toString();
    }
}
