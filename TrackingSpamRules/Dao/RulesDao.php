<?php

/**
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\TrackingSpamRules\Dao;

use Piwik\Date;
use Piwik\Db;

class RulesDao
{
    private function table(): string
    {
        return Schema::table(Schema::RULE);
    }

    public function getAll(): array
    {
        $rows = Db::get()->fetchAll('SELECT * FROM ' . $this->table() . ' ORDER BY idrule ASC');
        return array_map([$this, 'hydrate'], $rows);
    }

    /** Règles actives, sous la forme minimale mise en cache pour le suivi. */
    public function getEnabledForTracker(): array
    {
        $rules = [];
        foreach ($this->getAll() as $rule) {
            if ($rule['enabled']) {
                $rules[] = [
                    'idrule' => $rule['idrule'],
                    'idsite' => $rule['idsite'],
                    'mode' => $rule['mode'],
                    'conditions' => $rule['conditions'],
                ];
            }
        }
        return $rules;
    }

    public function get(int $idRule): ?array
    {
        $row = Db::get()->fetchRow('SELECT * FROM ' . $this->table() . ' WHERE idrule = ?', [$idRule]);
        return $row ? $this->hydrate($row) : null;
    }

    public function add(string $name, int $idSite, array $conditions): int
    {
        $now = Date::now()->getDatetime();
        // toute nouvelle règle démarre en observation
        Db::get()->query(
            'INSERT INTO ' . $this->table() . ' (name, idsite, mode, conditions, enabled, ts_created, ts_updated) VALUES (?, ?, ?, ?, 1, ?, ?)',
            [$name, $idSite, 'observe', json_encode($conditions), $now, $now]
        );
        return (int) Db::get()->lastInsertId();
    }

    public function update(int $idRule, array $fields): void
    {
        $allowed = ['name', 'idsite', 'mode', 'conditions', 'enabled'];
        $sets = [];
        $bind = [];
        foreach ($fields as $field => $value) {
            if (!in_array($field, $allowed, true)) {
                continue;
            }
            $sets[] = "`$field` = ?";
            $bind[] = $field === 'conditions' ? json_encode($value) : $value;
        }
        if (!$sets) {
            return;
        }
        $sets[] = 'ts_updated = ?';
        $bind[] = Date::now()->getDatetime();
        $bind[] = $idRule;
        Db::get()->query('UPDATE ' . $this->table() . ' SET ' . implode(', ', $sets) . ' WHERE idrule = ?', $bind);
    }

    public function delete(int $idRule): void
    {
        Db::get()->query('DELETE FROM ' . $this->table() . ' WHERE idrule = ?', [$idRule]);
    }

    private function hydrate(array $row): array
    {
        return [
            'idrule' => (int) $row['idrule'],
            'name' => $row['name'],
            'idsite' => (int) $row['idsite'],
            'mode' => $row['mode'] === 'block' ? 'block' : 'observe',
            'conditions' => json_decode($row['conditions'], true) ?: [],
            'enabled' => (int) $row['enabled'] === 1,
            'ts_created' => $row['ts_created'],
            'ts_updated' => $row['ts_updated'],
        ];
    }
}
