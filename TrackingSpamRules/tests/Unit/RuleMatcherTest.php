<?php

/**
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\TrackingSpamRules\tests\Unit;

use PHPUnit\Framework\TestCase;
use Piwik\Plugins\TrackingSpamRules\Rule\RuleMatcher;

/**
 * @group TrackingSpamRules
 * @group RuleMatcherTest
 * @group Plugins
 */
class RuleMatcherTest extends TestCase
{
    private const REFERENCE = [
        'country' => ['cn'],
        'resolution' => ['min_width' => 3000],
        'source' => ['type' => 'direct'],
        'device_type' => ['desktop'],
        'device_generic' => true,
    ];

    private function spam(array $override = []): array
    {
        return $override + [
            'country' => 'cn', 'res_width' => 3840, 'res_height' => 2160, 'referrer_host' => '', 'has_campaign' => false,
            'device_type' => 'desktop', 'device_generic' => true, 'browser' => 'Chrome', 'os' => 'Windows',
        ];
    }

    public function testReferencePatternMatches()
    {
        $this->assertTrue((new RuleMatcher())->matches(self::REFERENCE, $this->spam()));
    }

    /**
     * @dataProvider getNonMatchingFacts
     */
    public function testAllConditionsAreRequired(array $override)
    {
        $this->assertFalse((new RuleMatcher())->matches(self::REFERENCE, $this->spam($override)));
    }

    public static function getNonMatchingFacts(): array
    {
        return [
            'autre pays' => [['country' => 'fr']],
            'pays inconnu' => [['country' => '']],
            'résolution normale' => [['res_width' => 1920, 'res_height' => 1080]],
            'résolution inconnue' => [['res_width' => 0, 'res_height' => 0]],
            'venu d\'un autre site' => [['referrer_host' => 'google.com']],
            'venu d\'une campagne' => [['has_campaign' => true]],
            'téléphone' => [['device_type' => 'smartphone']],
            'appareil de marque connue' => [['device_generic' => false]],
        ];
    }

    public function testEmptyOrUnknownConditionsNeverMatch()
    {
        $matcher = new RuleMatcher();
        $this->assertFalse($matcher->matches([], $this->spam()));
        $this->assertFalse($matcher->matches(['country' => ['cn'], 'bounce' => true], $this->spam()));
        $this->assertFalse($matcher->matches(['resolution' => []], $this->spam()));
        $this->assertFalse($matcher->matches(['source' => ['type' => 'unknown']], $this->spam()));
    }

    public function testCountryAcceptsSeveralValuesAndIgnoresCase()
    {
        $matcher = new RuleMatcher();
        $this->assertTrue($matcher->matches(['country' => ['SG', 'CN']], $this->spam()));
        $this->assertFalse($matcher->matches(['country' => ['sg', 'hk']], $this->spam()));
    }

    public function testResolutionListAndBounds()
    {
        $matcher = new RuleMatcher();
        $this->assertTrue($matcher->matches(['resolution' => ['in' => ['800x600', '3840x2160']]], $this->spam()));
        $this->assertFalse($matcher->matches(['resolution' => ['in' => ['800x600']]], $this->spam()));
        $this->assertTrue($matcher->matches(['resolution' => ['min_width' => 3840, 'min_height' => 2160]], $this->spam()));
        $this->assertFalse($matcher->matches(['resolution' => ['min_width' => 3841]], $this->spam()));
        $this->assertFalse($matcher->matches(['resolution' => ['max_width' => 1920]], $this->spam()));
        $this->assertTrue($matcher->matches(['resolution' => ['max_height' => 2160]], $this->spam()));
    }

    public function testDirectSourceOnlyOnFirstPageOfAVisit()
    {
        $matcher = new RuleMatcher();
        $calls = 0;
        $ongoing = function () use (&$calls) {
            $calls++;
            return false; // une visite est déjà en cours : ce n'est pas un accès direct
        };
        $this->assertFalse($matcher->matches(self::REFERENCE, $this->spam(), $ongoing));
        $this->assertSame(1, $calls);

        // la vérification en base n'est pas faite quand une autre condition a déjà écarté la règle
        $this->assertFalse($matcher->matches(self::REFERENCE, $this->spam(['country' => 'fr']), $ongoing));
        $this->assertSame(1, $calls);

        $this->assertTrue($matcher->matches(self::REFERENCE, $this->spam(), function () {
            return true;
        }));
    }

    public function testReferrerSourceMatchesDomainAndSubdomains()
    {
        $matcher = new RuleMatcher();
        $rule = ['source' => ['type' => 'referrer', 'domains' => ['Spam.example']]];
        $this->assertTrue($matcher->matches($rule, $this->spam(['referrer_host' => 'spam.example'])));
        $this->assertTrue($matcher->matches($rule, $this->spam(['referrer_host' => 'a.spam.example'])));
        $this->assertFalse($matcher->matches($rule, $this->spam(['referrer_host' => 'notspam.example'])));
        $this->assertFalse($matcher->matches($rule, $this->spam()));
    }

    public function testCampaignSource()
    {
        $matcher = new RuleMatcher();
        $this->assertTrue($matcher->matches(['source' => ['type' => 'campaign']], $this->spam(['has_campaign' => true])));
        $this->assertFalse($matcher->matches(['source' => ['type' => 'campaign']], $this->spam()));
    }

    public function testBrowserAndOs()
    {
        $matcher = new RuleMatcher();
        $this->assertTrue($matcher->matches(['browser' => ['chrome'], 'os' => ['Windows', 'GNU/Linux']], $this->spam()));
        $this->assertFalse($matcher->matches(['browser' => ['Firefox']], $this->spam()));
    }

    public function testBlockingRuleWinsOverObservingRule()
    {
        $matcher = new RuleMatcher();
        $rules = [
            ['idrule' => 1, 'mode' => 'observe', 'conditions' => ['country' => ['cn']]],
            ['idrule' => 2, 'mode' => 'block', 'conditions' => ['country' => ['fr']]],
            ['idrule' => 3, 'mode' => 'block', 'conditions' => self::REFERENCE],
        ];
        $this->assertSame(3, $matcher->findMatch($rules, $this->spam())['idrule']);
        $this->assertSame(1, $matcher->findMatch($rules, $this->spam(['res_width' => 1920]))['idrule']);
        $this->assertNull($matcher->findMatch($rules, $this->spam(['country' => 'de'])));
        $this->assertNull($matcher->findMatch([], $this->spam()));
    }
}
