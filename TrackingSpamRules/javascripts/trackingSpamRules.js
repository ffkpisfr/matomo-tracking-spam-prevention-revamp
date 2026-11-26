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
        var lang = document.documentElement.lang || undefined;
        var COND_TYPES = ['country', 'resolution', 'source', 'device', 'browser', 'os'];
        var COND_LABEL = {country: T.CondCountry, resolution: T.CondResolution, source: T.CondSource, device: T.CondDevice, browser: T.CondBrowser, os: T.CondOs};
        var DEVICES = ['desktop', 'smartphone', 'tablet', 'phablet', 'tv', 'console'];
        var PAGE = 50;

        var state = {tab: 'overview', days: 30, site: 0, rules: [], counts: [], week: {}, source: '', ruleFilter: 0, offset: 0, editor: null, lastFocus: null, journalRequest: 0, countsRequest: 0};

        // ---------------------------------------------------------------- helpers
        function esc(value) {
            return $('<div>').text(value === null || value === undefined ? '' : String(value)).html();
        }

        function fmt(text, value) {
            return String(text).replace('%s', value);
        }

        function num(value) {
            return Number(value || 0).toLocaleString(lang);
        }

        function list(value) {
            return String(value || '').split(',').map(function (item) {
                return item.trim();
            }).filter(Boolean);
        }

        function api(method, params, callback) {
            var ajax = new ajaxHelper();
            ajax.addParams({module: 'API', method: 'TrackingSpamRules.' + method, format: 'json'}, 'get');
            ajax.addParams(params || {}, 'post');
            ajax.setFormat('json');
            ajax.setCallback(function (response) {
                if (response && response.result === 'error') {
                    toast(response.message, true);
                    return;
                }
                callback(response);
            });
            ajax.send();
        }

        function siteName(idSite) {
            return parseInt(idSite, 10) === 0 ? T.AllSites : (sites[idSite] || ('#' + idSite));
        }

        function countryName(code) {
            return countries[code] || String(code).toUpperCase();
        }

        function deviceName(type) {
            return T['Dev_' + type] || type;
        }

        function findRule(idRule) {
            idRule = parseInt(idRule, 10);
            return state.rules.filter(function (rule) {
                return rule.idrule === idRule;
            })[0];
        }

        function category(row) {
            return row.source === 'official' ? 'official' : (row.mode === 'block' ? 'block' : 'observe');
        }

        function badge(kind) {
            var label = {observe: T.Observe, block: T.Block, official: T.Official, legit: T.FlaggedLegit, off: T.Disabled}[kind];
            return '<span class="tsr-badge tsr-b-' + kind + '">' + esc(label) + '</span>';
        }

        function reasonName(reason) {
            var key = 'Reason_' + String(reason || '').toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_+|_+$/g, '');
            return T[key] || reason;
        }

        function filterName(row) {
            if (row.source === 'official') {
                return reasonName(row.reason);
            }
            var rule = findRule(row.idrule);
            return rule ? rule.name : T.DeletedRule;
        }

        var toastTimer = null;
        function toast(message, isError) {
            var el = $('#tsr-toast');
            el.text(message || '').toggleClass('is-error', !!isError).prop('hidden', false);
            window.clearTimeout(toastTimer);
            toastTimer = window.setTimeout(function () {
                el.prop('hidden', true);
            }, isError ? 6000 : 3200);
        }

        function confirmBox(title, text, label, danger, onConfirm) {
            var previous = document.activeElement;
            $('#tsr-modal').html('<h2>' + esc(title) + '</h2><p>' + esc(text) + '</p><div class="tsr-modal-foot">'
                + '<button type="button" class="tsr-btn" data-no>' + esc(T.Cancel) + '</button>'
                + '<button type="button" class="tsr-btn ' + (danger ? 'tsr-btn-danger' : 'tsr-btn-primary') + '" data-yes>' + esc(label) + '</button></div>').prop('hidden', false);
            $('#tsr-overlay').prop('hidden', false);
            function close() {
                $('#tsr-modal').prop('hidden', true).empty();
                $('#tsr-overlay').prop('hidden', !!$('#tsr-drawer').prop('hidden'));
                if (previous && previous.focus) {
                    previous.focus();
                }
            }
            $('#tsr-modal [data-no]').on('click', close).trigger('focus');
            $('#tsr-modal [data-yes]').on('click', function () {
                close();
                onConfirm();
            });
        }

        // ---------------------------------------------------------------- summary of a rule
        function conditionPills(c) {
            var pills = [];
            c = c || {};
            if (c.country) {
                pills.push([T.CondCountry, c.country.map(countryName).join(', ')]);
            }
            if (c.resolution && c.resolution['in']) {
                pills.push([T.CondResolution, c.resolution['in'].join(', ').replace(/x/g, '×')]);
            }
            if (c.resolution && c.resolution.min_width) {
                pills.push([T.CondResolution, fmt(T.SumResolutionMin, c.resolution.min_width)]);
            }
            if (c.source) {
                pills.push([T.CondSource, c.source.type === 'direct' ? T.SourceDirect
                    : (c.source.type === 'campaign' ? T.Campaign : (c.source.domains || []).join(', '))]);
            }
            if (c.device_type || c.device_generic) {
                var device = c.device_type ? c.device_type.map(deviceName).join(', ') : '';
                pills.push([T.CondDevice, c.device_generic ? (device ? fmt(T.SumGenericType, device) : T.SumGeneric) : device]);
            }
            if (c.browser) {
                pills.push([T.CondBrowser, c.browser.join(', ')]);
            }
            if (c.os) {
                pills.push([T.CondOs, c.os.join(', ')]);
            }
            return pills;
        }

        function sentence(c) {
            var parts = [];
            c = c || {};
            if (c.country) {
                parts.push(fmt(T.SumCountry, c.country.map(countryName).join(', ')));
            }
            if (c.resolution && c.resolution['in']) {
                parts.push(fmt(T.SumResolution, c.resolution['in'].join(', ').replace(/x/g, '×')));
            }
            if (c.resolution && c.resolution.min_width) {
                parts.push(fmt(T.SumResolutionMin, c.resolution.min_width));
            }
            if (c.source) {
                parts.push(c.source.type === 'direct' ? T.SumDirect
                    : (c.source.type === 'campaign' ? T.SumCampaign : fmt(T.SumReferrer, (c.source.domains || []).join(', '))));
            }
            if (c.device_type || c.device_generic) {
                var device = c.device_type ? c.device_type.map(deviceName).join(', ').toLowerCase() : '';
                parts.push(c.device_generic ? (device ? fmt(T.SumGenericType, device) : T.SumGeneric) : device);
            }
            if (c.browser) {
                parts.push(fmt(T.SumBrowser, c.browser.join(', ')));
            }
            if (c.os) {
                parts.push(fmt(T.SumOs, c.os.join(', ')));
            }
            return parts.join(' · ');
        }

        // ---------------------------------------------------------------- health
        function loadHealth() {
            api('getHealth', {}, function (h) {
                var kind = h.errors_7_days > 0 ? 'ko' : (h.evaluated_today > 0 ? 'ok' : 'idle');
                var short = {ok: T.HealthOkShort, idle: T.HealthIdleShort, ko: T.HealthErrorsShort}[kind];
                var long = {ok: T.HealthOk, idle: T.HealthIdle, ko: T.HealthErrors}[kind];
                var html = '<button type="button" class="tsr-pill is-' + kind + '" aria-expanded="false"><i></i>' + esc(short) + '</button>'
                    + '<div class="tsr-pop" hidden><p>' + esc(long) + '</p><dl>'
                    + '<dt>' + esc(T.EvaluatedToday) + '</dt><dd>' + num(h.evaluated_today) + '</dd>'
                    + '<dt>' + esc(T.EvaluatedYesterday) + '</dt><dd>' + num(h.evaluated_yesterday) + '</dd>'
                    + '<dt>' + esc(T.Errors7Days) + '</dt><dd>' + num(h.errors_7_days) + '</dd></dl>';
                (h.last_errors || []).slice(0, 3).forEach(function (error) {
                    html += '<p class="tsr-err">' + esc(error.ts) + ' — ' + esc(error.message) + '</p>';
                });
                $('#tsr-health').html(html + '</div>');
            });
        }

        $('#tsr-health').on('click', '.tsr-pill', function (event) {
            event.stopPropagation();
            var pop = $('#tsr-health .tsr-pop'), open = pop.prop('hidden');
            pop.prop('hidden', !open);
            $(this).attr('aria-expanded', open ? 'true' : 'false');
        });
        $(document).on('click', function (event) {
            if (!$(event.target).closest('#tsr-health').length) {
                $('#tsr-health .tsr-pop').prop('hidden', true);
            }
            if (!$(event.target).closest('.tsr-add').length) {
                $('#tsr-drawer .tsr-menu').prop('hidden', true);
            }
        });

        // ---------------------------------------------------------------- overview
        function loadCounts(then) {
            var request = ++state.countsRequest;
            api('getDailyCounts', {idSite: state.site, days: state.days}, function (rows) {
                if (request !== state.countsRequest) {
                    return;
                }
                state.counts = rows || [];
                renderOverview();
                if (then) {
                    then();
                }
            });
        }

        function renderOverview() {
            var totals = {block: {s: 0, h: 0}, observe: {s: 0, h: 0}, official: {s: 0, h: 0}};
            var groups = {}, order = [];
            state.counts.forEach(function (row) {
                var cat = category(row), sessions = parseInt(row.sessions, 10), hits = parseInt(row.hits, 10);
                totals[cat].s += sessions;
                totals[cat].h += hits;
                var key = [row.source, row.idrule, row.reason, row.mode].join('|');
                if (!groups[key]) {
                    groups[key] = {row: row, cat: cat, s: 0, h: 0};
                    order.push(key);
                }
                groups[key].s += sessions;
                groups[key].h += hits;
            });

            var tiles = [['block', T.TileBlocked, T.TileBlockedHelp], ['observe', T.TileObserved, T.TileObservedHelp], ['official', T.TileOfficial, T.TileOfficialHelp]];
            $('#tsr-tiles').html(tiles.map(function (tile) {
                return '<div class="tsr-tile is-' + tile[0] + '"><div class="tsr-tile-label">' + esc(tile[1]) + '</div>'
                    + '<div class="tsr-tile-value">' + num(totals[tile[0]].s) + '<small>' + esc(T.Sessions) + '</small></div>'
                    + '<div class="tsr-tile-help">' + esc(tile[2]) + ' · ' + num(totals[tile[0]].h) + ' ' + esc(T.Requests) + '</div></div>';
            }).join(''));

            order.sort(function (a, b) {
                return groups[b].s - groups[a].s || groups[b].h - groups[a].h;
            });
            var max = order.length ? Math.max(1, groups[order[0]].s) : 1;
            $('#tsr-breakdown').html(order.map(function (key) {
                var g = groups[key];
                return '<div class="tsr-rank"><div class="tsr-rank-name">' + esc(filterName(g.row)) + ' ' + badge(g.cat) + '</div>'
                    + '<div class="tsr-rank-bar"><i class="tsr-c-' + g.cat + '" style="width:' + Math.max(2, Math.round(100 * g.s / max)) + '%"></i></div>'
                    + '<div class="tsr-rank-num"><b>' + num(g.s) + '</b> ' + esc(T.Sessions) + '<span>' + num(g.h) + ' ' + esc(T.Requests) + '</span></div></div>';
            }).join('') || '<div class="tsr-empty">' + esc(T.NoData) + '</div>');

            renderChart();
        }

        function dayList() {
            var days = [], now = new Date();
            var base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
            for (var i = state.days - 1; i >= 0; i--) {
                days.push(new Date(base - i * 86400000).toISOString().slice(0, 10));
            }
            return days;
        }

        function shortDate(day) {
            return new Date(day + 'T00:00:00Z').toLocaleDateString(lang, {day: 'numeric', month: 'short', timeZone: 'UTC'});
        }

        function renderChart() {
            var box = document.getElementById('tsr-chart');
            var width = box.clientWidth;
            if (!width) {
                return; // hidden tab: drawn when it becomes visible
            }
            var days = dayList(), perDay = {};
            days.forEach(function (day) {
                perDay[day] = {block: 0, observe: 0, official: 0};
            });
            state.counts.forEach(function (row) {
                if (perDay[row.day]) {
                    perDay[row.day][category(row)] += parseInt(row.sessions, 10);
                }
            });
            var max = 0;
            days.forEach(function (day) {
                max = Math.max(max, perDay[day].block + perDay[day].observe + perDay[day].official);
            });
            var step = Math.max(1, Math.ceil(max / 4)), top = step * 4;
            var height = 220, left = 40, right = 8, padTop = 10, bottom = 26;
            var plotW = width - left - right, plotH = height - padTop - bottom, slot = plotW / days.length, bar = Math.max(2, Math.min(34, slot * 0.66));
            var svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + esc(T.ChartTitle) + '">';
            for (var g = 0; g <= 4; g++) {
                var y = padTop + plotH - (plotH * g / 4);
                svg += '<line class="tsr-grid" x1="' + left + '" x2="' + (width - right) + '" y1="' + y + '" y2="' + y + '"/>'
                    + '<text class="tsr-axis" x="' + (left - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + num(step * g) + '</text>';
            }
            var every = Math.max(1, Math.ceil(days.length / 7));
            days.forEach(function (day, index) {
                var x = left + slot * index, y = padTop + plotH, d = perDay[day];
                ['block', 'observe', 'official'].forEach(function (cat) {
                    if (d[cat] > 0) {
                        var h = plotH * d[cat] / top;
                        y -= h;
                        svg += '<rect class="tsr-bar-' + cat + '" x="' + (x + (slot - bar) / 2).toFixed(1) + '" y="' + y.toFixed(1)
                            + '" width="' + bar.toFixed(1) + '" height="' + Math.max(1, h - 1).toFixed(1) + '" rx="2"/>';
                    }
                });
                if (index % every === 0 || index === days.length - 1) {
                    if (!(index === days.length - 1 && (days.length - 1) % every !== 0 && (days.length - 1) % every < every / 2)) {
                        svg += '<text class="tsr-axis" x="' + (x + slot / 2).toFixed(1) + '" y="' + (height - 7) + '" text-anchor="middle">' + esc(shortDate(day)) + '</text>';
                    }
                }
                svg += '<rect class="tsr-hit" x="' + x.toFixed(1) + '" y="' + padTop + '" width="' + slot.toFixed(1) + '" height="' + plotH + '" data-day="' + day
                    + '" data-b="' + d.block + '" data-o="' + d.observe + '" data-f="' + d.official + '"/>';
            });
            box.innerHTML = svg + '</svg><div class="tsr-tip" hidden></div>';
        }

        $('#tsr-chart').on('mousemove', '.tsr-hit', function (event) {
            var el = $(this), box = document.getElementById('tsr-chart').getBoundingClientRect();
            $('#tsr-chart .tsr-tip').html('<b>' + esc(shortDate(el.data('day'))) + '</b><br>'
                + '<i class="tsr-dot tsr-c-block"></i>' + esc(T.LegendBlocked) + ' : ' + num(el.data('b')) + '<br>'
                + '<i class="tsr-dot tsr-c-observe"></i>' + esc(T.LegendObserved) + ' : ' + num(el.data('o')) + '<br>'
                + '<i class="tsr-dot tsr-c-official"></i>' + esc(T.LegendOfficial) + ' : ' + num(el.data('f')))
                .css({left: Math.min(Math.max(event.clientX - box.left, 90), box.width - 90), top: Math.max(event.clientY - box.top - 12, 70)}).prop('hidden', false);
        }).on('mouseleave', '.tsr-hit', function () {
            $('#tsr-chart .tsr-tip').prop('hidden', true);
        });

        var resizeTimer = null;
        $(window).on('resize', function () {
            window.clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(renderChart, 150);
        });

        // ---------------------------------------------------------------- rules
        function loadRules(then) {
            api('getRules', {}, function (rules) {
                state.rules = rules || [];
                api('getDailyCounts', {idSite: 0, days: 7}, function (rows) {
                    state.week = {};
                    (rows || []).forEach(function (row) {
                        if (row.source === 'rule') {
                            state.week[row.idrule] = (state.week[row.idrule] || 0) + parseInt(row.sessions, 10);
                        }
                    });
                    renderRules();
                    if (then) {
                        then();
                    }
                });
            });
        }

        function renderRules() {
            $('#tsr-rules-count').text(state.rules.length || '');
            var options = '<option value="0">' + esc(T.AllRules) + '</option>';
            state.rules.forEach(function (rule) {
                options += '<option value="' + rule.idrule + '">' + esc(rule.name) + '</option>';
            });
            $('#tsr-rule-filter').html(options).val(findRule(state.ruleFilter) ? state.ruleFilter : 0);

            if (!state.rules.length) {
                $('#tsr-rules').html('<div class="tsr-card tsr-empty"><h2>' + esc(T.EmptyTitle) + '</h2><p>' + esc(T.EmptyText) + '</p><div class="tsr-steps">'
                    + [[T.Step1, T.Step1Text], [T.Step2, T.Step2Text], [T.Step3, T.Step3Text]].map(function (step, index) {
                        return '<div class="tsr-step"><i>' + (index + 1) + '</i><b>' + esc(step[0]) + '</b>' + esc(step[1]) + '</div>';
                    }).join('') + '</div><button type="button" class="tsr-btn tsr-btn-primary" data-act="new">+ ' + esc(T.NewRule) + '</button></div>');
                return;
            }

            $('#tsr-rules').html(state.rules.map(function (rule) {
                var pills = conditionPills(rule.conditions).map(function (pill) {
                    return '<span class="tsr-cond"><em>' + esc(pill[0]) + '</em>' + esc(pill[1]) + '</span>';
                }).join('<span class="tsr-and">' + esc(T.And) + '</span>');
                return '<article class="tsr-rule' + (rule.enabled ? '' : ' is-off') + '" data-id="' + rule.idrule + '">'
                    + '<div><div class="tsr-rule-name">' + esc(rule.name) + (rule.enabled ? '' : ' ' + badge('off')) + '</div>'
                    + '<div class="tsr-rule-meta">' + esc(siteName(rule.idsite)) + '</div>'
                    + '<div class="tsr-conds"><span class="tsr-conds-label">' + esc(T.Catches) + '</span>' + pills + '</div></div>'
                    + '<div class="tsr-rule-side"><div class="tsr-switch' + (rule.enabled ? '' : ' is-disabled') + '" role="group">'
                    + '<button type="button" data-mode="observe" class="' + (rule.mode === 'observe' ? 'is-on' : '') + '" aria-pressed="' + (rule.mode === 'observe') + '">' + esc(T.ToggleObserve) + '</button>'
                    + '<button type="button" data-mode="block" class="' + (rule.mode === 'block' ? 'is-on' : '') + '" aria-pressed="' + (rule.mode === 'block') + '">' + esc(T.ToggleBlock) + '</button></div>'
                    + '<div class="tsr-rule-vol"><b>' + num(state.week[rule.idrule] || 0) + '</b>' + esc(T.Sessions) + ' ' + esc(T.Last7Days) + '</div></div>'
                    + '<div class="tsr-rule-foot"><span class="tsr-rule-help">' + esc(rule.mode === 'block' ? T.ModeBlockHelp : T.ModeObserveHelp) + '</span><span>'
                    + '<button type="button" class="tsr-btn tsr-btn-sm tsr-btn-quiet" data-act="sessions">' + esc(T.TabSessions) + '</button>'
                    + '<button type="button" class="tsr-btn tsr-btn-sm" data-act="edit">' + esc(T.Edit) + '</button>'
                    + '<button type="button" class="tsr-btn tsr-btn-sm tsr-btn-quiet" data-act="toggle">' + esc(rule.enabled ? T.Disable : T.Enable) + '</button>'
                    + '<button type="button" class="tsr-btn tsr-btn-sm tsr-btn-quiet" data-act="delete">' + esc(T.Delete) + '</button></span></div></article>';
            }).join(''));
        }

        function setMode(rule, mode) {
            api('setRuleMode', {idRule: rule.idrule, mode: mode}, function () {
                toast(mode === 'block' ? T.NowBlocking : T.NowObserving);
                refresh();
            });
        }

        $('#tsr-rules').on('click', '.tsr-switch button', function () {
            var rule = findRule($(this).closest('.tsr-rule').data('id')), mode = $(this).data('mode');
            if (!rule || rule.mode === mode) {
                return;
            }
            if (mode === 'block') {
                confirmBox(T.ConfirmBlockTitle, T.ConfirmBlockText, T.ToggleBlock, true, function () {
                    setMode(rule, 'block');
                });
            } else {
                setMode(rule, 'observe');
            }
        }).on('click', '[data-act]', function () {
            var action = $(this).data('act'), rule = findRule($(this).closest('.tsr-rule').data('id'));
            if (action === 'new') {
                openEditor(null);
            } else if (!rule) {
                return;
            } else if (action === 'edit') {
                openEditor(rule);
            } else if (action === 'sessions') {
                state.source = 'rule';
                state.ruleFilter = rule.idrule;
                syncSessionFilters();
                showTab('sessions');
                loadJournal(true);
            } else if (action === 'toggle') {
                api('setRuleEnabled', {idRule: rule.idrule, enabled: rule.enabled ? 0 : 1}, refresh);
            } else if (action === 'delete') {
                confirmBox(T.ConfirmDeleteTitle, T.ConfirmDeleteText, T.Delete, true, function () {
                    api('deleteRule', {idRule: rule.idrule}, function () {
                        toast(T.Deleted);
                        refresh();
                    });
                });
            }
        });
        $('#tsr-new').on('click', function () {
            openEditor(null);
        });

        // ---------------------------------------------------------------- rule editor (drawer)
        function editorFromRule(rule) {
            var c = rule ? rule.conditions : {}, ed = {id: rule ? rule.idrule : null, name: rule ? rule.name : '', idsite: rule ? rule.idsite : 0, order: [], v: {}};
            ed.v.country = (c.country || []).slice();
            ed.v.resolution = {
                mode: c.resolution && !c.resolution['in'] && c.resolution.min_width ? 'min' : 'exact',
                exact: c.resolution && c.resolution['in'] ? c.resolution['in'].join(', ') : '',
                min: c.resolution && c.resolution.min_width ? String(c.resolution.min_width) : ''
            };
            ed.v.source = {type: c.source ? c.source.type : 'direct', domains: c.source && c.source.domains ? c.source.domains.join(', ') : ''};
            ed.v.device = {type: c.device_type ? c.device_type[0] : '', generic: !!c.device_generic};
            ed.v.browser = c.browser ? c.browser.join(', ') : '';
            ed.v.os = c.os ? c.os.join(', ') : '';
            if (c.country) { ed.order.push('country'); }
            if (c.resolution) { ed.order.push('resolution'); }
            if (c.source) { ed.order.push('source'); }
            if (c.device_type || c.device_generic) { ed.order.push('device'); }
            if (c.browser) { ed.order.push('browser'); }
            if (c.os) { ed.order.push('os'); }
            return ed;
        }

        function editorConditions() {
            var ed = state.editor, v = ed.v, c = {};
            ed.order.forEach(function (type) {
                if (type === 'country' && v.country.length) {
                    c.country = v.country.slice();
                } else if (type === 'resolution') {
                    var exact = list(v.resolution.exact).map(function (item) {
                        return item.toLowerCase().replace(/[×\s*]/g, function (ch) {
                            return ch === '×' || ch === '*' ? 'x' : '';
                        });
                    }), min = parseInt(v.resolution.min, 10);
                    if (v.resolution.mode === 'exact' && exact.length) {
                        c.resolution = {'in': exact};
                    } else if (v.resolution.mode === 'min' && min > 0) {
                        c.resolution = {min_width: min};
                    }
                } else if (type === 'source') {
                    if (v.source.type === 'referrer') {
                        if (list(v.source.domains).length) {
                            c.source = {type: 'referrer', domains: list(v.source.domains)};
                        }
                    } else {
                        c.source = {type: v.source.type};
                    }
                } else if (type === 'device') {
                    if (v.device.type) {
                        c.device_type = [v.device.type];
                    }
                    if (v.device.generic) {
                        c.device_generic = true;
                    }
                } else if ((type === 'browser' || type === 'os') && list(v[type]).length) {
                    c[type] = list(v[type]);
                }
            });
            return c;
        }

        function conditionBlock(type) {
            var v = state.editor.v, body = '';
            if (type === 'country') {
                var options = '<option value="">' + esc(T.CountryAdd) + '</option>';
                Object.keys(countries).sort(function (a, b) {
                    return countries[a].localeCompare(countries[b], lang);
                }).forEach(function (code) {
                    if (v.country.indexOf(code) === -1) {
                        options += '<option value="' + esc(code) + '">' + esc(countries[code]) + '</option>';
                    }
                });
                body = '<select class="browser-default tsr-select" data-f="country-add">' + options + '</select><div class="tsr-tags">'
                    + v.country.map(function (code) {
                        return '<span>' + esc(countryName(code)) + '<button type="button" data-f="country-del" data-code="' + esc(code) + '" aria-label="' + esc(T.RemoveCondition) + '">×</button></span>';
                    }).join('') + '</div>';
            } else if (type === 'resolution') {
                var exact = v.resolution.mode === 'exact';
                body = '<div class="tsr-seg"><button type="button" data-f="res-mode" data-mode="exact" class="' + (exact ? 'is-on' : '') + '">' + esc(T.ResExact) + '</button>'
                    + '<button type="button" data-f="res-mode" data-mode="min" class="' + (exact ? '' : 'is-on') + '">' + esc(T.ResMin) + '</button></div>'
                    + (exact
                        ? '<input type="text" class="tsr-input" data-f="res-exact" value="' + esc(v.resolution.exact) + '" placeholder="' + esc(T.ResExactPlaceholder) + '"><div class="tsr-hint">' + esc(T.ResExactHelp) + '</div>'
                        : '<input type="number" min="1" class="tsr-input" data-f="res-min" value="' + esc(v.resolution.min) + '" placeholder="' + esc(T.ResMinPlaceholder) + '"><div class="tsr-hint">' + esc(T.ResMinHelp) + '</div>');
            } else if (type === 'source') {
                body = '<select class="browser-default tsr-select" data-f="source-type">'
                    + [['direct', T.SourceDirect], ['referrer', T.SourceReferrer], ['campaign', T.SourceCampaign]].map(function (option) {
                        return '<option value="' + option[0] + '"' + (v.source.type === option[0] ? ' selected' : '') + '>' + esc(option[1]) + '</option>';
                    }).join('') + '</select>'
                    + (v.source.type === 'referrer' ? '<input type="text" class="tsr-input" style="margin-top:8px" data-f="source-domains" value="' + esc(v.source.domains) + '" placeholder="' + esc(T.DomainsPlaceholder) + '">' : '');
            } else if (type === 'device') {
                body = '<select class="browser-default tsr-select" data-f="device-type"><option value="">' + esc(T.DeviceAny) + '</option>'
                    + DEVICES.map(function (device) {
                        return '<option value="' + device + '"' + (v.device.type === device ? ' selected' : '') + '>' + esc(deviceName(device)) + '</option>';
                    }).join('') + '</select><label class="tsr-checkline"><input type="checkbox" data-f="device-generic"' + (v.device.generic ? ' checked' : '') + '><span>' + esc(T.DeviceGeneric) + '</span></label>';
            } else {
                body = '<input type="text" class="tsr-input" data-f="' + type + '" value="' + esc(v[type]) + '" placeholder="' + esc(type === 'browser' ? T.ListPlaceholderBrowser : T.ListPlaceholderOs) + '">';
            }
            return '<div class="tsr-cblock" data-type="' + type + '"><div class="tsr-cblock-head"><b>' + esc(COND_LABEL[type]) + '</b>'
                + '<button type="button" class="tsr-x" data-f="remove" aria-label="' + esc(T.RemoveCondition) + '" title="' + esc(T.RemoveCondition) + '">×</button></div>' + body + '</div>';
        }

        function renderEditorConditions() {
            var ed = state.editor, remaining = COND_TYPES.filter(function (type) {
                return ed.order.indexOf(type) === -1;
            });
            $('#tsr-ed-conds').html(ed.order.map(conditionBlock).join('')
                + (remaining.length ? '<div class="tsr-add"><button type="button" class="tsr-btn" data-f="add" aria-haspopup="true">+ ' + esc(T.AddCondition) + '</button>'
                    + '<div class="tsr-menu" hidden>' + remaining.map(function (type) {
                        return '<button type="button" data-f="add-type" data-type="' + type + '">' + esc(COND_LABEL[type]) + '</button>';
                    }).join('') + '</div></div>' : ''));
            renderPreview();
        }

        function renderPreview() {
            var text = sentence(editorConditions());
            $('#tsr-ed-preview').html('<b>' + esc(T.Preview) + '</b>' + esc(text || T.PreviewEmpty));
            $('#tsr-ed-error').text('');
        }

        function openEditor(rule) {
            state.lastFocus = document.activeElement;
            state.editor = editorFromRule(rule);
            var ed = state.editor, siteOptions = '<option value="0">' + esc(T.AllSites) + '</option>';
            Object.keys(sites).forEach(function (idSite) {
                siteOptions += '<option value="' + esc(idSite) + '"' + (parseInt(idSite, 10) === ed.idsite ? ' selected' : '') + '>' + esc(sites[idSite]) + '</option>';
            });
            $('#tsr-drawer').html('<div class="tsr-drawer-head"><h2 id="tsr-drawer-title">' + esc(rule ? T.EditRule : T.NewRule) + '</h2>'
                + '<button type="button" class="tsr-btn tsr-btn-quiet" data-f="close" aria-label="' + esc(T.Close) + '">✕</button></div>'
                + '<div class="tsr-drawer-body">'
                + '<div class="tsr-field"><label for="tsr-ed-name">' + esc(T.FormName) + '</label><input type="text" id="tsr-ed-name" class="tsr-input" maxlength="100" value="' + esc(ed.name) + '" placeholder="' + esc(T.FormNamePlaceholder) + '"></div>'
                + '<div class="tsr-field"><label for="tsr-ed-site">' + esc(T.FormSite) + '</label><select id="tsr-ed-site" class="browser-default tsr-select">' + siteOptions + '</select></div>'
                + '<div class="tsr-field"><span class="tsr-label">' + esc(T.FormConditions) + '</span><div class="tsr-hint" style="margin:-2px 0 10px">' + esc(T.FormConditionsHelp) + '</div><div id="tsr-ed-conds"></div></div>'
                + (rule ? '' : '<p class="tsr-muted" style="font-size:13px">' + esc(T.StartsObserving) + '</p>')
                + '</div><div class="tsr-preview" id="tsr-ed-preview" aria-live="polite"></div><div class="tsr-drawer-foot"><span class="tsr-formerr" id="tsr-ed-error" role="alert"></span>'
                + '<button type="button" class="tsr-btn" data-f="close">' + esc(T.Cancel) + '</button>'
                + '<button type="button" class="tsr-btn tsr-btn-primary" data-f="save">' + esc(T.Save) + '</button></div>').prop('hidden', false);
            $('#tsr-overlay').prop('hidden', false);
            if (!rule && !ed.order.length) {
                ed.order.push('country');
            }
            renderEditorConditions();
            $('#tsr-ed-name').trigger('focus');
        }

        function closeEditor() {
            $('#tsr-drawer').prop('hidden', true).empty();
            $('#tsr-overlay').prop('hidden', true);
            state.editor = null;
            if (state.lastFocus && state.lastFocus.focus) {
                state.lastFocus.focus();
            }
        }

        function saveEditor() {
            var ed = state.editor, name = $('#tsr-ed-name').val().trim(), conditions = editorConditions();
            if (!name) {
                $('#tsr-ed-error').text(T.NeedName);
                $('#tsr-ed-name').addClass('is-invalid').trigger('focus');
                return;
            }
            if (!Object.keys(conditions).length) {
                $('#tsr-ed-error').text(T.NeedCondition);
                return;
            }
            var params = {name: name, conditions: JSON.stringify(conditions), idSite: $('#tsr-ed-site').val()};
            if (ed.id) {
                params.idRule = ed.id;
            }
            api(ed.id ? 'updateRule' : 'addRule', params, function () {
                closeEditor();
                toast(T.Saved);
                refresh();
            });
        }

        $('#tsr-drawer').on('click', '[data-f]', function (event) {
            var f = $(this).data('f'), ed = state.editor, type = $(this).closest('.tsr-cblock').data('type');
            if (f === 'close') {
                closeEditor();
            } else if (f === 'save') {
                saveEditor();
            } else if (f === 'add') {
                event.stopPropagation();
                var menu = $(this).siblings('.tsr-menu');
                menu.prop('hidden', !menu.prop('hidden'));
            } else if (f === 'add-type') {
                ed.order.push($(this).data('type'));
                renderEditorConditions();
                $('#tsr-ed-conds .tsr-cblock').last().find('select, input').first().trigger('focus');
            } else if (f === 'remove') {
                ed.order = ed.order.filter(function (item) {
                    return item !== type;
                });
                renderEditorConditions();
            } else if (f === 'country-del') {
                var code = $(this).data('code');
                ed.v.country = ed.v.country.filter(function (item) {
                    return item !== code;
                });
                renderEditorConditions();
            } else if (f === 'res-mode') {
                ed.v.resolution.mode = $(this).data('mode');
                renderEditorConditions();
            }
        }).on('change', '[data-f]', function () {
            var f = $(this).data('f'), ed = state.editor;
            if (f === 'country-add' && $(this).val()) {
                ed.v.country.push($(this).val());
                renderEditorConditions();
                $('#tsr-ed-conds [data-f="country-add"]').trigger('focus');
            } else if (f === 'source-type') {
                ed.v.source.type = $(this).val();
                renderEditorConditions();
            } else if (f === 'device-type') {
                ed.v.device.type = $(this).val();
                renderPreview();
            } else if (f === 'device-generic') {
                ed.v.device.generic = $(this).is(':checked');
                renderPreview();
            }
        }).on('input', 'input[data-f]', function () {
            var f = $(this).data('f'), v = state.editor.v, value = $(this).val();
            if (f === 'res-exact') { v.resolution.exact = value; }
            if (f === 'res-min') { v.resolution.min = value; }
            if (f === 'source-domains') { v.source.domains = value; }
            if (f === 'browser') { v.browser = value; }
            if (f === 'os') { v.os = value; }
            renderPreview();
        }).on('input', '#tsr-ed-name', function () {
            $(this).removeClass('is-invalid');
            $('#tsr-ed-error').text('');
        });

        $('#tsr-overlay').on('click', function () {
            if ($('#tsr-modal').prop('hidden') && state.editor) {
                closeEditor();
            }
        });
        $(document).on('keydown', function (event) {
            if (event.key !== 'Escape') {
                return;
            }
            if (!$('#tsr-modal').prop('hidden')) {
                $('#tsr-modal [data-no]').trigger('click');
            } else if (state.editor) {
                closeEditor();
            }
        });

        // ---------------------------------------------------------------- sessions
        function when(value) {
            var date = new Date(String(value).replace(' ', 'T') + 'Z');
            return isNaN(date) ? value : date.toLocaleString(lang, {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
        }

        function origin(row) {
            return row.referrer_host ? row.referrer_host : (parseInt(row.has_campaign, 10) ? T.Campaign : T.Direct);
        }

        function sessionRow(row) {
            var flagged = parseInt(row.flagged_legit, 10) === 1, hits = parseInt(row.hits, 10);
            var device = (row.device_type ? deviceName(row.device_type) : T.Unknown) + (row.device_model ? ' · ' + row.device_model : ' · ' + T.Generic);
            return '<div class="tsr-srow" data-id="' + row.idjournal + '" data-source="' + esc(row.source) + '" data-rule="' + row.idrule + '">'
                + '<div class="tsr-sline" role="button" tabindex="0" aria-expanded="false">'
                + '<span class="tsr-when">' + esc(when(row.last_seen)) + '<small>' + num(hits) + ' ' + esc(hits > 1 ? T.Pages : T.Page) + '</small></span>'
                + '<span class="tsr-by"><span class="tsr-by-name" title="' + esc(filterName(row)) + '">' + esc(filterName(row)) + '</span><span>' + badge(category(row)) + (flagged ? ' ' + badge('legit') : '') + '</span></span>'
                + '<span class="tsr-col-opt">' + esc(row.country ? countryName(row.country) : T.Unknown) + '</span>'
                + '<span class="tsr-col-opt">' + esc(String(row.resolution || '').replace('x', '×') || T.Unknown) + '</span>'
                + '<span class="tsr-col-opt">' + esc(origin(row)) + '</span>'
                + '<span class="tsr-col-opt">' + esc(device) + '</span>'
                + '<span class="tsr-chev" aria-hidden="true">›</span></div>'
                + '<div class="tsr-sdetail"><dl>'
                + '<dt>' + esc(T.DetailFilteredBy) + '</dt><dd>' + esc(row.source === 'official' ? T.Official + ' : ' + reasonName(row.reason) : filterName(row)) + '</dd>'
                + '<dt>' + esc(T.CondCountry) + '</dt><dd>' + esc(row.country ? countryName(row.country) : T.Unknown) + '</dd>'
                + '<dt>' + esc(T.CondResolution) + '</dt><dd>' + esc(row.resolution || T.Unknown) + '</dd>'
                + '<dt>' + esc(T.CondSource) + '</dt><dd>' + esc(origin(row)) + '</dd>'
                + '<dt>' + esc(T.CondDevice) + '</dt><dd>' + esc(device) + '</dd>'
                + '<dt>' + esc(T.DetailBrowser) + '</dt><dd>' + esc([row.browser, row.os].filter(Boolean).join(' / ') || T.Unknown) + '</dd>'
                + '<dt>' + esc(T.DetailEntry) + '</dt><dd>' + esc(row.url) + '</dd>'
                + '<dt>' + esc(T.DetailIp) + '</dt><dd>' + esc(row.ip_anon) + '</dd>'
                + '<dt>' + esc(T.DetailFirstSeen) + '</dt><dd>' + esc(row.first_seen) + ' ' + esc(T.Utc) + '</dd>'
                + '<dt>' + esc(T.DetailLastSeen) + '</dt><dd>' + esc(row.last_seen) + ' ' + esc(T.Utc) + '</dd></dl>'
                + '<div class="tsr-sactions"><button type="button" class="tsr-btn tsr-btn-sm' + (flagged ? '' : ' tsr-btn-primary') + '" data-legit="' + (flagged ? 0 : 1) + '" title="' + esc(T.LegitTitle) + '">'
                + esc(flagged ? T.Unflag : '✓ ' + T.Legit) + '</button>'
                + (row.source === 'rule' && findRule(row.idrule) ? '<button type="button" class="tsr-btn tsr-btn-sm" data-tighten>' + esc(T.TightenRule) + '</button>' : '')
                + '</div></div></div>';
        }

        function loadJournal(reset) {
            if (reset) {
                state.offset = 0;
            }
            var flagged = state.source === 'flagged', byRule = state.source === '' || state.source === 'rule';
            var request = ++state.journalRequest;
            api('getJournal', {
                idSite: state.site, limit: PAGE, offset: state.offset, source: flagged ? '' : state.source,
                idRule: byRule ? state.ruleFilter : 0, flagged: flagged ? 1 : 0
            }, function (rows) {
                if (request !== state.journalRequest) {
                    return; // a newer request was sent meanwhile: ignore this late answer
                }
                rows = rows || [];
                var html = rows.map(sessionRow).join('');
                if (reset) {
                    // keep the rows the user had unfolded open across a reload
                    var open = $('#tsr-journal .tsr-srow.is-open').map(function () {
                        return String($(this).data('id'));
                    }).get();
                    $('#tsr-journal').html(html || '<div class="tsr-empty">' + esc(T.NoData) + '</div>');
                    $('#tsr-journal .tsr-srow').each(function () {
                        if (open.indexOf(String($(this).data('id'))) !== -1) {
                            $(this).addClass('is-open').find('.tsr-sline').attr('aria-expanded', 'true');
                        }
                    });
                } else {
                    $('#tsr-journal').append(html);
                }
                state.offset += rows.length;
                $('#tsr-more').prop('hidden', rows.length < PAGE);
            });
        }

        function syncSessionFilters() {
            $('#tsr-source button').each(function () {
                $(this).toggleClass('is-on', String($(this).data('source')) === state.source);
            });
            $('#tsr-rule-filter').val(findRule(state.ruleFilter) ? state.ruleFilter : 0).prop('hidden', state.source === 'official' || state.source === 'flagged');
        }

        function toggleRow(line) {
            var row = $(line).closest('.tsr-srow'), open = !row.hasClass('is-open');
            row.toggleClass('is-open', open);
            $(line).attr('aria-expanded', open ? 'true' : 'false');
        }

        $('#tsr-journal').on('click', '.tsr-sline', function () {
            toggleRow(this);
        }).on('keydown', '.tsr-sline', function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggleRow(this);
            }
        }).on('click', '[data-legit]', function () {
            var row = $(this).closest('.tsr-srow'), legit = parseInt($(this).data('legit'), 10) === 1;
            var isRule = row.data('source') === 'rule', rule = findRule(row.data('rule'));
            api('flagLegit', {idJournal: row.data('id'), legit: legit ? 1 : 0}, function () {
                if (legit) {
                    $('#tsr-notice').html('<div class="tsr-notice"><span>' + esc(isRule ? T.LegitHintRule : T.LegitHintOfficial) + '</span>'
                        + (isRule && rule ? '<button type="button" class="tsr-btn tsr-btn-sm" data-rule="' + rule.idrule + '">' + esc(T.TightenRule) + '</button>' : '') + '</div>');
                } else {
                    $('#tsr-notice').empty();
                }
                loadJournal(true);
            });
        }).on('click', '[data-tighten]', function () {
            var rule = findRule($(this).closest('.tsr-srow').data('rule'));
            if (rule) {
                showTab('rules');
                openEditor(rule);
            }
        });
        $('#tsr-notice').on('click', '[data-rule]', function () {
            var rule = findRule($(this).data('rule'));
            if (rule) {
                showTab('rules');
                openEditor(rule);
            }
        });
        $('#tsr-source').on('click', 'button', function () {
            state.source = String($(this).data('source'));
            syncSessionFilters();
            loadJournal(true);
        });
        $('#tsr-rule-filter').on('change', function () {
            state.ruleFilter = parseInt($(this).val(), 10) || 0;
            loadJournal(true);
        });
        $('#tsr-more').on('click', function () {
            loadJournal(false);
        });

        // ---------------------------------------------------------------- tabs and scope
        function showTab(tab) {
            state.tab = tab;
            $('.tsr-tab').each(function () {
                $(this).attr('aria-selected', $(this).data('tab') === tab ? 'true' : 'false');
            });
            $('.tsr-panel').each(function () {
                $(this).prop('hidden', $(this).data('panel') !== tab);
            });
            $('#tsr-days').prop('hidden', tab !== 'overview');
            $('.tsr-scope').prop('hidden', tab === 'rules');
            try {
                window.sessionStorage.setItem('tsrTab', tab);
            } catch (e) {
                // storage unavailable: the tab is simply not remembered
            }
            if (tab === 'overview') {
                renderChart();
            }
        }

        $('.tsr-tab').on('click', function () {
            showTab($(this).data('tab'));
        });
        $('#tsr-days').on('click', 'button', function () {
            state.days = parseInt($(this).data('days'), 10);
            $('#tsr-days button').removeClass('is-on');
            $(this).addClass('is-on');
            loadCounts();
        });

        var siteOptions = '<option value="0">' + esc(T.AllSites) + '</option>';
        Object.keys(sites).forEach(function (idSite) {
            siteOptions += '<option value="' + esc(idSite) + '">' + esc(sites[idSite]) + '</option>';
        });
        $('#tsr-site').html(siteOptions).on('change', function () {
            state.site = parseInt($(this).val(), 10) || 0;
            loadCounts();
            loadJournal(true);
        });

        function refresh() {
            loadRules(function () {
                loadCounts();
                syncSessionFilters();
                loadJournal(true);
            });
            loadHealth();
        }

        var startTab = 'overview';
        try {
            startTab = window.sessionStorage.getItem('tsrTab') || 'overview';
        } catch (e) {
            // ignore
        }
        showTab(['overview', 'rules', 'sessions'].indexOf(startTab) === -1 ? 'overview' : startTab);
        refresh();
    });
})(jQuery);
