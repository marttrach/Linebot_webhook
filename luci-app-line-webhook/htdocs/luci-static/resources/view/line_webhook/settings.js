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

        return m.render();
    }
});
