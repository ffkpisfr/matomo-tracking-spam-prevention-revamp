<?php

/**
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\TrackingSpamRules\Dao;

use Piwik\Common;
use Piwik\Db;
use Piwik\DbHelper;

class Schema
{
    public const RULE = 'tsr_rule';
    public const JOURNAL = 'tsr_journal';
    public const DAILY = 'tsr_daily';
    public const ERROR = 'tsr_error';

    public static function table(string $name): string
    {
        return Common::prefixTable($name);
    }

    public function install(): void
    {
        DbHelper::createTable(self::RULE, "
            `idrule` INT UNSIGNED NOT NULL AUTO_INCREMENT,
            `name` VARCHAR(100) NOT NULL,
            `idsite` INT UNSIGNED NOT NULL DEFAULT 0,
            `mode` VARCHAR(10) NOT NULL DEFAULT 'observe',
            `conditions` TEXT NOT NULL,
            `enabled` TINYINT UNSIGNED NOT NULL DEFAULT 1,
            `ts_created` DATETIME NOT NULL,
            `ts_updated` DATETIME NOT NULL,
            PRIMARY KEY (`idrule`)");

        // une ligne par session captée (pas par page vue)
        DbHelper::createTable(self::JOURNAL, "
            `idjournal` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `idsite` INT UNSIGNED NOT NULL,
            `session_key` CHAR(40) NOT NULL,
            `source` VARCHAR(10) NOT NULL,
            `idrule` INT UNSIGNED NOT NULL DEFAULT 0,
            `reason` VARCHAR(100) NOT NULL DEFAULT '',
            `mode` VARCHAR(10) NOT NULL,
            `first_seen` DATETIME NOT NULL,
            `last_seen` DATETIME NOT NULL,
            `hits` INT UNSIGNED NOT NULL DEFAULT 1,
            `url` VARCHAR(500) NOT NULL DEFAULT '',
            `referrer_host` VARCHAR(190) NOT NULL DEFAULT '',
            `has_campaign` TINYINT UNSIGNED NOT NULL DEFAULT 0,
            `resolution` VARCHAR(12) NOT NULL DEFAULT '',
            `country` VARCHAR(3) NOT NULL DEFAULT '',
            `device_type` VARCHAR(30) NOT NULL DEFAULT '',
            `device_model` VARCHAR(100) NOT NULL DEFAULT '',
            `browser` VARCHAR(60) NOT NULL DEFAULT '',
            `os` VARCHAR(60) NOT NULL DEFAULT '',
            `ip_anon` VARCHAR(45) NOT NULL DEFAULT '',
            `flagged_legit` TINYINT UNSIGNED NOT NULL DEFAULT 0,
            PRIMARY KEY (`idjournal`),
            KEY `idx_session` (`session_key`, `last_seen`),
            KEY `idx_site_time` (`idsite`, `last_seen`)");

        // compteurs sans donnée de visite, gardés sans limite
        DbHelper::createTable(self::DAILY, "
            `day` DATE NOT NULL,
            `idsite` INT UNSIGNED NOT NULL,
            `source` VARCHAR(10) NOT NULL,
            `idrule` INT UNSIGNED NOT NULL DEFAULT 0,
            `reason` VARCHAR(100) NOT NULL DEFAULT '',
            `mode` VARCHAR(10) NOT NULL,
            `sessions` INT UNSIGNED NOT NULL DEFAULT 0,
            `hits` INT UNSIGNED NOT NULL DEFAULT 0,
            PRIMARY KEY (`day`, `idsite`, `source`, `idrule`, `reason`, `mode`)");

        DbHelper::createTable(self::ERROR, "
            `iderror` INT UNSIGNED NOT NULL AUTO_INCREMENT,
            `ts` DATETIME NOT NULL,
            `message` VARCHAR(500) NOT NULL,
            PRIMARY KEY (`iderror`),
            KEY `idx_ts` (`ts`)");
    }

    public function uninstall(): void
    {
        Db::dropTables([self::table(self::RULE), self::table(self::JOURNAL), self::table(self::DAILY), self::table(self::ERROR)]);
    }
}
