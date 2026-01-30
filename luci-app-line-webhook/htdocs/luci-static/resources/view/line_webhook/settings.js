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
        o.value('local_llm', _('Local LLM'));
        o.value('remote_llm', _('Remote LLM API'));
        o.value('moltbot', _('Moltbot'));
        o.default = 'echo';
        o.rmempty = false;

        o = s.option(form.Value, 'local_llm_cmd', _('Local LLM command'),
            _('Executable for local LLM (text is sent via stdin). Example: /usr/bin/ollama'));
        o.depends('processor', 'local_llm');
        o.rmempty = false;

        o = s.option(form.Value, 'local_llm_args', _('Local LLM arguments'),
            _('Arguments appended to the command. Example: run llama3'));
        o.depends('processor', 'local_llm');
        o.placeholder = 'run llama3';

        o = s.option(form.Value, 'local_llm_timeout', _('Local LLM timeout (s)'),
            _('Max seconds to wait for the local LLM response'));
        o.depends('processor', 'local_llm');
        o.datatype = 'uinteger';
        o.placeholder = '20';

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
        o.placeholder = '15';

        o = s.option(form.Value, 'moltbot_url', _('Moltbot URL'),
            _('Moltbot chat endpoint (POST). Example: https://api.moltbot.ai/v1/chat'));
        o.depends('processor', 'moltbot');
        o.rmempty = false;

        o = s.option(form.Value, 'moltbot_token', _('Moltbot Token'),
            _('Bearer token for Moltbot Authorization header.'));
        o.password = true;
        o.depends('processor', 'moltbot');

        o = s.option(form.Value, 'moltbot_model', _('Moltbot model'),
            _('Optional model override sent as \"model\".'));
        o.depends('processor', 'moltbot');

        o = s.option(form.Value, 'moltbot_timeout', _('Moltbot timeout (s)'),
            _('Max seconds to wait for Moltbot.'));
        o.depends('processor', 'moltbot');
        o.datatype = 'uinteger';
        o.placeholder = '15';

        return m.render();
    }
});
