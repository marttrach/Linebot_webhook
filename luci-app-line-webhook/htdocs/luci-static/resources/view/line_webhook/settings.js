'use strict';
'require view';
'require form';
'require uci';
'require fs';
'require ui';
'require rpc';

var callServiceList = rpc.declare({
    object: 'service',
    method: 'list',
    params: ['name'],
    expect: { '': {} }
});

function getServiceStatus() {
    return L.resolveDefault(callServiceList('line_webhook'), {}).then(function (res) {
        var isRunning = false;
        try {
            isRunning = res['line_webhook']['instances']['instance1']['running'];
        } catch (e) { }
        return isRunning;
    });
}

function renderStatus(isRunning) {
    var spanTemp = '<span style="color:%s;font-weight:bold">%s</span>';
    var renderHTML;
    if (isRunning) {
        renderHTML = String.format(spanTemp, 'green', _('Running'));
    } else {
        renderHTML = String.format(spanTemp, 'red', _('Not Running'));
    }
    return renderHTML;
}

return view.extend({
    load: function () {
        return Promise.all([
            uci.load('line_webhook'),
            getServiceStatus()
        ]);
    },

    render: function (data) {
        var isRunning = data[1];
        var m, s, o;

        m = new form.Map('line_webhook', _('LINE Webhook'),
            _('Configure your LINE BOT webhook server. This service receives messages from LINE and can send replies.'));

        s = m.section(form.TypedSection, 'line_webhook', _('Service Status'));
        s.anonymous = true;

        o = s.option(form.DummyValue, '_status', _('Status'));
        o.rawhtml = true;
        o.cfgvalue = function () {
            return renderStatus(isRunning);
        };

        s = m.section(form.TypedSection, 'line_webhook', _('Basic Settings'));
        s.anonymous = true;

        o = s.option(form.Flag, 'enabled', _('Enable'),
            _('Enable the LINE Webhook server'));
        o.rmempty = false;

        o = s.option(form.Value, 'port', _('Port'),
            _('Port number for the webhook server (default: 5000)'));
        o.datatype = 'port';
        o.default = '5000';
        o.rmempty = false;

        o = s.option(form.Value, 'bind_address', _('Bind Address'),
            _('IP address to bind to (0.0.0.0 for all interfaces)'));
        o.datatype = 'ipaddr';
        o.default = '0.0.0.0';
        o.rmempty = false;

        o = s.option(form.ListValue, 'log_level', _('Log Level'),
            _('Set the logging verbosity. Debug mode shows maximum detail for troubleshooting.'));
        o.value('critical', _('Critical (致命)'));
        o.value('error', _('Error (錯誤)'));
        o.value('warning', _('Warning (警告)'));
        o.value('info', _('Info (資訊)'));
        o.value('debug', _('Debug (除錯)'));
        o.default = 'info';
        o.rmempty = false;

        s = m.section(form.TypedSection, 'line_webhook', _('TLS/SSL Settings'));
        s.anonymous = true;

        o = s.option(form.Flag, 'use_tls', _('Enable TLS'),
            _('Enable HTTPS with TLS 1.2+. Requires valid certificate and key files.'));
        o.rmempty = false;

        o = s.option(form.Value, 'tls_cert', _('TLS Certificate Path'),
            _('Path to the TLS certificate file (PEM format). Example: /etc/ssl/line_webhook/server.crt'));
        o.depends('use_tls', '1');
        o.default = '/etc/ssl/line_webhook/server.crt';
        o.rmempty = false;

        o = s.option(form.Value, 'tls_key', _('TLS Private Key Path'),
            _('Path to the TLS private key file (PEM format). Example: /etc/ssl/line_webhook/server.key'));
        o.depends('use_tls', '1');
        o.default = '/etc/ssl/line_webhook/server.key';
        o.rmempty = false;

        s = m.section(form.TypedSection, 'line_webhook', _('LINE API Credentials'));
        s.anonymous = true;

        o = s.option(form.Value, 'access_token', _('Channel Access Token'),
            _('Your LINE Channel Access Token from LINE Developers Console'));
        o.password = true;
        o.rmempty = false;

        o = s.option(form.Value, 'channel_secret', _('Channel Secret'),
            _('Your LINE Channel Secret from LINE Developers Console'));
        o.password = true;
        o.rmempty = false;

        s = m.section(form.TypedSection, 'line_webhook', _('Message Processing'));
        s.anonymous = true;

        o = s.option(form.ListValue, 'processor', _('Processor'),
            _('Choose how incoming text messages are handled.'));
        o.value('echo', _('Echo test'));
        o.value('remote_llm', _('Remote LLM API (Ollama)'));
        o.value('openclaw', _('OpenClaw'));
        o.default = 'echo';
        o.rmempty = false;

        o = s.option(form.Value, 'remote_api_url', _('Remote API URL'),
            _('Endpoint that accepts a JSON body with the user text.'));
        o.depends('processor', 'remote_llm');
        o.rmempty = false;

        o = s.option(form.Value, 'remote_api_key', _('Remote API Key'),
            _('Bearer token added to the Authorization header (optional if endpoint is public).'));
        o.password = true;
        o.depends('processor', 'remote_llm');

        o = s.option(form.Value, 'remote_api_model', _('Remote API model'),
            _('Optional model name sent as \"model\" in the payload.'));
        o.depends('processor', 'remote_llm');

        o = s.option(form.Value, 'remote_api_timeout', _('Remote API timeout (s)'),
            _('Max seconds to wait for the remote API.'));
        o.depends('processor', 'remote_llm');
        o.datatype = 'uinteger';
        o.placeholder = '60';

        o = s.option(form.Value, 'openclaw_url', _('OpenClaw URL'),
            _('OpenClaw chat endpoint (POST).'));
        o.depends('processor', 'openclaw');
        o.rmempty = false;

        o = s.option(form.Value, 'openclaw_token', _('OpenClaw Token'),
            _('Bearer token for OpenClaw Authorization header.'));
        o.password = true;
        o.depends('processor', 'openclaw');

        o = s.option(form.Value, 'openclaw_model', _('OpenClaw model'),
            _('Optional model override sent as \"model\".'));
        o.depends('processor', 'openclaw');

        o = s.option(form.Value, 'openclaw_timeout', _('OpenClaw timeout (s)'),
            _('Max seconds to wait for OpenClaw.'));
        o.depends('processor', 'openclaw');
        o.datatype = 'uinteger';
        o.placeholder = '60';

        s = m.section(form.TypedSection, 'line_webhook', _('Grafana Integration'));
        s.anonymous = true;
        s.description = _('Configure Grafana webhook alerts. Set Grafana contact point URL to: http://YOUR_SERVER:PORT/grafana');

        o = s.option(form.Value, 'grafana_user_id', _('LINE User ID'),
            _('The LINE user ID to receive Grafana alerts. Format: Uxxxxxxxx... (33 characters). You can get your user ID by sending a message to the bot and checking the logs.'));
        o.placeholder = 'Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
        o.validate = function(section_id, value) {
            if (!value || value === '') return true;
            if (!/^U[a-f0-9]{32}$/.test(value)) {
                return _('Invalid LINE User ID format. Must start with U followed by 32 hex characters.');
            }
            return true;
        };

        o = s.option(form.Value, 'grafana_secret', _('Webhook Secret'),
            _('Bearer token for authentication. In Grafana, set Authorization header to: Bearer YOUR_SECRET'));
        o.password = true;
        o.placeholder = _('Enter a random secret string');

        return m.render();
    }
});
