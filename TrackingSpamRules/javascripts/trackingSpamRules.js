/*!
 * TrackingSpamRules - admin screen (prototype).
 * Plain JavaScript on purpose: no build step, easy to read and to rewrite with Matomo's own components.
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */
(function ($) {
    $(function () {
        var root = document.getElementById('tsr');
        if (!root) {
            return;
        }

        var data = JSON.parse(document.getElementById('tsr-data').textContent);
        var T = data.texts, countries = data.countries, sites = data.sites;
        var rules = [], journalOffset = 0, PAGE = 50, selectedCountries = [];

        function esc(value) {
            return $('<div>').text(value === null || value === undefined ? '' : String(value)).html();
        }

        function fmt(text, value) {
            return text.replace('%s', value);
        }

        function api(method, params, callback) {
            var ajax = new ajaxHelper();
            ajax.addParams({module: 'API', method: 'TrackingSpamRules.' + method, format: 'json'}, 'get');
            ajax.addParams(params || {}, 'post');
            ajax.setFormat('json');
            ajax.setCallback(function (response) {
                if (response && response.result === 'error') {
                    showError(response.message);
                    return;
                }
                callback(response);
            });
            ajax.send();
        }

        function showError(message) {
            $('#tsr-form-error').text(message || '');
            if ($('#tsr-form').is(':hidden')) {
                $('#tsr-rules-msg').text(message || '').addClass('tsr-error');
            }
        }

        function list(value) {
            return String(value || '').split(',').map(function (item) {
                return item.trim();
            }).filter(Boolean);
        }

        function siteName(idSite) {
            return parseInt(idSite, 10) === 0 ? T.AllSites : (sites[idSite] || ('#' + idSite));
        }

        function countryName(code) {
            return countries[code] || String(code).toUpperCase();
        }

        function modeBadge(mode) {
            return mode === 'block'
                ? '<span class="tsr-badge tsr-block" title="' + esc(T.ModeBlock) + '">' + esc(T.Block) + '</span>'
                : '<span class="tsr-badge tsr-observe" title="' + esc(T.ModeObserve) + '">' + esc(T.Observe) + '</span>';
        }

        function describe(conditions) {
            var out = [], c = conditions || {};
            if (c.country) {
                out.push(fmt(T.CondCountry, c.country.map(countryName).join(', ')));
            }
            if (c.resolution && c.resolution['in']) {
                out.push(fmt(T.CondResolutionIn, c.resolution['in'].join(', ')));
            }
            if (c.resolution && c.resolution.min_width) {
                out.push(fmt(T.CondResolutionMin, c.resolution.min_width));
            }
            if (c.source && c.source.type === 'direct') {
                out.push(T.CondSourceDirect);
            }
            if (c.source && c.source.type === 'referrer') {
                out.push(fmt(T.CondSourceReferrer, (c.source.domains || []).join(', ')));
            }
            if (c.source && c.source.type === 'campaign') {
                out.push(T.CondSourceCampaign);
            }
            if (c.device_type) {
                out.push(fmt(T.CondDevice, c.device_type.join(', ')));
            }
            if (c.device_generic) {
                out.push(T.CondGeneric);
            }
            if (c.browser) {
                out.push(fmt(T.CondBrowser, c.browser.join(', ')));
            }
            if (c.os) {
                out.push(fmt(T.CondOs, c.os.join(', ')));
            }
            return out;
        }

        function ruleName(idRule) {
            for (var i = 0; i < rules.length; i++) {
                if (rules[i].idrule === parseInt(idRule, 10)) {
                    return rules[i].name;
                }
            }
            return '#' + idRule;
        }

        function sourceLabel(row) {
            return row.source === 'official'
                ? esc(T.OfficialSource) + ' : ' + esc(row.reason)
                : esc(T.RuleSource) + ' : ' + esc(ruleName(row.idrule));
        }

        // ---------- health ----------
        function loadHealth() {
            api('getHealth', {}, function (h) {
                var state = h.errors_7_days > 0 ? 'ko' : (h.evaluated_today > 0 ? 'ok' : 'idle');
                var text = state === 'ko' ? T.HealthErrors : (state === 'ok' ? T.HealthOk : T.HealthIdle);
                var html = '<p><span class="tsr-health-dot tsr-' + state + '"></span>' + esc(text) + '</p>'
                    + '<p class="tsr-health-figures"><span>' + esc(T.EvaluatedToday) + ' : <strong>' + esc(h.evaluated_today) + '</strong> ('
                    + esc(T.EvaluatedYesterday) + ' : ' + esc(h.evaluated_yesterday) + ')</span>'
                    + '<span>' + esc(T.Errors7Days) + ' : <strong>' + esc(h.errors_7_days) + '</strong></span></p>';
                (h.last_errors || []).forEach(function (error) {
                    html += '<p class="tsr-error">' + esc(error.ts) + ' — ' + esc(error.message) + '</p>';
                });
                $('#tsr-health').html(html);
            });
        }

        // ---------- volume ----------
        function loadVolume() {
            api('getDailyCounts', {idSite: $('#tsr-site').val(), days: $('#tsr-days').val()}, function (rows) {
                var groups = {}, order = [];
                (rows || []).forEach(function (row) {
                    var key = [row.source, row.idrule, row.reason, row.mode].join('|');
                    if (!groups[key]) {
                        groups[key] = {row: row, sessions: 0, hits: 0};
                        order.push(key);
                    }
                    groups[key].sessions += parseInt(row.sessions, 10);
                    groups[key].hits += parseInt(row.hits, 10);
                });
                order.sort(function (a, b) {
                    return groups[b].sessions - groups[a].sessions;
                });
                var html = order.map(function (key) {
                    var g = groups[key];
                    var badge = g.row.source === 'official'
                        ? '<span class="tsr-badge tsr-official">' + esc(T.Block) + '</span>' : modeBadge(g.row.mode);
                    return '<tr><td>' + sourceLabel(g.row) + '</td><td>' + badge + '</td><td class="tsr-num">'
                        + g.sessions + '</td><td class="tsr-num">' + g.hits + '</td></tr>';
                }).join('');
                $('#tsr-volume tbody').html(html || '<tr><td colspan="4">' + esc(T.NoData) + '</td></tr>');
            });
        }

        // ---------- rules ----------
        function loadRules(then) {
            api('getRules', {}, function (response) {
                rules = response || [];
                var html = rules.map(function (rule) {
                    var conditions = describe(rule.conditions).map(function (line) {
                        return '<span class="tsr-cond">' + esc(line) + '</span>';
                    }).join('');
                    return '<tr class="' + (rule.enabled ? '' : 'tsr-off') + '" data-id="' + rule.idrule + '">'
                        + '<td><strong>' + esc(rule.name) + '</strong></td>'
                        + '<td>' + esc(siteName(rule.idsite)) + '</td>'
                        + '<td>' + conditions + '</td>'
                        + '<td>' + modeBadge(rule.mode) + '</td>'
                        + '<td>' + esc(rule.enabled ? T.Enabled : T.Disabled) + '</td>'
                        + '<td class="tsr-actions">'
                        + '<button type="button" class="btn btn-small" data-act="mode">' + esc(rule.mode === 'block' ? T.SwitchToObserve : T.SwitchToBlock) + '</button>'
                        + '<button type="button" class="btn btn-small btn-flat" data-act="edit">' + esc(T.Edit) + '</button>'
                        + '<button type="button" class="btn btn-small btn-flat" data-act="toggle">' + esc(rule.enabled ? T.Disable : T.Enable) + '</button>'
                        + '<button type="button" class="btn btn-small btn-flat" data-act="delete">' + esc(T.Delete) + '</button>'
                        + '</td></tr>';
                }).join('');
                $('#tsr-rules tbody').html(html || '<tr><td colspan="6">' + esc(T.NoRules) + '</td></tr>');
                if (then) {
                    then();
                }
            });
        }

        function findRule(idRule) {
            return rules.filter(function (rule) {
                return rule.idrule === idRule;
            })[0];
        }

        function renderCountryChips() {
            $('#tsr-f-countries').html(selectedCountries.map(function (code) {
                return '<span>' + esc(countryName(code)) + '<button type="button" data-code="' + esc(code) + '" aria-label="x">×</button></span>';
            }).join(''));
        }

        function openForm(rule) {
            var c = rule ? rule.conditions : {};
            $('#tsr-form-title').text(rule ? T.EditRule : T.NewRule);
            $('#tsr-f-id').val(rule ? rule.idrule : '');
            $('#tsr-f-name').val(rule ? rule.name : '');
            $('#tsr-f-site').val(rule ? rule.idsite : 0);
            selectedCountries = (c.country || []).slice();
            renderCountryChips();
            $('#tsr-f-res-in').val(c.resolution && c.resolution['in'] ? c.resolution['in'].join(', ') : '');
            $('#tsr-f-res-min').val(c.resolution && c.resolution.min_width ? c.resolution.min_width : '');
            $('#tsr-f-source').val(c.source ? c.source.type : '').trigger('change');
            $('#tsr-f-domains').val(c.source && c.source.domains ? c.source.domains.join(', ') : '');
            $('#tsr-f-device').val(c.device_type ? c.device_type[0] : '');
            $('#tsr-f-generic').prop('checked', !!c.device_generic);
            $('#tsr-f-browser').val(c.browser ? c.browser.join(', ') : '');
            $('#tsr-f-os').val(c.os ? c.os.join(', ') : '');
            $('#tsr-form-error').text('');
            $('#tsr-rules-msg').text('').removeClass('tsr-error');
            $('#tsr-form').show();
            $('#tsr-new').hide();
            document.getElementById('tsr-form').scrollIntoView({behavior: 'smooth', block: 'nearest'});
        }

        function closeForm() {
            $('#tsr-form').hide();
            $('#tsr-new').show();
        }

        function readForm() {
            var c = {};
            if (selectedCountries.length) {
                c.country = selectedCountries.slice();
            }
            var resolution = {}, exact = list($('#tsr-f-res-in').val()), min = parseInt($('#tsr-f-res-min').val(), 10);
            if (exact.length) {
                resolution['in'] = exact;
            }
            if (min > 0) {
                resolution.min_width = min;
            }
            if (exact.length || min > 0) {
                c.resolution = resolution;
            }
            var source = $('#tsr-f-source').val();
            if (source === 'referrer') {
                var domains = list($('#tsr-f-domains').val());
                if (domains.length) {
                    c.source = {type: 'referrer', domains: domains};
                }
            } else if (source) {
                c.source = {type: source};
            }
            if ($('#tsr-f-device').val()) {
                c.device_type = [$('#tsr-f-device').val()];
            }
            if ($('#tsr-f-generic').is(':checked')) {
                c.device_generic = true;
            }
            if (list($('#tsr-f-browser').val()).length) {
                c.browser = list($('#tsr-f-browser').val());
            }
            if (list($('#tsr-f-os').val()).length) {
                c.os = list($('#tsr-f-os').val());
            }
            return c;
        }

        function refreshAll() {
            loadRules(function () {
                loadVolume();
                loadJournal(true);
            });
            loadHealth();
        }

        // ---------- journal ----------
        function origin(row) {
            if (row.referrer_host) {
                return esc(row.referrer_host);
            }
            return esc(parseInt(row.has_campaign, 10) ? T.Campaign : T.Direct);
        }

        function loadJournal(reset) {
            if (reset) {
                journalOffset = 0;
            }
            api('getJournal', {idSite: $('#tsr-site').val(), limit: PAGE, offset: journalOffset, source: $('#tsr-source').val()}, function (rows) {
                rows = rows || [];
                var html = rows.map(function (row) {
                    var flagged = parseInt(row.flagged_legit, 10) === 1;
                    var badge = row.source === 'official'
                        ? '<span class="tsr-badge tsr-official">' + esc(T.Block) + '</span>' : modeBadge(row.mode);
                    var device = esc(row.device_type) + (row.device_model ? ' · ' + esc(row.device_model) : ' · ' + esc(T.GenericDevice))
                        + '<br>' + esc(row.browser) + (row.os ? ' / ' + esc(row.os) : '');
                    return '<tr data-id="' + row.idjournal + '" data-source="' + esc(row.source) + '" data-rule="' + row.idrule + '">'
                        + '<td>' + esc(row.last_seen) + '<br>' + esc(row.hits) + ' ' + esc(T.Pages) + '</td>'
                        + '<td>' + sourceLabel(row) + '<br>' + badge + '</td>'
                        + '<td>' + esc(row.country ? countryName(row.country) : '') + '</td>'
                        + '<td>' + esc(row.resolution) + '</td>'
                        + '<td>' + origin(row) + '</td>'
                        + '<td>' + device + '</td>'
                        + '<td>' + esc(row.ip_anon) + '</td>'
                        + '<td>' + esc(row.url) + '</td>'
                        + '<td>' + (flagged ? '<span class="tsr-badge tsr-legit">' + esc(T.FlaggedLegit) + '</span><br>' : '')
                        + '<button type="button" class="btn btn-small btn-flat" data-legit="' + (flagged ? 0 : 1) + '">' + esc(flagged ? T.Unflag : T.Legit) + '</button></td>'
                        + '</tr>';
                }).join('');
                if (reset) {
                    $('#tsr-journal tbody').html(html || '<tr><td colspan="9">' + esc(T.NoData) + '</td></tr>');
                } else {
                    $('#tsr-journal tbody').append(html);
                }
                journalOffset += rows.length;
                $('#tsr-more').toggle(rows.length === PAGE);
            });
        }

        // ---------- wiring ----------
        var siteOptions = '<option value="0">' + esc(T.AllSites) + '</option>';
        Object.keys(sites).forEach(function (idSite) {
            siteOptions += '<option value="' + esc(idSite) + '">' + esc(sites[idSite]) + '</option>';
        });
        $('.tsr-site-select').html(siteOptions);

        var countryOptions = '';
        Object.keys(countries).sort(function (a, b) {
            return countries[a].localeCompare(countries[b]);
        }).forEach(function (code) {
            countryOptions += '<option value="' + esc(code) + '">' + esc(countries[code]) + '</option>';
        });
        $('#tsr-f-country').append(countryOptions).on('change', function () {
            var code = $(this).val();
            if (code && selectedCountries.indexOf(code) === -1) {
                selectedCountries.push(code);
                renderCountryChips();
            }
            $(this).val('');
        });
        $('#tsr-f-countries').on('click', 'button', function () {
            var code = $(this).data('code');
            selectedCountries = selectedCountries.filter(function (item) {
                return item !== code;
            });
            renderCountryChips();
        });
        $('#tsr-f-source').on('change', function () {
            $('#tsr-f-domains').toggle($(this).val() === 'referrer');
        });

        $('#tsr-days, #tsr-site').on('change', function () {
            loadVolume();
            loadJournal(true);
        });
        $('#tsr-source').on('change', function () {
            loadJournal(true);
        });
        $('#tsr-more').on('click', function () {
            loadJournal(false);
        });
        $('#tsr-new').on('click', function () {
            openForm(null);
        });
        $('#tsr-cancel').on('click', closeForm);

        $('#tsr-form').on('submit', function (event) {
            event.preventDefault();
            var name = $('#tsr-f-name').val().trim(), conditions = readForm(), idRule = $('#tsr-f-id').val();
            if (!name) {
                return showError(T.NeedName);
            }
            if (!Object.keys(conditions).length) {
                return showError(T.NeedCondition);
            }
            var params = {name: name, conditions: JSON.stringify(conditions), idSite: $('#tsr-f-site').val()};
            if (idRule) {
                params.idRule = idRule;
            }
            api(idRule ? 'updateRule' : 'addRule', params, function () {
                closeForm();
                $('#tsr-rules-msg').text(T.Saved).removeClass('tsr-error');
                refreshAll();
            });
        });

        $('#tsr-rules').on('click', 'button[data-act]', function () {
            var idRule = parseInt($(this).closest('tr').data('id'), 10), rule = findRule(idRule), action = $(this).data('act');
            if (!rule) {
                return;
            }
            if (action === 'edit') {
                openForm(rule);
            } else if (action === 'delete') {
                if (window.confirm(T.ConfirmDelete)) {
                    api('deleteRule', {idRule: idRule}, refreshAll);
                }
            } else if (action === 'toggle') {
                api('setRuleEnabled', {idRule: idRule, enabled: rule.enabled ? 0 : 1}, refreshAll);
            } else if (action === 'mode') {
                if (rule.mode === 'block' || window.confirm(T.ConfirmBlock)) {
                    api('setRuleMode', {idRule: idRule, mode: rule.mode === 'block' ? 'observe' : 'block'}, refreshAll);
                }
            }
        });

        $('#tsr-journal').on('click', 'button[data-legit]', function () {
            var row = $(this).closest('tr'), legit = parseInt($(this).data('legit'), 10) === 1;
            api('flagLegit', {idJournal: row.data('id'), legit: legit ? 1 : 0}, function () {
                var isRule = row.data('source') === 'rule';
                $('#tsr-journal-msg').text(legit ? (isRule ? T.LegitHintRule : T.LegitHintOfficial) : '');
                loadJournal(true);
                if (legit && isRule) {
                    var rule = findRule(parseInt(row.data('rule'), 10));
                    if (rule) {
                        openForm(rule);
                    }
                }
            });
        });

        refreshAll();
    });
})(jQuery);
