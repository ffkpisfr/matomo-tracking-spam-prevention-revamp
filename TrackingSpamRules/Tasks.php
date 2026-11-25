<?php

/**
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\TrackingSpamRules;

use Piwik\Plugins\TrackingSpamRules\Dao\JournalDao;

class Tasks extends \Piwik\Plugin\Tasks
{
    public function schedule()
    {
        $this->daily('purgeJournal');
    }

    /**
     * Supprime du journal ce qui a plus de 30 jours (90 jours pour les sessions marquées « légitime »).
     */
    public function purgeJournal()
    {
        (new JournalDao())->purge(time());
    }
}
